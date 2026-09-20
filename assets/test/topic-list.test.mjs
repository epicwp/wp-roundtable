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

test('TopicRow shows the vote arrows disabled (not hidden) for a pending topic', () => {
  const html = renderToString(h(TopicRow, {
    topic: {
      id: 'c1',
      title: 'Awaiting review',
      snippet: 'Body',
      typeLabel: 'Bug',
      typeClass: 'rt-b-bug',
      statusLabel: 'Pending approval',
      statusClass: 'rt-s-pending',
      handle: 'teal-owl',
      net: 4,
      age: '1d',
      isPending: true,
    },
  }));
  assert.match(html, /rt-vote-n">4</);
  assert.match(html, /<button[^>]*\bdisabled\b[^>]*aria-label="Upvote"/);
  assert.match(html, /<button[^>]*\bdisabled\b[^>]*aria-label="Downvote"/);
});

test('TopicRow renders a markdown summary as a plain-text excerpt', () => {
  const html = renderToString(h(TopicRow, {
    topic: {
      id: 'c1',
      title: 'Broken sync',
      snippet: '## Steps to reproduce\n\n1. Enable **sync**\n2. Run `wp cron`',
      typeLabel: 'Bug',
      typeClass: 'rt-b-bug',
      statusLabel: 'Open',
      statusClass: 'rt-s-open',
      handle: 'teal-owl',
      net: 0,
      age: '1d',
    },
  }));
  assert.match(html, /Steps to reproduce Enable sync Run wp cron/);
  assert.doesNotMatch(html, /##|<h2|\*\*|`/);
});