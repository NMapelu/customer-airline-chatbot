import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sortForSidebar, toSummary } from './history';

test('a row becomes a summary with pinned and archived flags', () => {
  assert.deepEqual(toSummary({ id: 'a', title: 'Bags', updated_at: '2026-11-17', pinned_at: '2026-11-17', archived_at: null }), {
    id: 'a',
    title: 'Bags',
    updatedAt: '2026-11-17',
    pinned: true,
    archived: false,
  });
  assert.equal(toSummary({ id: 'b', title: 'x', updated_at: '2026-11-17' }).pinned, false);
});

test('pinned conversations come first, then newest first', () => {
  const list = [
    toSummary({ id: 'old', title: '', updated_at: '2026-11-01' }),
    toSummary({ id: 'new', title: '', updated_at: '2026-11-17' }),
    toSummary({ id: 'pinned', title: '', updated_at: '2026-10-01', pinned_at: '2026-11-02' }),
  ];
  assert.deepEqual(sortForSidebar(list).map((c) => c.id), ['pinned', 'new', 'old']);
});
