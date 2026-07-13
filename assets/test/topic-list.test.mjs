import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { TopicRow } from '../src/topic-list.jsx';

test('TopicRow is clickable when onSelect is provided', () => {
  const html = renderToString(h(TopicRow, {
    topic: { id: 'c1', title: 'T', snippet: 's', typeLabel: 'Q', typeClass: 'rt-b-q', statusLabel: 'Open', statusClass: 'rt-s-open', handle: 'h', net: 0, age: '' },
    onSelect: () => {},
  }));
  assert.match(html, /rt-case-click/);
  assert.match(html, /role="button"/);
});

test('TopicRow renders title and interactive vote control', () => {
  const html = renderToString(h(TopicRow, {
    topic: {
      id: 'c1',
      title: 'Batch translate',
      snippet: 'Times out on large catalogs',
      typeLabel: 'Feature',
      typeClass: 'rt-b-feat',
      statusLabel: 'Open',
      statusClass: 'rt-s-open',
      handle: 'slate-meadow',
      net: 27,
      age: '3d',
    },
  }));
  assert.match(html, /Batch translate/);
  assert.match(html, /Upvote/);
  assert.match(html, /27/);
});