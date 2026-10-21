import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accessFor, type AuthStatus } from './access';

const ALL: AuthStatus[] = ['signed_out', 'needs_enrol', 'needs_verify', 'aal2', 'error'];

test('only AAL2 reaches the chat page, history and settings', () => {
  for (const path of ['/', '/c/6b1f0d2e-6a43-4a5e-9a7e-2f1b4d1c9e10', '/settings']) {
    assert.deepEqual(accessFor(path, 'aal2'), { action: 'allow' });
    assert.deepEqual(accessFor(path, 'signed_out'), { action: 'redirect', to: '/login' });
    assert.deepEqual(accessFor(path, 'needs_enrol'), { action: 'redirect', to: '/mfa/enroll' });
    assert.deepEqual(accessFor(path, 'needs_verify'), { action: 'redirect', to: '/mfa/verify' });
    assert.deepEqual(accessFor(path, 'error'), { action: 'deny', status: 503 });
  }
});

test('the chat API answers 401 below AAL2 and 503 when the check fails, never a redirect', () => {
  for (const path of ['/api/chat', '/api', '/api/anything']) {
    assert.deepEqual(accessFor(path, 'aal2'), { action: 'allow' });
    for (const status of ['signed_out', 'needs_enrol', 'needs_verify'] as const) {
      assert.deepEqual(accessFor(path, status), { action: 'deny', status: 401 });
    }
    assert.deepEqual(accessFor(path, 'error'), { action: 'deny', status: 503 });
  }
});

test('a path that only looks like the API is still a protected page', () => {
  assert.deepEqual(accessFor('/apix', 'signed_out'), { action: 'redirect', to: '/login' });
});

test('sign-in pages are for signed-out users, and stay open when the check fails', () => {
  for (const path of ['/login', '/signup']) {
    assert.deepEqual(accessFor(path, 'signed_out'), { action: 'allow' });
    assert.deepEqual(accessFor(path, 'error'), { action: 'allow' });
    assert.deepEqual(accessFor(path, 'aal2'), { action: 'redirect', to: '/' });
    assert.deepEqual(accessFor(path, 'needs_verify'), { action: 'redirect', to: '/mfa/verify' });
  }
});

test('each MFA page opens only at its own step', () => {
  assert.deepEqual(accessFor('/mfa/enroll', 'needs_enrol'), { action: 'allow' });
  assert.deepEqual(accessFor('/mfa/verify', 'needs_verify'), { action: 'allow' });
  // Someone with an authenticator can't enrol a second one without the code (US-13 goes through settings).
  assert.deepEqual(accessFor('/mfa/enroll', 'needs_verify'), { action: 'redirect', to: '/mfa/verify' });
  assert.deepEqual(accessFor('/mfa/verify', 'needs_enrol'), { action: 'redirect', to: '/mfa/enroll' });
  for (const path of ['/mfa/enroll', '/mfa/verify']) {
    assert.deepEqual(accessFor(path, 'signed_out'), { action: 'redirect', to: '/login' });
    assert.deepEqual(accessFor(path, 'aal2'), { action: 'redirect', to: '/' });
    assert.deepEqual(accessFor(path, 'error'), { action: 'deny', status: 503 });
  }
});

test('the email confirmation link is reachable in every state', () => {
  for (const status of ALL) assert.deepEqual(accessFor('/auth/confirm', status), { action: 'allow' });
});

test('no status other than aal2 is ever allowed onto a protected path', () => {
  for (const status of ALL.filter((s) => s !== 'aal2')) {
    for (const path of ['/', '/settings', '/api/chat', '/c/x', '/mfa', '/login/extra', '/auth/confirm/extra']) {
      assert.notDeepEqual(accessFor(path, status), { action: 'allow' }, `${status} ${path}`);
    }
  }
});
