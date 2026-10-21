import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeSchema, passwordSchema, signUpSchema } from './schemas';

test('passwords need 12 characters, both cases and a digit', () => {
  assert.ok(passwordSchema.safeParse('Strong-pass-123').success);
  assert.ok(passwordSchema.safeParse('Abcdefghij12').success);
  assert.ok(!passwordSchema.safeParse('Abcdefghi12').success, 'too short');
  assert.ok(!passwordSchema.safeParse('abcdefghij123').success, 'no upper case');
  assert.ok(!passwordSchema.safeParse('ABCDEFGHIJ123').success, 'no lower case');
  assert.ok(!passwordSchema.safeParse('Abcdefghijklm').success, 'no digit');
  assert.ok(!passwordSchema.safeParse(`Aa1${'é'.repeat(35)}`).success, 'over 72 bytes');
});

test('sign-up needs the two passwords to match', () => {
  const base = { email: 'someone@example.com', password: 'Strong-pass-123' };
  assert.ok(signUpSchema.safeParse({ ...base, confirm: 'Strong-pass-123' }).success);
  assert.ok(!signUpSchema.safeParse({ ...base, confirm: 'Strong-pass-124' }).success);
  assert.ok(!signUpSchema.safeParse({ ...base, email: 'not-an-email', confirm: 'Strong-pass-123' }).success);
});

test('authenticator codes are exactly six digits, spaces ignored', () => {
  assert.equal(codeSchema.parse('123456'), '123456');
  assert.equal(codeSchema.parse(' 123 456 '), '123456');
  for (const bad of ['12345', '1234567', '12a456', '']) assert.ok(!codeSchema.safeParse(bad).success, bad);
});
