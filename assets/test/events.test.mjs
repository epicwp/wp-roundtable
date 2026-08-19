// assets/test/events.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsToTurn } from '../src/events.js';

test('joins assistant_text blocks into reply with a blank line', () => {
  const turn = eventsToTurn([
    { type: 'assistant_text', data: { text: 'Hello' } },
    { type: 'assistant_text', data: { text: 'world' } },
    { type: 'result', data: { subtype: 'success' } },
  ]);
  assert.equal(turn.reply, 'Hello\n\nworld');
  assert.equal(turn.error, false);
});

test('collects tool_step and progress only (matches backend)', () => {
  const turn = eventsToTurn([
    { type: 'thinking', data: { text: 'hmm' } },
    { type: 'tool_step', data: { name: 'read' } },
    { type: 'progress', data: { summary: 'Searching docs' } },
    { type: 'assistant_text', data: { text: 'done' } },
  ]);
  assert.equal(turn.steps.length, 2);
  assert.equal(turn.steps[0].type, 'tool_step');
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

test('drops assistant_text between tool activity, keeps opener and closing answer', () => {
  const turn = eventsToTurn([
    { type: 'assistant_text', data: { text: 'Opener.' } },
    { type: 'tool_step', data: { name: 'read' } },
    { type: 'assistant_text', data: { text: 'Interim narration.' } },
    { type: 'progress', data: { summary: 'Reading a file' } },
    { type: 'assistant_text', data: { text: 'The answer.' } },
    { type: 'result', data: { subtype: 'success' } },
  ]);
  assert.equal(turn.reply, 'Opener.\n\nThe answer.');
});

test('the Working on it placeholder does not count as tool activity', () => {
  const turn = eventsToTurn([
    { type: 'progress', data: { summary: 'Working on it' } },
    { type: 'assistant_text', data: { text: 'Only text.' } },
    { type: 'result', data: { subtype: 'success' } },
  ]);
  assert.equal(turn.reply, 'Only text.');
});
