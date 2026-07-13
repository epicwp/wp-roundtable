// assets/test/events.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsToTurn } from '../src/events.js';

test('concatenates assistant_text into reply', () => {
  const turn = eventsToTurn([
    { type: 'assistant_text', data: { text: 'Hello ' } },
    { type: 'assistant_text', data: { text: 'world' } },
    { type: 'result', data: { subtype: 'success' } },
  ]);
  assert.equal(turn.reply, 'Hello world');
  assert.equal(turn.error, false);
});

test('collects step events and outcome', () => {
  const turn = eventsToTurn([
    { type: 'thinking', data: { text: 'hmm' } },
    { type: 'tool_step', data: { name: 'read' } },
    { type: 'assistant_text', data: { text: 'done' } },
  ]);
  assert.equal(turn.steps.length, 2);
  assert.equal(turn.reply, 'done');
});

test('flags result.is_error as error turn', () => {
  const turn = eventsToTurn([{ type: 'result', data: { is_error: true } }]);
  assert.equal(turn.error, true);
});

test('flags an error turn', () => {
  const turn = eventsToTurn([{ type: 'error', data: { message: 'boom' } }]);
  assert.equal(turn.error, true);
});
