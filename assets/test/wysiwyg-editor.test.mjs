import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { htmlHasText, uniqueEditorId, WysiwygEditor } from '../src/wysiwyg-editor.jsx';

test('htmlHasText is false for empty/whitespace-only HTML', () => {
  assert.equal(htmlHasText(''), false);
  assert.equal(htmlHasText(undefined), false);
  assert.equal(htmlHasText('   '), false);
  assert.equal(htmlHasText('<p></p>'), false);
  assert.equal(htmlHasText('<p>&nbsp;</p>'), false);
  assert.equal(htmlHasText('<p><br></p>'), false);
});

test('htmlHasText is true once there is real text, however nested', () => {
  assert.equal(htmlHasText('<p>Hello</p>'), true);
  assert.equal(htmlHasText('<ul><li>one</li></ul>'), true);
  assert.equal(htmlHasText('<p><strong>bold</strong></p>'), true);
});

test('uniqueEditorId returns distinct ids that carry the given prefix', () => {
  const a = uniqueEditorId('rt-comment');
  const b = uniqueEditorId('rt-comment');
  assert.notEqual(a, b);
  assert.match(a, /^rt-comment-/);
  assert.match(b, /^rt-comment-/);
});

test('WysiwygEditor falls back to a plain controlled textarea when window.wp.editor is unavailable', () => {
  globalThis.window = {};
  const html = renderToString(h(WysiwygEditor, {
    id: 'rt-test-1',
    value: 'hello',
    onInput: () => {},
    toolbar1: 'bold italic',
    placeholder: 'Add a comment…',
    className: 'rt-ed-input',
    rows: 4,
  }));
  assert.match(html, /<textarea[^>]*class="rt-ed-input"/);
  assert.match(html, /placeholder="Add a comment…"/);
  assert.match(html, />hello<\/textarea>/);
  assert.doesNotMatch(html, /id="rt-test-1"/);
});

test('WysiwygEditor renders a bare seed textarea (no placeholder) when wp.editor is available', () => {
  globalThis.window = { wp: { editor: { initialize: () => {}, remove: () => {} } } };
  const html = renderToString(h(WysiwygEditor, {
    id: 'rt-test-2',
    value: '<p>hello</p>',
    onInput: () => {},
    toolbar1: 'bold italic',
    placeholder: 'Add a comment…',
    className: 'rt-ed-input',
  }));
  assert.match(html, /<textarea id="rt-test-2"/);
  assert.doesNotMatch(html, /placeholder=/);
  assert.doesNotMatch(html, /class="rt-ed-input"/);
});
