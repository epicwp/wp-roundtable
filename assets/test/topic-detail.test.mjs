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

test('TopicDetail hides the vote control and comment editor for a pending topic (the hub 403s both)', () => {
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
      net: 3,
      age: '1d',
      isPending: true,
    },
    onBack: () => {},
  }));
  assert.doesNotMatch(html, /Upvote/);
  assert.doesNotMatch(html, /Downvote/);
  assert.match(html, /rt-vote-n">3</);
  assert.doesNotMatch(html, /rt-cm-composer/);
  assert.doesNotMatch(html, /Add a comment/);
  assert.match(html, /Comments open once this topic is approved\./);
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

test('TopicDetail renders the topic body as full markdown', () => {
  const html = renderToString(h(TopicDetail, {
    topic: {
      id: 'c3',
      title: 'Broken sync',
      snippet: '## Steps to reproduce\n\n1. Enable **sync**\n2. Run `wp cron`',
      typeLabel: 'Bug',
      typeClass: 'rt-b-bug',
      statusLabel: 'Open',
      statusClass: 'rt-s-open',
      handle: 'teal-owl',
      initials: 'TO',
      net: 0,
      age: '1d',
    },
    onBack: () => {},
  }));
  assert.match(html, /<h2>Steps to reproduce<\/h2>/);
  assert.match(html, /<ol>/);
  assert.match(html, /<strong>sync<\/strong>/);
  assert.match(html, /<code>wp cron<\/code>/);
});