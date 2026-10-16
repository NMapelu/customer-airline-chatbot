import { streamText, convertToModelMessages, type UIMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { getServerEnv } from '@/lib/env';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const openai = createOpenAI({ apiKey: getServerEnv().OPENAI_API_KEY });

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system:
      'You are a helpful airline travel assistant. Help with bookings, baggage, seats, cancellations, refunds, and airline queries.',
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
