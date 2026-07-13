import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTabCounts } from '../src/tab-counts.js';

test('computeTabCounts counts all tabs from case arrays', () => {
  const counts = computeTabCounts({
    cases: [
      { id: '1', status: 'open' },
      { id: '2', status: 'escalated' },
      { id: '3', status: 'in_progress' },
      { id: '4', status: 'open' },
    ],
    participating: [{ id: 'p1' }],
    started: [{ id: 's1' }, { id: 's2' }],
  });

  assert.deepEqual(counts, {
    all: 4,
    participating: 1,
    started: 2,
    roadmap: 2,
  });
});