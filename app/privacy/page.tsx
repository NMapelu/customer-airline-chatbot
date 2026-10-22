import type { Metadata } from 'next';
import Link from 'next/link';
import { DISCLAIMER, PRIVACY_VERSION } from '@/lib/legal';

export const metadata: Metadata = { title: 'Privacy notice · KQ Policy Assistant' };

// Overview §11. Public, so it can be read before signing up.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 p-6 text-sm leading-6">
      <Link href="/" className="text-blue-700 underline">
        Back to the assistant
      </Link>
      <h1 className="text-2xl font-semibold">Privacy notice</h1>
      <p className="text-gray-600">Version {PRIVACY_VERSION}</p>
      <p>{DISCLAIMER}</p>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">What we collect</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your email address and password (the password is stored only as a secure hash).</li>
          <li>The authenticator app you set up for two-step sign-in.</li>
          <li>Your conversations: your questions and the assistant&apos;s answers, with the sources it used.</li>
          <li>
            Security records: sign-ins, failed attempts, authenticator changes and deletions, with the time and a
            shortened IP address. They never include your messages, passwords or codes.
          </li>
        </ul>
        <p>Nothing else. We don&apos;t use advertising or tracking cookies; the only cookies keep you signed in.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Why</h2>
        <p>
          Only to answer your questions about Kenya Airways policies, to keep your conversation history, and to keep
          the service and your account secure. Your consent when you create the account is the basis for this.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Please don&apos;t share sensitive details</h2>
        <p>
          Don&apos;t enter booking references, passport numbers, payment card details or medical information. The
          assistant doesn&apos;t need them, and it masks common formats of these before your question is stored or sent
          on, but it can&apos;t catch everything.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Who else processes your data</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>OpenAI</strong> receives your questions and the policy passages needed to answer them. Under its API
            terms it does not use them to train its models, but it may keep them for up to 30 days to monitor for abuse
            before deleting them.
          </li>
          <li>
            <strong>Supabase</strong> hosts the database and handles sign-in.
          </li>
          <li>
            <strong>Cloudflare</strong> hosts the website.
          </li>
        </ul>
        <p>They process data only on this service&apos;s behalf. Some of them store or process it outside Kenya.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">How long we keep it</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Conversations: 12 months after your last message in them, then deleted automatically.</li>
          <li>Security records: 12 months, then deleted automatically.</li>
          <li>Your account: until you delete it.</li>
        </ul>
        <p>Deleted data may stay in the hosting provider&apos;s backups until those backups expire.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Your rights</h2>
        <p>
          You can read all your conversations in the app, delete any of them, and delete your whole account in
          Settings. Deleting your account removes your conversations straight away and can&apos;t be undone. Security
          records are then kept without your email address. This follows the principles of Kenya&apos;s Data Protection
          Act, 2019.
        </p>
      </section>
    </main>
  );
}
