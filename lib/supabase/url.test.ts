import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supabaseUrlSchema } from './url';

test('accepts a project URL and the local stack', () => {
  for (const url of ['https://abcd1234.supabase.co', 'https://abcd1234.supabase.co/', 'http://127.0.0.1:54321']) {
    assert.ok(supabaseUrlSchema.safeParse(url).success, url);
  }
});

test('rejects dashboard addresses, API paths and plain http', () => {
  for (const url of [
    'https://supabase.com/dashboard/project/abcd1234',
    'https://abcd1234.supabase.co/rest/v1/',
    'http://abcd1234.supabase.co',
    'abcd1234.supabase.co',
  ]) {
    assert.equal(supabaseUrlSchema.safeParse(url).success, false, url);
  }
});
