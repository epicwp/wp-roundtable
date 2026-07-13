import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSteps, labelStep } from '../src/steps.js';

test('collectSteps keeps tool_step and progress only', () => {
  const steps = collectSteps([
    { type: 'thinking', data: { text: 'hmm' } },
    { type: 'tool_step', data: { name: 'grep' } },
    { type: 'tool_result', data: {} },
    { type: 'progress', data: { summary: 'Reading files' } },
  ]);
  assert.equal(steps.length, 2);
  assert.equal(steps[0].type, 'tool_step');
  assert.equal(steps[1].type, 'progress');
});

test('labelStep prefers summary and name fields', () => {
  assert.equal(labelStep({ type: 'progress', data: { summary: 'Scanning' } }), 'Scanning');
  assert.equal(labelStep({ type: 'tool_step', data: { name: 'read_file' } }), 'read_file');
});