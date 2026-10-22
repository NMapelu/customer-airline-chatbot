import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientIp, truncateIp } from './client-ip';

test('the IP comes from the Cloudflare header only', () => {
  assert.equal(clientIp(new Headers({ 'cf-connecting-ip': '196.201.214.7' })), '196.201.214.7');
  assert.equal(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4' })), 'unknown');
});

test('audit entries keep only part of the address', () => {
  assert.equal(truncateIp('196.201.214.7'), '196.201.214.0');
  assert.equal(truncateIp('2c0f:fe38:2405:1234:abcd::1'), '2c0f:fe38:2405::');
  assert.equal(truncateIp('2c0f:fe38::1'), '2c0f:fe38::');
  assert.equal(truncateIp('unknown'), null);
});
