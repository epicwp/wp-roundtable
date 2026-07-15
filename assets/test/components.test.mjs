import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { Thread, applyStreamEvent } from '../src/components.jsx';

// Node's test runner has no DOM; components.jsx reads window.RoundtableConfig
// at render time (browser-only global). Shim it so renderToString can run.
globalThis.window = globalThis;

test('Thread renders an agent reply as markdown', () => {
  const turns = [{ role: 'agent', reply: '**hi** there', steps: [], error: false }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /<strong>hi<\/strong>/);
});

test('ChatPanel renders Sage header, composer, and intro chips', async () => {
  const { ChatPanel } = await import('../src/components.jsx');
  globalThis.window = { RoundtableConfig: { agentName: 'Sage' } };
  const html = renderToString(h(ChatPanel, {}));
  assert.match(html, /Sage/);
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

test('Thread renders a collapsed activity summary after streaming', () => {
  const turns = [{
    role: 'agent', reply: 'because shortcodes run after translation',
    steps: [{ summary: 'Searching the code' }, { summary: 'Reading a file' }],
    done: true, error: false,
  }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /rt-activity/);
  assert.match(html, /2 stappen|2 steps/);
});

test('Thread renders the live activity line while streaming', () => {
  const turns = [{
    role: 'agent', reply: 'because short', steps: [{ summary: 'Reading a file' }],
    done: false, error: false,
  }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /Reading a file/);
});

test('applyStreamEvent accumulates guarded_text_delta onto the last agent turn reply', () => {
  const turns = [{ role: 'agent', reply: '', steps: [], done: false, error: false }];
  let t = applyStreamEvent(turns, { type: 'guarded_text_delta', text: 'Hel' });
  t = applyStreamEvent(t, { type: 'guarded_text_delta', text: 'lo' });
  assert.equal(t[0].reply, 'Hello');
});

test('applyStreamEvent pushes a step on progress', () => {
  const turns = [{ role: 'agent', reply: '', steps: [], done: false, error: false }];
  const t = applyStreamEvent(turns, { type: 'progress', summary: 'Searching the code' });
  assert.deepEqual(t[0].steps, [{ summary: 'Searching the code' }]);
});

test('applyStreamEvent marks done on result without stopping later delta accumulation, and ignores assistant_text', () => {
  let turns = [{ role: 'agent', reply: '', steps: [], done: false, error: false }];
  turns = applyStreamEvent(turns, { type: 'guarded_text_delta', text: 'because ' });
  turns = applyStreamEvent(turns, { type: 'guarded_text_delta', text: 'shortcodes' });
  turns = applyStreamEvent(turns, { type: 'assistant_text', text: 'because shortcodes' });
  turns = applyStreamEvent(turns, { type: 'result' });
  turns = applyStreamEvent(turns, { type: 'guarded_text_delta', text: ' run late' });
  assert.equal(turns[0].reply, 'because shortcodes run late');
  assert.equal(turns[0].done, true);
});

test('applyStreamEvent sets error state', () => {
  const turns = [{ role: 'agent', reply: '', steps: [], done: false, error: false }];
  const t = applyStreamEvent(turns, { type: 'error' });
  assert.equal(t[0].error, true);
});
