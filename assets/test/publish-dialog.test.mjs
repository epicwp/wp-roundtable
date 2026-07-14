import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { PublishDialog } from '../src/publish-dialog.jsx';

test('PublishDialog renders type toggle and large body editor', () => {
  const html = renderToString(h(PublishDialog, {
    draft: { title: 'Batch timeouts', summary: '## Steps\n1. Open catalog', type: 'bug' },
    busy: false,
    onCancel: () => {},
    onPublish: () => {},
  }));
  assert.match(html, /Review &amp; publish/);
  assert.match(html, /rt-pub-types/);
  assert.match(html, /Bug/);
  assert.match(html, /Feature/);
  assert.match(html, /rt-pub-textarea/);
  assert.match(html, /Preview/);
});