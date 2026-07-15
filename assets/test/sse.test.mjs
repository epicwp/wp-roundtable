import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSseChunk } from '../src/sse.js';

test('parseSseChunk decodes complete frames and keeps the remainder', () => {
  const { events, rest } = parseSseChunk('data: {"type":"a","text":"hi"}\n\ndata: {"type":"b"');
  assert.deepEqual(events, [{ type: 'a', text: 'hi' }]);
  assert.equal(rest, 'data: {"type":"b"');
});

test('parseSseChunk skips malformed frames', () => {
  const { events } = parseSseChunk('data: not-json\n\ndata: {"type":"ok"}\n\n');
  assert.deepEqual(events, [{ type: 'ok' }]);
});
