import { z } from 'zod';

// The Supabase project URL, like https://abcd1234.supabase.co, with nothing after the host.
// A dashboard address or one ending in /rest/v1/ fails here with a clear message, instead of
// failing later with a confusing "Invalid path" or an HTML page. http is allowed only for the
// local stack (`npx supabase start`).
const HINT = 'must be your project URL, like https://<ref>.supabase.co, with nothing after it';

export const supabaseUrlSchema = z.url({ error: HINT }).refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return (
    (url.protocol === 'https:' || (local && url.protocol === 'http:')) &&
    url.hostname !== 'supabase.com' &&
    url.pathname === '/' &&
    !url.search &&
    !url.hash
  );
}, HINT);
