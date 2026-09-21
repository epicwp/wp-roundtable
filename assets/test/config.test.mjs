import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agentDisplayName, attribution, betaEnabled, chatDisabled, chatEnabled, initialMessage, projectDisplayName,
} from '../src/config.js';

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

test('initialMessage is empty when not configured', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Sage' } };
  assert.equal(initialMessage(), '');
});

test('initialMessage returns the configured message', () => {
  globalThis.window = { RoundtableConfig: { initialMessage: 'Welcome! Ask me anything.' } };
  assert.equal(initialMessage(), 'Welcome! Ask me anything.');
});

test('betaEnabled is false when not configured', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Sage' } };
  assert.equal(betaEnabled(), false);
});

test('betaEnabled is true when the config flags beta', () => {
  globalThis.window = { RoundtableConfig: { beta: true } };
  assert.equal(betaEnabled(), true);
});

test('chatDisabled is false when not configured', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Sage' } };
  assert.equal(chatDisabled(), false);
});

test('chatDisabled is true when the hub paused the chat', () => {
  globalThis.window = { RoundtableConfig: { chatDisabled: true } };
  assert.equal(chatDisabled(), true);
});

test('betaEnabled and chatDisabled accept wp_localize_script stringified booleans', async () => {
  const { betaEnabled, chatDisabled } = await import('../src/config.js');
  globalThis.window = { RoundtableConfig: { beta: '1', chatDisabled: '' } };
  assert.equal(betaEnabled(), true);
  assert.equal(chatDisabled(), false);
  globalThis.window = { RoundtableConfig: { beta: '', chatDisabled: '1' } };
  assert.equal(betaEnabled(), false);
  assert.equal(chatDisabled(), true);
});

test('chatEnabled is false when not configured (the v1 default)', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Sage' } };
  assert.equal(chatEnabled(), false);
});

test('chatEnabled is true when the boot payload flags it', () => {
  globalThis.window = { RoundtableConfig: { chatEnabled: true } };
  assert.equal(chatEnabled(), true);
});

test('chatEnabled accepts wp_localize_script stringified booleans', () => {
  globalThis.window = { RoundtableConfig: { chatEnabled: '1' } };
  assert.equal(chatEnabled(), true);
  globalThis.window = { RoundtableConfig: { chatEnabled: '' } };
  assert.equal(chatEnabled(), false);
});

test('attribution is empty when not configured', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Sage' } };
  assert.equal(attribution(), '');
});

test('attribution is empty when the boot payload sends null', () => {
  globalThis.window = { RoundtableConfig: { attribution: null } };
  assert.equal(attribution(), '');
});

test('attribution returns the configured line', () => {
  globalThis.window = { RoundtableConfig: { attribution: 'Community powered by Acme' } };
  assert.equal(attribution(), 'Community powered by Acme');
});
