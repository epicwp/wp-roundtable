import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { RoadmapList } from '../src/roadmap-list.jsx';
import { filterRoadmapCases, groupRoadmapCases } from '../src/topics.js';

const SAMPLE = [
  { id: '1', status: 'open', title: 'Open', net: 5 },
  { id: '2', status: 'escalated', title: 'Planned A', net: 44 },
  { id: '3', status: 'escalated', title: 'Planned B', net: 27 },
  { id: '4', status: 'in_progress', title: 'Doing', net: 96 },
  { id: '5', status: 'shipped', title: 'Done', net: 10 },
];

test('filterRoadmapCases drops non-roadmap statuses', () => {
  const filtered = filterRoadmapCases(SAMPLE);
  assert.deepEqual(filtered.map((c) => c.id), ['2', '3', '4', '5']);
});

test('groupRoadmapCases orders sections and sorts by net', () => {
  const grouped = groupRoadmapCases(SAMPLE);
  assert.equal(grouped.length, 3);
  assert.equal(grouped[0].status, 'escalated');
  assert.equal(grouped[0].label, 'Planned');
  assert.deepEqual(grouped[0].cases.map((c) => c.id), ['2', '3']);
  assert.equal(grouped[1].status, 'in_progress');
  assert.deepEqual(grouped[1].cases.map((c) => c.id), ['4']);
  assert.equal(grouped[2].status, 'shipped');
});

test('RoadmapList renders loading state', () => {
  const html = renderToString(h(RoadmapList, { refreshNonce: 0, onSelectTopic: () => {} }));
  assert.match(html, /Loading roadmap/);
});