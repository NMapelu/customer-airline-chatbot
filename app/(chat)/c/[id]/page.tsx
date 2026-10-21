import { notFound } from 'next/navigation';
import { z } from 'zod';
import { loadConversation } from '@/lib/chat/history';
import { createClient } from '@/lib/supabase/server';
import { Chat } from '../../chat';

// One conversation (US-11). An id with no saved conversation yet is a new, empty chat. Another
// user's conversation looks exactly the same, because RLS hides it, and sending to it fails.
export default async function ConversationPage({ params }: PageProps<'/c/[id]'>) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await createClient();
  const conversation = await loadConversation(supabase, id);
  return <Chat key={id} id={id} initialMessages={conversation?.messages ?? []} />;
}
