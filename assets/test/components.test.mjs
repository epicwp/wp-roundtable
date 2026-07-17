import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import {
  Thread, applyStreamEvent, sendTurn, visibleSteps, stepDuration,
} from '../src/components.jsx';

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
  assert.match(html, /rt-head-text"><b>Nova<\/b>/);
  assert.match(html, /rt-name">Nova</);
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

test('Thread never shows the "Working on it" placeholder as the live activity line', () => {
  const turns = [{
    role: 'agent', reply: 'because short', steps: [{ summary: 'Working on it' }],
    done: false, error: false,
  }];
  const html = renderToString(h(Thread, { turns }));
  assert.doesNotMatch(html, /Working on it/);
  assert.doesNotMatch(html, /rt-activity-live/);
});

test('Thread live activity line falls through to the latest visible step past a leading "Working on it"', () => {
  const turns = [{
    role: 'agent',
    reply: 'because short',
    steps: [{ summary: 'Working on it' }, { summary: 'Reading a file' }],
    done: false,
    error: false,
  }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /Reading a file/);
  assert.doesNotMatch(html, /Working on it/);
});

test('Thread renders a thinking indicator for an empty in-flight agent turn', () => {
  const turns = [{ role: 'agent', reply: '', steps: [], done: false, error: false }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /rt-thinking/);
});

test('Thread renders a timestamp when turn.at is set', () => {
  const turns = [{ role: 'user', reply: 'hello', steps: [], error: false, at: 1700000000000 }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /rt-time/);
});

test('applyStreamEvent accumulates guarded_text_delta onto the last agent turn reply', () => {
  const turns = [{ role: 'agent', reply: '', steps: [], done: false, error: false }];
  let t = applyStreamEvent(turns, { type: 'guarded_text_delta', text: 'Hel' }, 1000);
  t = applyStreamEvent(t, { type: 'guarded_text_delta', text: 'lo' }, 1010);
  assert.equal(t[0].reply, 'Hello');
});

test('applyStreamEvent pushes a timestamped step on progress', () => {
  const turns = [{ role: 'agent', reply: '', steps: [], done: false, error: false }];
  const t = applyStreamEvent(turns, { type: 'progress', summary: 'Searching the code' }, 1234);
  assert.deepEqual(t[0].steps, [{ summary: 'Searching the code', at: 1234 }]);
});

test('applyStreamEvent marks done with doneAt on result without stopping later delta accumulation, and does not let assistant_text overwrite a delta-built reply', () => {
  let turns = [{ role: 'agent', reply: '', steps: [], done: false, error: false }];
  turns = applyStreamEvent(turns, { type: 'guarded_text_delta', text: 'because ' }, 100);
  turns = applyStreamEvent(turns, { type: 'guarded_text_delta', text: 'shortcodes' }, 110);
  turns = applyStreamEvent(turns, { type: 'assistant_text', text: 'TOTALLY DIFFERENT TEXT' }, 115);
  turns = applyStreamEvent(turns, { type: 'result' }, 120);
  turns = applyStreamEvent(turns, { type: 'guarded_text_delta', text: ' run late' }, 130);
  assert.equal(turns[0].reply, 'because shortcodes run late');
  assert.equal(turns[0].finalText, 'TOTALLY DIFFERENT TEXT');
  assert.equal(turns[0].done, true);
  assert.equal(turns[0].doneAt, 120);
  assert.equal(turns[0].error, false);
});

test('applyStreamEvent falls back to assistant_text as reply when a turn ends with no deltas (refusal / no-stream case)', () => {
  let turns = [{ role: 'agent', reply: '', steps: [], done: false, error: false }];
  turns = applyStreamEvent(turns, { type: 'assistant_text', text: 'I can only help with questions about this community.' }, 100);
  turns = applyStreamEvent(turns, { type: 'result' }, 110);
  assert.equal(turns[0].reply, 'I can only help with questions about this community.');
  assert.equal(turns[0].reply, turns[0].finalText);
  assert.equal(turns[0].done, true);
  assert.equal(turns[0].doneAt, 110);
});

test('applyStreamEvent flags a result with is_error:true as done, error, and doneAt', () => {
  const turns = [{ role: 'agent', reply: 'oops', steps: [], done: false, error: false }];
  const t = applyStreamEvent(turns, { type: 'result', is_error: true }, 555);
  assert.equal(t[0].done, true);
  assert.equal(t[0].error, true);
  assert.equal(t[0].doneAt, 555);
});

test('applyStreamEvent sets error state', () => {
  const turns = [{ role: 'agent', reply: '', steps: [], done: false, error: false }];
  const t = applyStreamEvent(turns, { type: 'error' }, 999);
  assert.equal(t[0].error, true);
});

test('visibleSteps drops the "Working on it" placeholder and keeps real steps', () => {
  const steps = [
    { summary: 'Working on it', at: 1 },
    { summary: 'Searching the code', at: 2 },
    { summary: 'Reading a file', at: 3 },
  ];
  assert.deepEqual(visibleSteps(steps), [
    { summary: 'Searching the code', at: 2 },
    { summary: 'Reading a file', at: 3 },
  ]);
});

test('visibleSteps returns an empty array when only "Working on it" was ever recorded', () => {
  assert.deepEqual(visibleSteps([{ summary: 'Working on it', at: 1 }]), []);
});

test('stepDuration formats sub-second gaps in ms and second-plus gaps in one-decimal seconds', () => {
  assert.equal(stepDuration({ at: 1000 }, 1080), '80ms');
  assert.equal(stepDuration({ at: 1000 }, 2200), '1.2s');
});

test('stepDuration returns null when a timestamp is missing', () => {
  assert.equal(stepDuration({ at: 1000 }, undefined), null);
  assert.equal(stepDuration({}, 2000), null);
});

function fakeState(initial) {
  let value = initial;
  const set = (updater) => { value = typeof updater === 'function' ? updater(value) : updater; };
  return [() => value, set];
}

test('sendTurn falls back to the buffered endpoint when onError fires before any stream event arrives', async () => {
  const [getTurns, setTurns] = fakeState([]);
  const [getBusy, setBusy] = fakeState(false);

  const streamFn = async (text, { onError }) => { onError(); };
  const sendFn = async (text) => ({
    events: [
      { type: 'assistant_text', data: { text: 'Fallback reply' } },
      { type: 'tool_step', data: { summary: 'Searched the code' } },
      { type: 'progress', data: { summary: 'Read a file' } },
      { type: 'result', data: { subtype: 'success' } },
    ],
  });

  await sendTurn('Where is X defined?', { setTurns, setBusy, streamFn, sendFn });

  const turns = getTurns();
  const last = turns[turns.length - 1];
  assert.equal(last.reply, 'Fallback reply');
  assert.equal(last.done, true);
  assert.equal(last.error, false);
  assert.deepEqual(last.steps, [{ summary: 'Searched the code' }, { summary: 'Read a file' }]);
  assert.equal(getBusy(), false);
});

test('sendTurn does not fall back once a stream event already arrived — a later onError just ends the turn in error state', async () => {
  const [getTurns, setTurns] = fakeState([]);
  const [getBusy, setBusy] = fakeState(false);

  let sendFnCalled = false;
  const streamFn = async (text, { onEvent, onError }) => {
    onEvent({ type: 'guarded_text_delta', text: 'partial' });
    onError();
  };
  const sendFn = async () => { sendFnCalled = true; return { events: [] }; };

  await sendTurn('Where is X defined?', { setTurns, setBusy, streamFn, sendFn });

  const turns = getTurns();
  const last = turns[turns.length - 1];
  assert.equal(sendFnCalled, false);
  assert.equal(last.reply, 'partial');
  assert.equal(last.error, true);
  assert.equal(getBusy(), false);
});

test('sendTurn ends the turn in an error state when the buffered fallback throws', async () => {
  const [getTurns, setTurns] = fakeState([]);
  const [getBusy, setBusy] = fakeState(false);

  const streamFn = async (text, { onError }) => { onError(); };
  const sendFn = async () => { throw new Error('network down'); };

  await sendTurn('Where is X defined?', { setTurns, setBusy, streamFn, sendFn });

  const turns = getTurns();
  const last = turns[turns.length - 1];
  assert.equal(last.error, true);
  assert.equal(last.done, true);
  assert.equal(getBusy(), false);
});

test('sendTurn ends the turn in an error state when the buffered fallback returns { error }', async () => {
  const [getTurns, setTurns] = fakeState([]);
  const [getBusy, setBusy] = fakeState(false);

  const streamFn = async (text, { onError }) => { onError(); };
  const sendFn = async () => ({ error: { kind: 'http_502' } });

  await sendTurn('Where is X defined?', { setTurns, setBusy, streamFn, sendFn });

  const turns = getTurns();
  const last = turns[turns.length - 1];
  assert.equal(last.error, true);
  assert.equal(last.done, true);
  assert.equal(getBusy(), false);
});

test('sendTurn falls back when no stream event arrives within timeout', async () => {
  const [getTurns, setTurns] = fakeState([]);
  const [getBusy, setBusy] = fakeState(false);

  // Stream function that listens to abort but never emits events.
  // When abort fires (from the timeout), it calls onError to trigger fallback.
  const streamFn = async (text, { signal, onError }) => {
    return new Promise((resolve) => {
      signal.addEventListener('abort', () => {
        onError();
        resolve();
      });
    });
  };

  const sendFn = async (text) => ({
    events: [
      { type: 'assistant_text', data: { text: 'Timeout fallback reply' } },
      { type: 'result', data: { subtype: 'success' } },
    ],
  });

  // Use timeoutMs=0 to trigger abort on next event loop iteration
  await sendTurn('Test message', { setTurns, setBusy, streamFn, sendFn, timeoutMs: 0 });

  const turns = getTurns();
  const last = turns[turns.length - 1];
  assert.equal(last.reply, 'Timeout fallback reply');
  assert.equal(last.done, true);
  assert.equal(last.error, false);
  assert.equal(getBusy(), false);
});
