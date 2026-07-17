import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatGreeting } from '../src/chat-copy.js';

test('chatGreeting names the agent and the project', () => {
  const text = chatGreeting('Sage', 'Polylang AI Automatic Translation');
  assert.match(text, /I'm Sage\./);
  assert.match(text, /Ask how Polylang AI Automatic Translation works/);
});

test('chatGreeting falls back when no project name is configured', () => {
  const text = chatGreeting('Roundtable', '');
  assert.match(text, /I'm Roundtable\./);
  assert.match(text, /Ask how it works/);
  assert.doesNotMatch(text, /translation/i);
});
