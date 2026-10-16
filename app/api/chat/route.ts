import { createOpenAI } from '@ai-sdk/openai';
import { createUIMessageStream, createUIMessageStreamResponse, toUIMessageStream, type ToolSet } from 'ai';
import { z } from 'zod';
import { getChatSession } from '@/lib/chat-session';
import { sourcesFrom, streamAnswer } from '@/lib/rag/answer';
import { CHAT_MODEL, EMBEDDING_MODEL, HISTORY_TURNS, MAX_QUESTION_CHARS, SIMILARITY_THRESHOLD } from '@/lib/rag/config';
import { getContactDetails } from '@/lib/rag/contact';
import { maskPii } from '@/lib/rag/pii';
import { decide } from '@/lib/rag/pipeline';
import { escalationText, REFUSAL_TEXT } from '@/lib/rag/prompts';
import type { ChatMessage, ChatMetadata, Turn } from '@/lib/rag/types';

export const maxDuration = 30;

// Only roles and text are read from the request; everything else is ignored.
const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        parts: z.array(z.looseObject({ type: z.string(), text: z.string().optional() })).max(50),
      }),
    )
    .min(1)
    .max(100),
});

const textOf = (parts: { type: string; text?: string }[]) =>
  parts
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('');

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

// Request lifecycle, overview §8.2 steps 3–8 (steps 4–7 live in lib/rag/pipeline.ts). Saving to history (step 9) arrives in Phase 8.
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

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'Invalid request.');
  const recent = parsed.data.messages.slice(-(HISTORY_TURNS * 2));
  const latest = recent.at(-1);
  if (!latest || latest.role !== 'user') return jsonError(400, 'Invalid request.');
  const question = textOf(latest.parts).trim();
  if (!question) return jsonError(400, 'Please type a question.');
  if (question.length > MAX_QUESTION_CHARS) {
    return jsonError(413, `Please keep your question under ${MAX_QUESTION_CHARS} characters.`);
  }

  // R7: mask personal details in everything that goes to OpenAI.
  let piiMasked = false;
  const turns: Turn[] = recent.map((m) => {
    const { text, found } = maskPii(textOf(m.parts).slice(0, 4000));
    if (m === latest && found.length > 0) piiMasked = true;
    return { role: m.role, text };
  });

  const { env, supabase, role } = session;
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  const model = openai(CHAT_MODEL);

  try {
    const decision = await decide({
      model,
      embeddingModel: openai.embedding(EMBEDDING_MODEL),
      supabase,
      role,
      turns,
      threshold: SIMILARITY_THRESHOLD,
    });
    if (decision.kind === 'refusal') return fixedReply(REFUSAL_TEXT, { kind: 'refusal', piiMasked });
    if (decision.kind === 'escalation') {
      const contact = await getContactDetails(supabase);
      return fixedReply(escalationText(role, contact), { kind: 'escalation', piiMasked });
    }

    // 8. Grounded answer, with its sources attached as message metadata (R4).
    const metadata: ChatMetadata = { kind: 'answer', sources: sourcesFrom(decision.chunks), piiMasked };
    const result = streamAnswer(model, role, decision.chunks, turns);
    return createUIMessageStreamResponse({
      stream: toUIMessageStream<ToolSet, ChatMessage>({
        stream: result.stream,
        messageMetadata: ({ part }) => (part.type === 'start' ? metadata : undefined),
      }),
    });
  } catch (error) {
    console.error('chat request failed', error);
    return jsonError(500, 'Sorry, something went wrong. Please try again.');
  }
}
