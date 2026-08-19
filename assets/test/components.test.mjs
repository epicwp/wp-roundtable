import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import {
  Thread, applyStreamEvent, sendTurn, visibleSteps, stepDuration, reduceSignal, computeShowDraftPrompt, reduceScrollEvent, composeFinal,
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

test('ChatPanel renders the configured initial message instead of the generated greeting when set', async () => {
  const { ChatPanel } = await import('../src/components.jsx');
  globalThis.window = {
    RoundtableConfig: { agentName: 'Nova', projectName: 'Acme Plugin', initialMessage: 'Welcome to Acme support!' },
  };
  const html = renderToString(h(ChatPanel, {}));
  assert.match(html, /Welcome to Acme support!/);
  assert.doesNotMatch(html, /Ask how Acme Plugin works/);
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
  assert.deepEqual(turns[0].finalBlocks, [{ text: 'TOTALLY DIFFERENT TEXT', startStep: 0 }]);
  assert.equal(turns[0].done, true);
  assert.equal(turns[0].doneAt, 120);
  assert.equal(turns[0].error, false);
});

test('applyStreamEvent falls back to assistant_text as reply when a turn ends with no deltas (refusal / no-stream case)', () => {
  let turns = [{ role: 'agent', reply: '', steps: [], done: false, error: false }];
  turns = applyStreamEvent(turns, { type: 'assistant_text', text: 'I can only help with questions about this community.' }, 100);
  turns = applyStreamEvent(turns, { type: 'result' }, 110);
  assert.equal(turns[0].reply, 'I can only help with questions about this community.');
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

test('sendTurn recovers a tail-truncated reply from finalText when the stream ends (lost trailing deltas)', async () => {
  const [getTurns, setTurns] = fakeState([]);
  const [getBusy, setBusy] = fakeState(false);

  const full = 'Of course! Go ahead — what would you like to know?';
  const streamFn = async (text, { onEvent, onDone }) => {
    onEvent({ type: 'guarded_text_delta', text: 'Of course! Go ahead — what would y' });
    onEvent({ type: 'assistant_text', text: full });
    onEvent({ type: 'result' });
    onDone();
  };

  await sendTurn('Can I ask something else?', { setTurns, setBusy, streamFn, sendFn: async () => ({ events: [] }) });

  const turns = getTurns();
  const last = turns[turns.length - 1];
  assert.equal(last.reply, full);
  assert.equal(last.done, true);
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

test('sendTurn does not push a user bubble when trigger is set', async () => {
  const turnsLog = [];
  let turns = [];
  const setTurns = (fn) => { turns = typeof fn === 'function' ? fn(turns) : fn; turnsLog.push(turns); };
  const streamFn = async (text, { onEvent, onDone }) => { onDone(); };

  await sendTurn('', { setTurns, setBusy: () => {}, streamFn, trigger: 'create_topic' });

  assert.equal(turns.filter((t) => t.role === 'user').length, 0);
  assert.equal(turns.filter((t) => t.role === 'agent').length, 1);
});

test('sendTurn pushes a user bubble when trigger is not set', async () => {
  let turns = [];
  const setTurns = (fn) => { turns = typeof fn === 'function' ? fn(turns) : fn; };
  const streamFn = async (text, { onDone }) => { onDone(); };

  await sendTurn('hello', { setTurns, setBusy: () => {}, streamFn });

  assert.equal(turns.filter((t) => t.role === 'user').length, 1);
});

test('sendTurn forwards topic_worthy events to onSignal, not applyStreamEvent', async () => {
  let turns = [];
  const setTurns = (fn) => { turns = typeof fn === 'function' ? fn(turns) : fn; };
  const signals = [];
  const streamFn = async (text, { onEvent, onDone }) => {
    onEvent({ type: 'topic_worthy', case_type_hint: 'bug', rationale: 'clear repro' });
    onDone();
  };

  await sendTurn('hello', { setTurns, setBusy: () => {}, streamFn, onSignal: (ev) => signals.push(ev) });

  assert.equal(signals.length, 1);
  assert.equal(signals[0].type, 'topic_worthy');
});

test('sendTurn forwards topic_drafted events to onSignal', async () => {
  let turns = [];
  const setTurns = (fn) => { turns = typeof fn === 'function' ? fn(turns) : fn; };
  const signals = [];
  const streamFn = async (text, { onEvent, onDone }) => {
    onEvent({ type: 'topic_drafted', case_id: 'c1', case_type: 'bug', title: 'T', summary: 'S' });
    onDone();
  };

  await sendTurn('hello', { setTurns, setBusy: () => {}, streamFn, onSignal: (ev) => signals.push(ev) });

  assert.equal(signals.length, 1);
  // Streaming path: onSignal receives the flat shape verbatim (no `.data` nesting) --
  // see Task 20 Step 3's note on the two transports' different wire shapes.
  assert.equal(signals[0].case_id, 'c1');
});

test('sendTurn passes trigger through to streamFn', async () => {
  let capturedTrigger;
  const streamFn = async (text, { onDone, trigger }) => { capturedTrigger = trigger; onDone(); };

  await sendTurn('', { setTurns: () => {}, setBusy: () => {}, streamFn, trigger: 'create_topic' });

  assert.equal(capturedTrigger, 'create_topic');
});

test('applyStreamEvent leaves turns unchanged for topic_worthy (handled via onSignal, not turns)', () => {
  const turns = [{ role: 'agent', reply: '', steps: [], done: false, error: false }];
  const next = applyStreamEvent(turns, { type: 'topic_worthy', case_type_hint: 'bug', rationale: 'x' }, Date.now());
  assert.deepEqual(next, turns);
});

// The gating decision behind ChatPanel's "Create topic" affordance is exercised
// directly via the pure functions it's built from (reduceSignal, computeShowDraftPrompt),
// rather than through a rendering-level ChatPanel test: this file's only ChatPanel-rendering
// tool is `preact-render-to-string`, a one-shot SSR pass with no DOM and no event dispatch,
// so there's no way to drive ChatPanel from "before topic_worthy" to "after topic_worthy"
// through simulated interaction. Testing the pure decision functions directly covers the
// same logic without that infrastructure gap.

test('reduceSignal makes the affordance visible on a topic_worthy signal', () => {
  const next = reduceSignal({ topicWorthy: false, topicDraft: null }, { type: 'topic_worthy', case_type_hint: 'bug', rationale: 'x' });
  assert.equal(next.topicWorthy, true);
  assert.equal(next.topicDraft, null);
});

test('computeShowDraftPrompt hides the affordance in ordinary chat before any topic_worthy signal', () => {
  const showDraftPrompt = computeShowDraftPrompt({
    topicDraft: null, newTopicMode: false, topicWorthy: false, turns: [],
  });
  assert.equal(showDraftPrompt, false);
});

test('computeShowDraftPrompt shows the affordance in ordinary chat once topicWorthy is true', () => {
  const showDraftPrompt = computeShowDraftPrompt({
    topicDraft: null, newTopicMode: false, topicWorthy: true, turns: [],
  });
  assert.equal(showDraftPrompt, true);
});

test('reduceSignal produces the draft state and clears topicWorthy on a topic_drafted signal (flat streaming wire shape)', () => {
  const next = reduceSignal(
    { topicWorthy: true, topicDraft: null },
    {
      type: 'topic_drafted', case_id: 'c1', case_type: 'bug', title: 'T', summary: 'S',
    },
  );
  assert.equal(next.topicWorthy, false);
  assert.deepEqual(next.topicDraft, {
    id: 'c1', title: 'T', summary: 'S', type: 'bug',
  });
});

test('reduceSignal produces the draft state on a topic_drafted signal (nested buffered-fallback wire shape)', () => {
  const next = reduceSignal(
    { topicWorthy: true, topicDraft: null },
    {
      type: 'topic_drafted',
      data: {
        case_id: 'c2', case_type: 'feature', title: 'T2', summary: 'S2',
      },
    },
  );
  assert.equal(next.topicWorthy, false);
  assert.deepEqual(next.topicDraft, {
    id: 'c2', title: 'T2', summary: 'S2', type: 'feature',
  });
});

test('computeShowDraftPrompt in newTopicMode ignores topicWorthy and defers to canDraftTopic(turns), unaffected by this task', () => {
  const readyTurns = [
    { role: 'user', reply: 'help me' },
    { role: 'agent', reply: 'sure, here is help', error: false },
  ];
  assert.equal(computeShowDraftPrompt({
    topicDraft: null, newTopicMode: true, topicWorthy: false, turns: readyTurns,
  }), true);
  assert.equal(computeShowDraftPrompt({
    topicDraft: null, newTopicMode: true, topicWorthy: true, turns: [],
  }), false);
});

test('applyStreamEvent joins consecutive assistant_text blocks with a blank line at result', () => {
  const turns = [{ role: 'agent', reply: '', steps: [], error: false }];
  let t = applyStreamEvent(turns, { type: 'assistant_text', text: 'Part one.' }, 1000);
  t = applyStreamEvent(t, { type: 'assistant_text', text: 'Part two.' }, 1010);
  t = applyStreamEvent(t, { type: 'result' }, 1020);
  assert.equal(t[0].reply, 'Part one.\n\nPart two.');
});

test('applyStreamEvent drops a mid-research text segment but keeps the opener and the answer', () => {
  // Opener streams before any real step, narration streams between steps,
  // the answer streams after the last step. Only the narration is dropped.
  let t = [{ role: 'agent', reply: '', steps: [{ summary: 'Working on it', at: 1 }], done: false, error: false }];
  t = applyStreamEvent(t, { type: 'guarded_text_delta', text: 'I hear you — on it.' }, 10);
  t = applyStreamEvent(t, { type: 'progress', summary: 'Searching the code' }, 20);
  t = applyStreamEvent(t, { type: 'guarded_text_delta', text: 'Good, that confirms it. Now let me check more.' }, 30);
  t = applyStreamEvent(t, { type: 'progress', summary: 'Reading a file' }, 40);
  t = applyStreamEvent(t, { type: 'guarded_text_delta', text: 'Here is the answer.' }, 50);
  t = applyStreamEvent(t, { type: 'result' }, 60);
  assert.equal(t[0].reply, 'I hear you — on it.\n\nHere is the answer.');
});

test('composeFinal drops interim assistant_text blocks the same way', () => {
  const turn = {
    steps: [
      { summary: 'Working on it', at: 1 },
      { summary: 'Searching the code', at: 2 },
      { summary: 'Reading a file', at: 3 },
    ],
    finalBlocks: [
      { text: 'Opener.', startStep: 0 },
      { text: 'Interim narration.', startStep: 1 },
      { text: 'The answer.', startStep: 2 },
    ],
  };
  assert.equal(composeFinal(turn), 'Opener.\n\nThe answer.');
});

test('reduceScrollEvent consumes a pending programmatic scroll as still sticking', () => {
  const next = reduceScrollEvent({ pending: 2, stick: true }, 500);
  assert.deepEqual(next, { pending: 1, stick: true });
});

test('reduceScrollEvent re-sticks a user scroll near the bottom', () => {
  const next = reduceScrollEvent({ pending: 0, stick: false }, 20);
  assert.deepEqual(next, { pending: 0, stick: true });
});

test('reduceScrollEvent unsticks a user scroll away from the bottom', () => {
  const next = reduceScrollEvent({ pending: 0, stick: true }, 300);
  assert.deepEqual(next, { pending: 0, stick: false });
});
