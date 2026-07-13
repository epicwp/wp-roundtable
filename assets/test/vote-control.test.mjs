import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { VoteControl } from '../src/vote-control.jsx';

test('VoteControl renders interactive vote buttons', () => {
  const html = renderToString(h(VoteControl, { caseId: 'c1', net: 5 }));
  assert.match(html, /Upvote/);
  assert.match(html, /Downvote/);
  assert.match(html, /5/);
  assert.doesNotMatch(html, /read-only/i);
});