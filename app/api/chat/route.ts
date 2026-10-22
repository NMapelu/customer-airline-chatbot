import { createOpenAI } from '@ai-sdk/openai';
import { createUIMessageStream, createUIMessageStreamResponse, toUIMessageStream, type ToolSet } from 'ai';
import { z } from 'zod';
import { openConversation, recentTurns, saveMessage } from '@/lib/chat/history';
import { getChatSession } from '@/lib/chat-session';
import { sourcesFrom, streamAnswer } from '@/lib/rag/answer';
import { CHAT_MODEL, CHECK_MODEL, EMBEDDING_MODEL, HISTORY_TURNS, MAX_QUESTION_CHARS, SIMILARITY_THRESHOLD } from '@/lib/rag/config';
import { getContactDetails } from '@/lib/rag/contact';
import { maskPii } from '@/lib/rag/pii';
import { decide } from '@/lib/rag/pipeline';
import { escalationText, REFUSAL_TEXT, UNAVAILABLE_TEXT } from '@/lib/rag/prompts';
import type { ChatMessage, ChatMetadata } from '@/lib/rag/types';
import { customerWording } from '@/lib/rag/wording';
import { audit } from '@/lib/security/audit';
import { clientIp } from '@/lib/security/client-ip';
import { withinLimit } from '@/lib/security/rate-limit';

export const maxDuration = 30;

// The browser sends the conversation id and the new question only. Earlier turns are read from
// the database, so a client can't supply its own version of the conversation.
const bodySchema = z.object({
  id: z.uuid(),
  text: z.string(),
});

// A fixed reply (refusal or escalation) streamed like a normal answer, without calling the model.
function fixedReply(text: string, metadata: ChatMetadata) {
  const stream = createUIMessageStream<ChatMessage>({
    execute({ writer }) {
      writer.write({ type: 'start', messageMetadata: metadata });
      writer.write({ type: 'text-start', id: 'reply' });
      writer.write({ type: 'text-delta', id: 'reply', delta: text });
      writer.write({ type: 'text-end', id: 'reply' });
      writer.write({ type: 'finish' });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

const jsonError = (status: number, error: string) => Response.json({ error }, { status });

const answerText = (message: ChatMessage) => message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('');

// An agent's answer (US-33, US-34): the streamed handling steps, then the customer-ready wording
// as message metadata once both are done, then the save. As for customers, a failed or cut-off
// answer is not saved.
function agentAnswer(
  answer: ReturnType<typeof streamAnswer>['stream'],
  metadata: ChatMetadata,
  wording: Promise<string | null>,
  save: (text: string, customerWording: string | null) => Promise<void>,
) {
  const stream = createUIMessageStream<ChatMessage>({
    async execute({ writer }) {
      let finished: ChatMessage | null = null;
      const parts = toUIMessageStream<ToolSet, ChatMessage>({
        stream: answer,
        sendFinish: false,
        messageMetadata: ({ part }) => (part.type === 'start' ? metadata : undefined),
        onEnd({ outcome, finishReason, responseMessage }) {
          if (outcome.status === 'completed' && finishReason !== 'error') finished = responseMessage;
        },
      });
      const reader = parts.getReader();
      for (let next = await reader.read(); !next.done; next = await reader.read()) writer.write(next.value);

      const text = finished ? answerText(finished).trim() : '';
      if (!text) {
        writer.write({ type: 'finish' });
        return;
      }
      const customerWordingText = await wording;
      writer.write({ type: 'message-metadata', messageMetadata: { ...metadata, customerWording: customerWordingText } });
      writer.write({ type: 'finish' });
      try {
        await save(text, customerWordingText);
      } catch (error) {
        console.error('could not save the answer', error);
      }
    },
    onError: () => 'Sorry, something went wrong. Please try again.',
  });
  return createUIMessageStreamResponse({ stream });
}

// Request lifecycle, overview §8.2 steps 3–9 (steps 4–7 live in lib/rag/pipeline.ts).
export async function POST(req: Request) {
  // 3. Who is asking. No MFA-verified session, no chat.
  let session;
  try {
    session = await getChatSession();
  } catch (error) {
    console.error('could not create the chat session', error);
    return jsonError(503, 'The chat is not available right now.');
  }
  if (!session) return jsonError(401, 'Please sign in to use the chat.');

  // Rate limits (overview §10.8), before any model call: per user, and per IP address.
  if (!(await withinLimit('CHAT_USER_LIMITER', session.user.id)) || !(await withinLimit('CHAT_IP_LIMITER', clientIp(req.headers)))) {
    await audit(session.supabase, 'rate_limited', req.headers, 'chat');
    return jsonError(429, "You're sending messages too quickly. Please wait a minute and try again.");
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'Invalid request.');
  const { id: conversationId } = parsed.data;
  const question = parsed.data.text.trim();
  if (!question) return jsonError(400, 'Please type a question.');
  if (question.length > MAX_QUESTION_CHARS) {
    return jsonError(413, `Please keep your question under ${MAX_QUESTION_CHARS} characters.`);
  }

  // R7: mask personal details before the question goes to OpenAI or into the history.
  const { text: masked, found } = maskPii(question);
  const piiMasked = found.length > 0;

  const { env, supabase, role } = session;
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = openai(CHAT_MODEL);

  try {
    // 9. History: open (or create) the conversation, read the earlier turns, save the question.
    if (!(await openConversation(supabase, conversationId, role, masked))) return jsonError(404, 'Conversation not found.');
    const earlier = await recentTurns(supabase, conversationId, HISTORY_TURNS * 2 - 1);
    await saveMessage(supabase, conversationId, 'user', masked);
    const turns = [...earlier, { role: 'user' as const, text: masked }];

    const decision = await decide({
      model,
      checkModel: openai(CHECK_MODEL),
      embeddingModel: openai.embedding(EMBEDDING_MODEL),
      supabase,
      role,
      turns,
      threshold: SIMILARITY_THRESHOLD,
    });
    if (decision.kind === 'unavailable') {
      // Not saved: it says nothing about the question, and the user will likely ask again.
      return fixedReply(UNAVAILABLE_TEXT, { kind: 'unavailable', piiMasked });
    }
    if (decision.kind === 'refusal') {
      await saveMessage(supabase, conversationId, 'assistant', REFUSAL_TEXT);
      return fixedReply(REFUSAL_TEXT, { kind: 'refusal', piiMasked });
    }
    if (decision.kind === 'escalation') {
      if (decision.reason === 'blocked_staff') await audit(supabase, 'staff_content_blocked', req.headers);
      const text = escalationText(role, await getContactDetails(supabase));
      await saveMessage(supabase, conversationId, 'assistant', text);
      return fixedReply(text, { kind: 'escalation', piiMasked });
    }

    // 8. Grounded answer, with its sources attached as message metadata (R4).
    const sources = sourcesFrom(decision.chunks, decision.standalone);
    const metadata: ChatMetadata = { kind: 'answer', sources, piiMasked };
    const result = streamAnswer(model, role, decision.chunks, turns);
    if (role === 'agent') {
      // Started now, so it is usually ready when the answer ends. It only sees public passages.
      const wording = customerWording(model, decision.standalone, decision.chunks);
      return agentAnswer(result.stream, metadata, wording, (text, customerWordingText) =>
        saveMessage(supabase, conversationId, 'assistant', text, sources, customerWordingText),
      );
    }
    return createUIMessageStreamResponse({
      stream: toUIMessageStream<ToolSet, ChatMessage>({
        stream: result.stream,
        messageMetadata: ({ part }) => (part.type === 'start' ? metadata : undefined),
        // Saved once the answer has finished, before the response closes. A failed or cut-off
        // answer is not saved, so the history never holds half an answer.
        async onEnd({ outcome, finishReason, responseMessage }) {
          if (outcome.status !== 'completed' || finishReason === 'error') return;
          const text = answerText(responseMessage);
          if (!text.trim()) return;
          try {
            await saveMessage(supabase, conversationId, 'assistant', text, sources);
          } catch (error) {
            console.error('could not save the answer', error);
          }
        },
      }),
    });
  } catch (error) {
    console.error('chat request failed', error);
    return jsonError(500, 'Sorry, something went wrong. Please try again.');
  }
}
