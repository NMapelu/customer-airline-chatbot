import { redirect } from 'next/navigation';

// A new chat gets its own address straight away, so the page doesn't change under the user
// when the first answer arrives. The conversation is saved only once a question is sent.
export default function NewChat() {
  redirect(`/c/${crypto.randomUUID()}`);
}
