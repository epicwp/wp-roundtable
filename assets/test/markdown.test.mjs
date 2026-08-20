import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToPlainText, renderMarkdown } from '../src/markdown.js';

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

test('renders a typical agent reply: headings, numbered list, bullets, inline code', () => {
  const reply = [
    '## What happened',
    '',
    'The `pllat_max_output_tokens` option was set too low.',
    '',
    '### Steps to fix',
    '',
    '1. Open the plugin settings',
    '2. Raise the limit',
    '',
    'Also check:',
    '',
    '- the error log',
    '- the queue status',
  ].join('\n');
  const html = renderMarkdown(reply);
  assert.match(html, /<h2>What happened<\/h2>/);
  assert.match(html, /<h3>Steps to fix<\/h3>/);
  assert.match(html, /<ol>[\s\S]*<li>Open the plugin settings<\/li>[\s\S]*<li>Raise the limit<\/li>[\s\S]*<\/ol>/);
  assert.match(html, /<ul>[\s\S]*<li>the error log<\/li>[\s\S]*<li>the queue status<\/li>[\s\S]*<\/ul>/);
  assert.match(html, /<code>pllat_max_output_tokens<\/code>/);
});

test('renders an ordered list that starts past 1 with its start offset', () => {
  const html = renderMarkdown('3. third\n4. fourth');
  assert.match(html, /<ol start="3">/);
});

test('markdownToPlainText strips heading markers into readable text', () => {
  const text = markdownToPlainText('## Steps to reproduce\n\nEnable the plugin.');
  assert.equal(text, 'Steps to reproduce Enable the plugin.');
});

test('markdownToPlainText strips emphasis, inline code and link syntax but keeps their text', () => {
  const text = markdownToPlainText('**Bold** _soft_ `wp_option` and [docs](https://x.test/docs)');
  assert.equal(text, 'Bold soft wp_option and docs');
});

test('markdownToPlainText drops code fences but keeps the code text', () => {
  const text = markdownToPlainText('Before\n\n```php\necho 1;\n```\n\nAfter');
  assert.equal(text, 'Before echo 1; After');
});

test('markdownToPlainText strips list markers, blockquotes and horizontal rules', () => {
  const text = markdownToPlainText('- first\n* second\n1. third\n2) fourth\n\n---\n\n> quoted');
  assert.equal(text, 'first second third fourth quoted');
});

test('markdownToPlainText collapses whitespace and handles non-string input', () => {
  assert.equal(markdownToPlainText('a\n\n\nb   c'), 'a b c');
  assert.equal(markdownToPlainText(undefined), '');
});
