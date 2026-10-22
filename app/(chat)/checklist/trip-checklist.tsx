'use client';

import { useState } from 'react';
import { DISCLAIMER } from '@/lib/legal';
import type { ChecklistSection } from '@/lib/rag/checklist';
import type { ContactDetails } from '@/lib/rag/prompts';

type Result =
  | { kind: 'checklist'; sections: ChecklistSection[]; uncovered: string[]; contact: ContactDetails | null; piiMasked: boolean }
  | { kind: 'refusal'; piiMasked: boolean };

const today = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// Overview §7.10: one message about the trip, one checklist built from the policies, each section
// citing its sources. "Save as PDF" uses the browser's print dialog; the print layout shows the
// checklist and its sources only.
export function TripChecklist() {
  const [trip, setTrip] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function build() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch('/api/checklist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trip }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) setError(typeof body?.error === 'string' ? body.error : 'Sorry, something went wrong. Please try again.');
      else setResult(body as Result);
    } catch {
      setError('Sorry, something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto px-4 py-6 print:overflow-visible">
      <h1 className="text-2xl font-semibold">Pre-travel checklist</h1>
      <form
        className="space-y-2 print:hidden"
        onSubmit={(e) => {
          e.preventDefault();
          if (trip.trim() && !busy) build();
        }}
      >
        <label htmlFor="trip" className="block text-sm">
          Describe your trip in one message, for example: &ldquo;I&apos;m flying Nairobi to Dubai with my cat and I need a
          wheelchair.&rdquo;
        </label>
        <textarea
          id="trip"
          className="w-full rounded border border-gray-300 bg-surface p-2"
          rows={3}
          maxLength={1000}
          value={trip}
          onChange={(e) => setTrip(e.target.value)}
          disabled={busy}
        />
        <p className="text-xs text-gray-500">Please don&apos;t share booking references, passport, card or medical details.</p>
        <button type="submit" disabled={busy || !trip.trim()} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? 'Building your checklist…' : 'Build my checklist'}
        </button>
      </form>

      {error && (
        <p role="alert" className="rounded bg-red-100 px-3 py-2 text-red-800">
          {error}
        </p>
      )}
      {result?.piiMasked && (
        <p className="text-xs text-amber-800 print:hidden">We hid what looked like personal details in your message before processing it.</p>
      )}
      {result?.kind === 'refusal' && (
        <p>I can only build a checklist for a trip with Kenya Airways. Please describe where you are flying and anything special about your trip.</p>
      )}
      {result?.kind === 'checklist' && (
        <section aria-label="Your checklist" className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-gray-600">Built on {today()} from Kenya Airways policies.</p>
            <button type="button" onClick={() => window.print()} className="rounded border border-gray-400 bg-surface px-3 py-1 text-sm print:hidden">
              Save as PDF
            </button>
          </div>
          {result.sections.map((s) => (
            <div key={s.topic} className="break-inside-avoid rounded border border-gray-300 p-3">
              <h2 className="font-semibold">{s.topic}</h2>
              <ul className="mt-1 space-y-1">
                {s.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden="true">☐</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs font-semibold text-gray-700">Sources</p>
              <ul className="text-xs text-gray-700">
                {s.sources.map((src) => {
                  const label = src.section ? `${src.title}: ${src.section}` : src.title;
                  return (
                    <li key={label}>
                      {src.url?.startsWith('https://') ? (
                        <a href={src.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
                          {label}
                        </a>
                      ) : (
                        label
                      )}
                      {/* The address itself, so it survives printing. */}
                      {src.url && <span className="hidden break-all print:inline"> ({src.url})</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {result.uncovered.length > 0 && (
            <div className="break-inside-avoid rounded border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <h2 className="font-semibold">Check these with Kenya Airways</h2>
              <p className="text-sm">I don&apos;t have these in my knowledge base:</p>
              <ul className="ml-5 list-disc text-sm">
                {result.uncovered.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {result.contact && (
                <p className="mt-1 text-sm">
                  Contact Kenya Airways customer service: {result.contact.phone ? `${result.contact.phone}, ` : ''}
                  <span className="break-all">{result.contact.url}</span>
                </p>
              )}
            </div>
          )}
          <p className="text-xs text-gray-500">{DISCLAIMER}</p>
        </section>
      )}
    </div>
  );
}
