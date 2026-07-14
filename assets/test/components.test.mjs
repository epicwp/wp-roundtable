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

test('ChatPanel renders the configured agent name in header, greeting and composer', async () => {
  const { ChatPanel } = await import('../src/components.jsx');
  globalThis.window = { RoundtableConfig: { agentName: 'Nova', projectName: 'Acme Plugin' } };
  const html = renderToString(h(ChatPanel, {}));
  assert.match(html, /Nova/);
  assert.match(html, /Message Nova/);
  assert.match(html, /Ask how Acme Plugin works/);
  assert.doesNotMatch(html, /Sage/);
  assert.match(html, /Community assistant/);
  assert.match(html, /rt-agent-icon/);
  assert.match(html, /rt-cbox/);
  assert.match(html, /rt-chips/);
  assert.match(html, /Report a bug/);
});

test('Thread renders agent turn with agent avatar', () => {
  const turns = [{ role: 'agent', reply: 'hello', steps: [], error: false }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /rt-agent-turn/);
  assert.match(html, /rt-agent-icon/);
});

test('Thread renders step log under agent reply', () => {
  const turns = [{
    role: 'agent',
    reply: 'done',
    steps: [{ type: 'progress', data: { summary: 'Looking into it' } }],
    error: false,
  }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /rt-step-log/);
  assert.match(html, /Looking into it/);
});

test('Thread renders a user message as text', () => {
  const turns = [{ role: 'user', reply: 'hello', steps: [], error: false }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /hello/);
});
