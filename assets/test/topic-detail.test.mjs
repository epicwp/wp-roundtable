import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { TopicDetail } from '../src/topic-detail.jsx';

test('TopicDetail renders title and back link', () => {
  const html = renderToString(h(TopicDetail, {
    topic: {
      id: 'c1',
      title: 'Batch translate',
      snippet: 'Times out on large catalogs',
      typeLabel: 'Feature',
      typeClass: 'rt-b-feat',
      statusLabel: 'Open',
      statusClass: 'rt-s-open',
      handle: 'slate-meadow',
      initials: 'SM',
      net: 27,
      age: '3d',
    },
    onBack: () => {},
  }));
  assert.match(html, /Batch translate/);
  assert.match(html, /All topics/);
  assert.match(html, /Comments/);
  assert.match(html, /Add a comment/);
  assert.match(html, /Write/);
  assert.match(html, /Preview/);
  assert.match(html, /Comment/);
  assert.match(html, /rt-cm-composer/);
  assert.match(html, /rt-ed-top/);
  assert.match(html, /rt-ed-tools/);
});