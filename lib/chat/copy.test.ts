import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerWithSources } from './copy';

test('a copied answer ends with its source links', () => {
  const sources = [
    { title: 'Baggage', section: 'Checked', url: 'https://www.kenya-airways.com/baggage/', retrievedAt: null, audience: 'public' as const },
    { title: 'Contact', section: null, url: null, retrievedAt: null, audience: 'public' as const },
  ];
  assert.equal(
    answerWithSources('Two bags.', sources),
    'Two bags.\n\nSources:\n- Baggage: Checked (https://www.kenya-airways.com/baggage/)\n- Contact',
  );
  assert.equal(answerWithSources('No sources.', []), 'No sources.');
});
