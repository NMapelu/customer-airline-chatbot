import assert from 'node:assert/strict';
import { test } from 'node:test';
import { maskPii } from './pii';

test('masks a valid card number but keeps other long numbers', () => {
  const { text, found } = maskPii('My card is 4111 1111 1111 1111, charged twice.');
  assert.equal(text, 'My card is [card number removed], charged twice.');
  assert.deepEqual(found, ['card']);
});

test('masks passport numbers', () => {
  assert.equal(maskPii('Passport AK1234567 expires soon').text, 'Passport [passport number removed] expires soon');
});

test('masks phone numbers in common formats', () => {
  assert.equal(maskPii('Call me on +254 712 345 678').text, 'Call me on [phone number removed]');
  assert.equal(maskPii('my number is 0712-345-678').text, 'my number is [phone number removed]');
});

test('masks booking references, labelled or not', () => {
  assert.equal(maskPii('booking ref: abc12d').text, 'booking ref: [booking reference removed]');
  assert.equal(maskPii('PNR XKQWPZ please').text, 'PNR [booking reference removed] please');
  assert.equal(maskPii('My booking is X7KQ2P').text, 'My booking is [booking reference removed]');
});

test('keeps ordinary policy questions unchanged', () => {
  for (const q of [
    'How many 23 kg bags can I check in on KQ1234 to London?',
    'Is the fee KES 3,500 or USD 50 for flights on 2026-10-16?',
    'What is the BAGGAGE allowance in ECONOMY?',
    'Can I fly at 32 weeks pregnant?',
  ]) {
    const { text, found } = maskPii(q);
    assert.equal(text, q);
    assert.deepEqual(found, []);
  }
});
