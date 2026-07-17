import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnsToConversation, canDraftTopic } from '../src/conversation.js';

test('turnsToConversation labels agent lines with the configured name', () => {
  const text = turnsToConversation([
    { role: 'agent', reply: 'Hello' },
    { role: 'user', reply: 'Shortcodes break' },
  ], 'Sage');
  assert.match(text, /Sage: Hello/);
  assert.match(text, /User: Shortcodes break/);
});

test('turnsToConversation falls back to the SDK default name', () => {
  const text = turnsToConversation([{ role: 'agent', reply: 'Hello' }]);
  assert.match(text, /Roundtable: Hello/);
});

test('canDraftTopic requires an agent reply after the user message', () => {
  assert.equal(canDraftTopic([{ role: 'agent', reply: 'welcome' }]), false);
  assert.equal(canDraftTopic([
    { role: 'agent', reply: 'welcome' },
    { role: 'user', reply: 'bug' },
  ]), false);
  assert.equal(canDraftTopic([
    { role: 'agent', reply: 'welcome' },
    { role: 'user', reply: 'bug' },
    { role: 'agent', reply: 'tell me more' },
  ]), true);
});