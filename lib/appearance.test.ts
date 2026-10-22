import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appearanceFrom } from './appearance';

test('display preferences come from user_metadata, with safe defaults', () => {
  assert.deepEqual(appearanceFrom({ theme: 'dark', text_size: 'large' }), { theme: 'dark', textSize: 'large' });
  assert.deepEqual(appearanceFrom(undefined), { theme: 'system', textSize: 'normal' });
  // Anything unknown, including values meant to break out of the attribute, is ignored.
  assert.deepEqual(appearanceFrom({ theme: '"><script>', text_size: 'toString' }), { theme: 'system', textSize: 'normal' });
});
