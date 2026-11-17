import assert from 'node:assert/strict';
import { test } from 'node:test';
import { memberFor } from './stats';

const now = new Date('2026-11-17T12:00:00Z');

test('says how long someone has been a member in friendly units', () => {
  assert.equal(memberFor('2026-11-17T08:00:00Z', now), 'Today');
  assert.equal(memberFor('2026-11-16T08:00:00Z', now), '1 day');
  assert.equal(memberFor('2026-11-07T12:00:00Z', now), '10 days');
  assert.equal(memberFor('2026-10-20T12:00:00Z', now), '4 weeks');
  assert.equal(memberFor('2026-06-17T12:00:00Z', now), '5 months');
  assert.equal(memberFor('2024-01-01T12:00:00Z', now), '2 years');
});

test('a date in the future counts as today', () => {
  assert.equal(memberFor('2026-12-01T00:00:00Z', now), 'Today');
});
