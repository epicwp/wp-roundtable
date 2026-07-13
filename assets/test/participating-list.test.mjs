import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { ParticipatingList } from '../src/participating-list.jsx';

test('ParticipatingList renders loading state', () => {
  const html = renderToString(h(ParticipatingList, { refreshNonce: 0, onSelectTopic: () => {} }));
  assert.match(html, /Loading your topics/);
  assert.match(html, /Search topics you joined/);
});