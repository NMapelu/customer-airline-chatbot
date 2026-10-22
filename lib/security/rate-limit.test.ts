import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkLimit, hashKey } from './rate-limit';

const quiet = () => {
  const original = console.error;
  console.error = () => {};
  return () => (console.error = original);
};

test('a request within the limit goes through, one over it does not', async () => {
  assert.equal(await checkLimit('T', { limit: async () => ({ success: true }) }, 'k'), true);
  assert.equal(await checkLimit('T', { limit: async () => ({ success: false }) }, 'k'), false);
});

test('a missing or failing limiter refuses the request (fail-safe)', async () => {
  const restore = quiet();
  try {
    assert.equal(await checkLimit('T', undefined, 'k'), false);
    assert.equal(await checkLimit('T', {}, 'k'), false);
    assert.equal(await checkLimit('T', { limit: async () => { throw new Error('down'); } }, 'k'), false);
    assert.equal(await checkLimit('T', { limit: async () => ({}) }, 'k'), false);
  } finally {
    restore();
  }
});

test('account keys are hashed, and the same for any case or spacing', async () => {
  const key = await hashKey('Someone@Example.com ');
  assert.equal(key, await hashKey('someone@example.com'));
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.ok(!key.includes('someone'));
});
