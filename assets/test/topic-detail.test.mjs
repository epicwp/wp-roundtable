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

test('TopicDetail shows a disabled (not hidden) vote control and comment composer for a pending topic', () => {
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
  // Vote arrows render (same shape as a published row) but disabled — no fetch, no handlers.
  assert.match(html, /rt-vote-n">3</);
  assert.match(html, /<button[^>]*\bdisabled\b[^>]*aria-label="Upvote"/);
  assert.match(html, /<button[^>]*\bdisabled\b[^>]*aria-label="Downvote"/);
  // The comment composer is back, textarea usable as normal, but submit is disabled.
  assert.match(html, /rt-cm-composer/);
  assert.match(html, /Add a comment/);
  assert.match(html, /<button type="button" class="rt-post-btn"[^>]*\bdisabled\b/);
  // The notice sits above the composer instead of replacing the whole section.
  assert.match(html, /Comments open once this topic is approved\./);
  // No comments list/header — we never fetch comments for a pending topic.
  assert.doesNotMatch(html, /rt-csec-head/);
  assert.doesNotMatch(html, /No comments yet/);
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
  assert.match(html, /Comment/);
  assert.match(html, /rt-cm-composer/);
  // The comment composer is now a WYSIWYG editor (wp.editor) — the old
  // hand-rolled Write/Preview tabs and B/I toolbar are gone.
  assert.doesNotMatch(html, /rt-ed-top/);
  assert.doesNotMatch(html, /rt-ed-tools/);
});

test('TopicDetail shows a Maintainer badge in the header and post when authorRole is maintainer', () => {
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
      authorRole: 'maintainer',
    },
    onBack: () => {},
  }));
  // Once in the rt-cmeta header, once next to the post's own author line.
  assert.equal((html.match(/rt-b-maintainer">Maintainer</g) || []).length, 2);
});

test('TopicDetail shows no Maintainer badge for a community author', () => {
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
      authorRole: 'community',
    },
    onBack: () => {},
  }));
  assert.doesNotMatch(html, /rt-b-maintainer/);
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