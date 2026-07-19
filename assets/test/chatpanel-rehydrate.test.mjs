// assets/test/chatpanel-rehydrate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rehydratedTurns } from '../src/rehydrate.js';

const greeting = {
  role: 'agent', reply: 'Hi', steps: [], error: false, introChips: true,
};

test('non-empty history renders greeting without chips, then history', () => {
  const out = rehydratedTurns(greeting, {
    events: [
      { type: 'user_text', data: { text: 'hi' } },
      { type: 'assistant_text', data: { text: 'hey' } },
      { type: 'result', data: { is_error: false } },
    ],
  });
  assert.equal(out[0].introChips, false);
  assert.equal(out.length, 3); // greeting + user + agent
});

test('empty history keeps the default greeting with chips', () => {
  assert.equal(rehydratedTurns(greeting, { events: [] }), null);
});

test('error response keeps the default greeting', () => {
  assert.equal(rehydratedTurns(greeting, { error: { kind: 'http_502' } }), null);
});
