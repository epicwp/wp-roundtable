import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { CommentEditor } from '../src/comment-editor.jsx';

test('CommentEditor disables submit when the editor has no real text content', () => {
  globalThis.window = {};
  const html = renderToString(h(CommentEditor, {
    value: '<p><br></p>',
    onInput: () => {},
    onSubmit: () => {},
    posting: false,
    error: false,
  }));
  assert.match(html, /<button type="button" class="rt-post-btn"[^>]*\bdisabled\b/);
});

test('CommentEditor enables submit once there is real text content', () => {
  globalThis.window = {};
  const html = renderToString(h(CommentEditor, {
    value: '<p>Looks good to me.</p>',
    onInput: () => {},
    onSubmit: () => {},
    posting: false,
    error: false,
  }));
  assert.doesNotMatch(html, /<button type="button" class="rt-post-btn"[^>]*\bdisabled\b/);
});

test('CommentEditor keeps submit disabled when submitDisabled is set, even with text', () => {
  globalThis.window = {};
  const html = renderToString(h(CommentEditor, {
    value: '<p>Looks good to me.</p>',
    onInput: () => {},
    onSubmit: () => {},
    posting: false,
    error: false,
    submitDisabled: true,
  }));
  assert.match(html, /<button type="button" class="rt-post-btn"[^>]*\bdisabled\b/);
});

test('CommentEditor renders the error message and falls back to a plain textarea without TinyMCE', () => {
  globalThis.window = {};
  const html = renderToString(h(CommentEditor, {
    value: '',
    onInput: () => {},
    onSubmit: () => {},
    posting: false,
    error: true,
  }));
  assert.match(html, /Could not post\. Try again\./);
  assert.match(html, /<textarea[^>]*class="rt-ed-input"/);
  assert.match(html, /placeholder="Add a comment…"/);
  assert.doesNotMatch(html, /rt-ed-top/);
  assert.doesNotMatch(html, /rt-ed-tools/);
});
