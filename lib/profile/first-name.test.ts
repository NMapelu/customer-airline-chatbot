import assert from 'node:assert/strict';
import { test } from 'node:test';
import { firstNameFromEmail } from './first-name';

test('takes the first part of the address and capitalises it', () => {
  assert.equal(firstNameFromEmail('neema.mapelu@example.com'), 'Neema');
  assert.equal(firstNameFromEmail('JOHN_DOE@example.com'), 'John');
  assert.equal(firstNameFromEmail('amina-k@example.com'), 'Amina');
  assert.equal(firstNameFromEmail('wanjiru+travel@example.com'), 'Wanjiru');
  assert.equal(firstNameFromEmail('2024otieno@example.com'), 'Otieno');
});

test('returns null when there is no name to use', () => {
  assert.equal(firstNameFromEmail('12345@example.com'), null);
  assert.equal(firstNameFromEmail(''), null);
  assert.equal(firstNameFromEmail(null), null);
  assert.equal(firstNameFromEmail(undefined), null);
});
