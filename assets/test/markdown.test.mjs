import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/markdown.js';

test('renders basic markdown', () => {
  const html = renderMarkdown('**bold** and `code`');
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
});

test('escapes raw HTML in input (no live script)', () => {
  const html = renderMarkdown('<script>alert(1)</script>');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('highlights fenced code', () => {
  const html = renderMarkdown('```js\nconst x = 1;\n```');
  assert.match(html, /rt-ccode/);
  assert.match(html, /rt-ccode-copy/);
  assert.match(html, /hljs/);
});

test('neutralizes javascript: links', () => {
  const html = renderMarkdown('[x](javascript:alert(1))');
  assert.doesNotMatch(html, /href="javascript:/);
});
