import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { DisabledVote, VoteControl } from '../src/vote-control.jsx';

test('VoteControl renders interactive vote buttons', () => {
  const html = renderToString(h(VoteControl, { caseId: 'c1', net: 5 }));
  assert.match(html, /Upvote/);
  assert.match(html, /Downvote/);
  assert.match(html, /5/);
  assert.doesNotMatch(html, /read-only/i);
});

test('DisabledVote renders the same arrow-and-count shape as VoteControl, but disabled', () => {
  const html = renderToString(h(DisabledVote, { net: 5 }));
  assert.match(html, /rt-vote-n">5</);
  // Both arrow buttons render (same shape as VoteControl) but carry
  // disabled + aria-disabled, and there are no click handlers to fire.
  assert.match(html, /<button[^>]*\bdisabled\b[^>]*aria-disabled="true"[^>]*aria-label="Upvote"/);
  assert.match(html, /<button[^>]*\bdisabled\b[^>]*aria-disabled="true"[^>]*aria-label="Downvote"/);
  assert.equal((html.match(/<button/g) || []).length, 2);
});