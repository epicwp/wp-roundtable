// assets/test/rehydrate.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {eventsToTurns, rehydratedTopicWorthy } from '../src/rehydrate.js';

test('splits user_text and agent turns', () => {
  const turns = eventsToTurns([
    { type: 'user_text', data: { text: 'hi' } },
    { type: 'assistant_text', data: { text: 'hey there' } },
    { type: 'result', data: { is_error: false } },
    { type: 'user_text', data: { text: 'more?' } },
    { type: 'assistant_text', data: { text: 'sure' } },
    { type: 'result', data: { is_error: false } },
  ]);
  assert.equal(turns.length, 4);
  assert.deepEqual(turns.map((t) => t.role), ['user', 'agent', 'user', 'agent']);
  assert.equal(turns[1].reply, 'hey there');
  assert.equal(turns[3].reply, 'sure');
  assert.ok(turns.every((t) => t.done === true));
});

test('empty history yields no turns', () => {
  assert.deepEqual(eventsToTurns([]), []);
});

test('trailing agent events without a result still form a turn', () => {
  const turns = eventsToTurns([
    { type: 'user_text', data: { text: 'hi' } },
    { type: 'assistant_text', data: { text: 'partial' } },
  ]);
  assert.equal(turns.length, 2);
  assert.equal(turns[1].reply, 'partial');
});

test('rehydratedTopicWorthy restores an un-drafted topic_worthy signal', () => {
  const res = { events: [
    { type: 'user_text', data: { text: 'bug!' } },
    { type: 'topic_worthy', data: {} },
    { type: 'result', data: {} },
  ] };
  assert.equal(rehydratedTopicWorthy(res), true);
});

test('rehydratedTopicWorthy is false when a later topic_drafted superseded it', () => {
  const res = { events: [
    { type: 'topic_worthy', data: {} },
    { type: 'topic_drafted', data: { case_id: 'c1' } },
  ] };
  assert.equal(rehydratedTopicWorthy(res), false);
});

test('rehydratedTopicWorthy is false on empty or error responses', () => {
  assert.equal(rehydratedTopicWorthy({ events: [] }), false);
  assert.equal(rehydratedTopicWorthy({ error: { kind: 'http' } }), false);
  assert.equal(rehydratedTopicWorthy(null), false);
});
