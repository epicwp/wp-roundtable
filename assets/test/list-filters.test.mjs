import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterTopics } from '../src/list-filters.js';

const TOPICS = [
  { id: '1', title: 'Bug report', snippet: 'broken', typeClass: 'rt-b-bug' },
  { id: '2', title: 'Feature idea', snippet: 'nice', typeClass: 'rt-b-feat' },
];

test('filterTopics filters by type and search query', () => {
  assert.equal(filterTopics(TOPICS, '', '').length, 2);
  assert.equal(filterTopics(TOPICS, '', 'bug').length, 1);
  assert.equal(filterTopics(TOPICS, 'feature', '').length, 1);
  assert.equal(filterTopics(TOPICS, 'missing', '').length, 0);
});