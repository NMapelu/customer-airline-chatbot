import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contentSecurityPolicy, newNonce } from './headers';

test('the production CSP denies by default and allows only nonced scripts', () => {
  const csp = contentSecurityPolicy('abc123', false);
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self' 'nonce-abc123' 'strict-dynamic'(;|$)/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
});

test('eval and inline styles are allowed only in development, for its tools', () => {
  assert.match(contentSecurityPolicy('n', true), /'unsafe-eval'/);
  assert.match(contentSecurityPolicy('n', true), /style-src 'self' 'unsafe-inline'/);
  assert.match(contentSecurityPolicy('n', false), /style-src 'self' 'nonce-n'/);
});

test('nonces are fresh and long enough', () => {
  const a = newNonce();
  assert.notEqual(a, newNonce());
  assert.ok(Buffer.from(a, 'base64').length >= 16);
});
