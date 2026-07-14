import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { TopicDetail } from '../src/topic-detail.jsx';

test('TopicDetail shows pending approval banner', () => {
  const html = renderToString(h(TopicDetail, {
    topic: {
      id: 'c2',
      title: 'Awaiting review',
      snippet: 'Body',
      typeLabel: 'Bug',
      typeClass: 'rt-b-bug',
      statusLabel: 'Pending approval',
      statusClass: 'rt-s-pending',
      handle: 'teal-owl',
      initials: 'TO',
      net: 0,
      age: '1d',
      isPending: true,
    },
    onBack: () => {},
  }));
  assert.match(html, /Pending approval/);
  assert.match(html, /rt-banner-pending/);
});

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