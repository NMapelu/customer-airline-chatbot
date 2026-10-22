import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safeAnswerHref } from './links';

test('answer links are kept only for https pages on kenya-airways.com', () => {
  assert.equal(safeAnswerHref('https://www.kenya-airways.com/en-ke/baggage'), 'https://www.kenya-airways.com/en-ke/baggage');
  assert.equal(safeAnswerHref('https://asante.kenya-airways.com/'), 'https://asante.kenya-airways.com/');
  assert.equal(safeAnswerHref('https://kenya-airways.com'), 'https://kenya-airways.com/');
});

test('links anywhere else, or not over https, are dropped', () => {
  for (const url of [
    'http://www.kenya-airways.com/',
    'https://kenya-airways.com.evil.example/',
    'https://evilkenya-airways.com/',
    'https://www.kenya-airways.com@evil.example/',
    'https://user:pw@www.kenya-airways.com/',
    'javascript:alert(1)',
    'mailto:someone@example.com',
    '/relative/path',
    'not a url',
  ]) {
    assert.equal(safeAnswerHref(url), '', url);
  }
});
