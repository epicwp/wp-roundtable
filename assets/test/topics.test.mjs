import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapCaseToTopic, formatAge } from '../src/topics.js';

test('formatAge returns short relative labels', () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
  assert.equal(formatAge(twoDaysAgo), '2d');
  assert.equal(formatAge('not-a-date'), '');
});

test('mapCaseToTopic maps hub fields to UI labels', () => {
  const topic = mapCaseToTopic({
    id: 'c1',
    title: 'Fix shortcodes',
    summary: 'Shortcodes break',
    type: 'bug',
    status: 'escalated',
    author_handle: 'teal-owl',
    net: 12,
    created_at: '2026-07-01T12:00:00',
  });
  assert.equal(topic.typeLabel, 'Bug');
  assert.equal(topic.statusLabel, 'Planned');
  assert.equal(topic.typeClass, 'rt-b-bug');
  assert.equal(topic.statusClass, 'rt-s-plan');
  assert.equal(topic.net, 12);
  assert.equal(topic.handle, 'teal-owl');
});