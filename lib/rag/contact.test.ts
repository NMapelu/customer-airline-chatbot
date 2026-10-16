import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findPhone } from './contact';

test('finds the first Kenyan phone number', () => {
  assert.equal(findPhone('Call our contact centre on +254 20 327 4747 or +254 711 024 747.'), '+254 20 327 4747');
  assert.equal(findPhone('| Kenya | +254-711-024747 |'), '+254-711-024747');
});

test('returns null when there is no phone number', () => {
  assert.equal(findPhone('Write to us using the online form.'), null);
});
