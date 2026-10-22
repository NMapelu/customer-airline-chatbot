import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { getChatSession } from '@/lib/chat-session';
import { buildChecklist } from '@/lib/rag/checklist';
import { CHAT_MODEL, CHECK_MODEL, EMBEDDING_MODEL, MAX_QUESTION_CHARS, SIMILARITY_THRESHOLD } from '@/lib/rag/config';
import { getContactDetails } from '@/lib/rag/contact';
import { maskPii } from '@/lib/rag/pii';
import { audit } from '@/lib/security/audit';
import { clientIp } from '@/lib/security/client-ip';
import { withinLimit } from '@/lib/security/rate-limit';

// One trip runs up to six topics through the pipeline.
export const maxDuration = 60;

const bodySchema = z.object({ trip: z.string() });
const jsonError = (status: number, error: string) => Response.json({ error }, { status });

// Pre-travel checklist (overview §7.10). Passengers only: agents have the chat for this. Nothing is
// saved, so the printed checklist holds the checklist and its sources and nothing else.
export async function POST(req: Request) {
  let session;
  try {
    session = await getChatSession();
  } catch (error) {
    console.error('could not create the chat session', error);
    return jsonError(503, 'The checklist is not available right now.');
  }
  if (!session) return jsonError(401, 'Please sign in to use the checklist.');
  if (session.role !== 'customer') return jsonError(403, 'The checklist is for passengers.');

  // Same limits as the chat (overview §10.8), before any model call.
  if (!(await withinLimit('CHAT_USER_LIMITER', session.user.id)) || !(await withinLimit('CHAT_IP_LIMITER', clientIp(req.headers)))) {
    await audit(session.supabase, 'rate_limited', req.headers, 'checklist');
    return jsonError(429, "You're sending requests too quickly. Please wait a minute and try again.");
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(400, 'Invalid request.');
  const trip = parsed.data.trip.trim();
  if (!trip) return jsonError(400, 'Please describe your trip.');
  if (trip.length > MAX_QUESTION_CHARS) return jsonError(413, `Please keep it under ${MAX_QUESTION_CHARS} characters.`);

  // R7: personal details are masked before anything reaches OpenAI.
  const { text: masked, found } = maskPii(trip);
  const { env, supabase } = session;
  const openai = createOpenAI({ apiKey: env.OPENAI_API_KEY });
  try {
    const checklist = await buildChecklist({
      model: openai(CHAT_MODEL),
      checkModel: openai(CHECK_MODEL),
      embeddingModel: openai.embedding(EMBEDDING_MODEL),
      supabase,
      trip: masked,
      threshold: SIMILARITY_THRESHOLD,
    });
    if (checklist.kind === 'unavailable') return jsonError(503, 'The checklist is not available right now. Please try again shortly.');
    const piiMasked = found.length > 0;
    if (checklist.kind === 'refusal') return Response.json({ kind: 'refusal', piiMasked });
    if (checklist.blockedStaff) await audit(supabase, 'staff_content_blocked', req.headers, 'checklist');
    const { sections, uncovered } = checklist;
    const contact = uncovered.length > 0 ? await getContactDetails(supabase) : null;
    return Response.json({ kind: 'checklist', sections, uncovered, contact, piiMasked });
  } catch (error) {
    console.error('checklist request failed', error);
    return jsonError(500, 'Sorry, something went wrong. Please try again.');
  }
}
