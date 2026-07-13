import { test } from 'node:test';
import assert from 'node:assert/strict';
import { turnsToConversation, canDraftTopic } from '../src/conversation.js';

test('turnsToConversation formats transcript', () => {
  const text = turnsToConversation([
    { role: 'agent', reply: 'Hello' },
    { role: 'user', reply: 'Shortcodes break' },
  ]);
  assert.match(text, /Sage: Hello/);
  assert.match(text, /User: Shortcodes break/);
});

test('canDraftTopic requires user and agent messages', () => {
  assert.equal(canDraftTopic([{ role: 'agent', reply: 'hi' }]), false);
  assert.equal(canDraftTopic([
    { role: 'agent', reply: 'hi' },
    { role: 'user', reply: 'bug' },
  ]), true);
});