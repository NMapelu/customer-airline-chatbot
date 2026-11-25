import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditCsv, auditEvent, auditRange, freshCodeUntil } from './accounts';

test('a code counts as fresh for 5 minutes', () => {
  const now = Date.UTC(2026, 10, 26, 9, 0, 0);
  const seconds = now / 1000;
  assert.equal(freshCodeUntil([{ method: 'totp', timestamp: seconds - 60 }], now), now - 60_000 + 300_000);
  assert.equal(freshCodeUntil([{ method: 'totp', timestamp: seconds - 301 }], now), null);
  assert.equal(freshCodeUntil([{ method: 'password', timestamp: seconds }], now), null);
  assert.equal(freshCodeUntil([], now), null);
  assert.equal(
    freshCodeUntil([{ method: 'totp', timestamp: seconds - 3600 }, { method: 'totp', timestamp: seconds - 10 }], now),
    now - 10_000 + 300_000,
  );
});

test('the CSV escapes quotes and commas and defuses spreadsheet formulas', () => {
  const csv = auditCsv([
    { at: '2026-11-26T09:00:00Z', event: 'sign_in', account: 'ne***@example.test', role: 'customer', ip: '196.201.214.0', detail: 'a, "b"' },
    { at: '2026-11-26T09:01:00Z', event: 'unknown_event', account: null, role: null, ip: null, detail: '=HYPERLINK("x")' },
  ]);
  const lines = csv.trimEnd().split('\r\n');
  assert.equal(lines[0], 'Time (UTC),Event,Account,Role,IP address,Detail');
  assert.equal(lines[1], '2026-11-26T09:00:00Z,Sign-in,ne***@example.test,customer,196.201.214.0,"a, ""b"""');
  assert.equal(lines[2], `2026-11-26T09:01:00Z,unknown_event,,,,"'=HYPERLINK(""x"")"`);
});

test('the audit filter falls back to the last 7 days and known events only', () => {
  const now = new Date('2026-11-26T09:00:00Z');
  assert.deepEqual(auditRange(undefined, undefined, now), { from: '2026-11-20', to: '2026-11-26' });
  assert.deepEqual(auditRange('2026-11-01', '2026-11-02', now), { from: '2026-11-01', to: '2026-11-02' });
  assert.deepEqual(auditRange("2026-11-01'; drop", ['x'], now), { from: '2026-11-20', to: '2026-11-26' });
  assert.equal(auditEvent('sign_in'), 'sign_in');
  assert.equal(auditEvent('toString'), null);
  assert.equal(auditEvent('nope'), null);
});
