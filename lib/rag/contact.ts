import type { SupabaseClient } from '@supabase/supabase-js';
import sources from '../../docs/sources.json';
import type { ContactDetails } from './prompts';

const CONTACT_SLUG = 'contact-us';
const FALLBACK_URL =
  (sources as { slug: string; url: string }[]).find((s) => s.slug === CONTACT_SLUG)?.url ??
  'https://www.kenya-airways.com/';

// The first Kenyan phone number in the text, like "+254 20 327 4747".
export function findPhone(text: string): string | null {
  const match = text.match(/\+254[\d ()-]{8,16}\d/);
  return match ? match[0].replace(/\s+/g, ' ').trim() : null;
}

// The escalation contact details (R2) come from the Contact Us document in the knowledge base,
// so they are kept in one place. If it can't be read, the reply still links the Contact page.
export async function getContactDetails(supabase: SupabaseClient): Promise<ContactDetails> {
  const { data, error } = await supabase
    .from('documents')
    .select('source_url, document_chunks(content)')
    .eq('slug', CONTACT_SLUG)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error('could not read the Contact Us document', error.message);
    return { phone: null, url: FALLBACK_URL };
  }
  const chunks = (data.document_chunks ?? []) as { content: string }[];
  const phone = chunks.map((c) => findPhone(c.content)).find((p) => p !== null) ?? null;
  return { phone, url: (data.source_url as string | null) ?? FALLBACK_URL };
}
