import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentDisplayName, projectDisplayName } from '../src/config.js';

test('agentDisplayName falls back to the SDK default', () => {
  globalThis.window = {};
  assert.equal(agentDisplayName(), 'Roundtable');
});

test('agentDisplayName returns the configured name', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Sage' } };
  assert.equal(agentDisplayName(), 'Sage');
});

test('projectDisplayName is empty when no project is configured', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Sage' } };
  assert.equal(projectDisplayName(), '');
});

test('projectDisplayName returns the configured project', () => {
  globalThis.window = { RoundtableConfig: { projectName: 'Polylang AI Automatic Translation' } };
  assert.equal(projectDisplayName(), 'Polylang AI Automatic Translation');
});
