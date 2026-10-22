import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnswerText } from '../../app/(chat)/answer-text';

// The chat's answer renderer (overview §7.8, threat model T3).
const render = (text: string) => renderToStaticMarkup(createElement(AnswerText, { text }));

test('bold, lists and tables are rendered for skimming', () => {
  const html = render('You may check **2 bags of 23 kg**.\n\n- One\n- Two\n\n| Cabin | Bags |\n|---|---|\n| Economy | 2 |\n| Business | 3 |');
  assert.match(html, /<strong>2 bags of 23 kg<\/strong>/);
  assert.match(html, /<li>One<\/li>/);
  assert.match(html, /<th[^>]*>Cabin<\/th>/);
  assert.match(html, /<td[^>]*>Business<\/td>/);
});

test('raw HTML in an answer is never rendered', () => {
  const html = render('Hi <script>alert(1)</script> <img src=x onerror=alert(1)> <b>bold</b> <iframe src="https://evil.example"></iframe>');
  assert.doesNotMatch(html, /<script|<img|<iframe|onerror|<b>/i);
});

test('only https links survive, and images and headings are not rendered', () => {
  const html = render('[ok](https://www.kenya-airways.com/) [bad](javascript:alert(1)) [http](http://example.com) ![x](https://example.com/x.png)\n\n# Title');
  assert.match(html, /href="https:\/\/www.kenya-airways.com\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
  assert.doesNotMatch(html, /javascript:|http:\/\/example|<img|<h1/);
  assert.match(html, /Title/);
});
