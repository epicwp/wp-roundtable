import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { StartedList } from '../src/started-list.jsx';
import { mapCaseToTopic } from '../src/topics.js';

test('mapCaseToTopic marks private cases as drafts', () => {
  const topic = mapCaseToTopic({
    id: 'c1',
    title: 'Draft topic',
    summary: 'Body',
    type: 'bug',
    status: 'open',
    visibility: 'private',
    author_handle: 'teal-owl',
    net: 0,
    created_at: '2026-07-01T12:00:00',
  });
  assert.equal(topic.isDraft, true);
  assert.equal(topic.statusLabel, 'Draft');
});

test('StartedList renders empty state', () => {
  const html = renderToString(h(StartedList, {
    refreshNonce: 0,
    onSelectTopic: () => {},
    onReviewDraft: () => {},
  }));
  assert.match(html, /Loading your topics/);
});