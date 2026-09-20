import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { StaticVote, VoteControl } from '../src/vote-control.jsx';

test('VoteControl renders interactive vote buttons', () => {
  const html = renderToString(h(VoteControl, { caseId: 'c1', net: 5 }));
  assert.match(html, /Upvote/);
  assert.match(html, /Downvote/);
  assert.match(html, /5/);
  assert.doesNotMatch(html, /read-only/i);
});

test('StaticVote renders the count with no interactive buttons', () => {
  const html = renderToString(h(StaticVote, { net: 5 }));
  assert.match(html, /rt-vote-n">5</);
  assert.doesNotMatch(html, /Upvote/);
  assert.doesNotMatch(html, /Downvote/);
  assert.doesNotMatch(html, /<button/);
});