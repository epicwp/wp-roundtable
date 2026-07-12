import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { Thread } from '../src/components.jsx';

// Node's test runner has no DOM; components.jsx reads window.RoundtableConfig
// at render time (browser-only global). Shim it so renderToString can run.
globalThis.window = globalThis;

test('Thread renders an agent reply as markdown', () => {
  const turns = [{ role: 'agent', reply: '**hi** there', steps: [], error: false }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /<strong>hi<\/strong>/);
});

test('Thread renders a user message as text', () => {
  const turns = [{ role: 'user', reply: 'hello', steps: [], error: false }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /hello/);
});
