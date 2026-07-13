import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { CommentActions } from '../src/comment-actions.jsx';

test('CommentActions renders disabled vote and reply shells', () => {
  const html = renderToString(h(CommentActions, {}));
  assert.match(html, /rt-cm-actions/);
  assert.match(html, /rt-cm-vote/);
  assert.match(html, /Reply/);
  assert.match(html, /coming in a later release/i);
  assert.match(html, /disabled/);
});