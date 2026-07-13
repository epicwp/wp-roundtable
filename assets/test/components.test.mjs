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

test('ChatPanel renders Sage header and composer', async () => {
  const { ChatPanel } = await import('../src/components.jsx');
  globalThis.window = { RoundtableConfig: { agentName: 'Sage' } };
  const html = renderToString(h(ChatPanel, {}));
  assert.match(html, /Sage/);
  assert.match(html, /Community assistant/);
  assert.match(html, /rt-cbox/);
});

test('Thread renders a user message as text', () => {
  const turns = [{ role: 'user', reply: 'hello', steps: [], error: false }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /hello/);
});
