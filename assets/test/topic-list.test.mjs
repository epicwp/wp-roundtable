import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { TopicRow } from '../src/topic-list.jsx';

test('TopicRow renders title and read-only vote count', () => {
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
  assert.match(html, /rt-vote-n/);
  assert.match(html, /disabled/);
  assert.match(html, /27/);
});