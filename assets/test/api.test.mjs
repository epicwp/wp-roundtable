// assets/test/api.test.mjs
// Tests for api.js: trigger plumbing into sendMessage/streamMessage's POST bodies.
import assert from 'node:assert/strict';
import { test } from 'node:test';

test('sendMessage includes trigger in the body when given', async () => {
  globalThis.window = { RoundtableConfig: { restUrl: 'https://example.test/wp-json/roundtable/v1', nonce: 'n' } };
  let capturedBody = null;
  globalThis.fetch = async (url, init) => {
    capturedBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ events: [] }) };
  };
  const { sendMessage } = await import('../src/api.js');

  await sendMessage('', 'create_topic');

  assert.equal(capturedBody.trigger, 'create_topic');
  assert.equal(capturedBody.message, '');
});

test('sendMessage omits trigger when not given', async () => {
  globalThis.window = { RoundtableConfig: { restUrl: 'https://example.test/wp-json/roundtable/v1', nonce: 'n' } };
  let capturedBody = null;
  globalThis.fetch = async (url, init) => {
    capturedBody = JSON.parse(init.body);
    return { ok: true, json: async () => ({ events: [] }) };
  };
  const { sendMessage } = await import('../src/api.js');

  await sendMessage('hi');

  assert.equal('trigger' in capturedBody, false);
});

test('streamMessage includes trigger in the body when given', async () => {
  globalThis.window = { RoundtableConfig: { restUrl: 'https://example.test/wp-json/roundtable/v1', nonce: 'n' } };
  let capturedBody = null;
  globalThis.fetch = async (url, init) => {
    capturedBody = JSON.parse(init.body);
    return { ok: false, body: null };
  };
  const { streamMessage } = await import('../src/api.js');

  await streamMessage('', {
    onEvent: () => {}, onError: () => {}, onDone: () => {}, trigger: 'create_topic',
  });

  assert.equal(capturedBody.trigger, 'create_topic');
});
