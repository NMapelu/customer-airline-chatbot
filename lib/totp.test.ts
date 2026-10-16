import assert from 'node:assert/strict';
import { test } from 'node:test';
import { base32Decode, totp } from './totp';

// RFC 6238 appendix B: the SHA-1 secret is the ASCII string "12345678901234567890".
const SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('decodes base32', () => {
  assert.equal(new TextDecoder().decode(base32Decode(SECRET)), '12345678901234567890');
});

test('matches the RFC 6238 test vectors', async () => {
  assert.equal(await totp(SECRET, 59_000, 8), '94287082');
  assert.equal(await totp(SECRET, 1_111_111_109_000, 8), '07081804');
  assert.equal(await totp(SECRET, 20_000_000_000_000, 8), '65353130');
  assert.equal(await totp(SECRET, 59_000), '287082');
});

test('rejects a secret that is not base32', () => {
  assert.throws(() => base32Decode('not-base32!'), /not valid base32/);
});
