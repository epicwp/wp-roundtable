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

test('PublishDialog direct variant is an empty form with the moderation notice and no type pre-selected', () => {
  const html = renderToString(h(PublishDialog, {
    variant: 'direct',
    busy: false,
    onCancel: () => {},
    onPublish: () => {},
  }));
  assert.match(html, /New topic/);
  assert.match(html, /Your topic is reviewed by the team before it becomes visible to the community\./);
  assert.doesNotMatch(html, /rt-pub-type on/);
  assert.doesNotMatch(html, /rt-ed-tab/);
  assert.match(html, /rt-pub-textarea/);
  assert.match(html, /Submit topic/);
  // Nothing filled in yet (no type chosen), so submit stays disabled.
  assert.match(html, /rt-btn-primary"\s+disabled/);
});

test('PublishDialog direct variant surfaces the licence-invalid error next to the submit button', () => {
  const html = renderToString(h(PublishDialog, {
    variant: 'direct',
    busy: false,
    errorKind: 'licence_invalid',
    onCancel: () => {},
    onPublish: () => {},
  }));
  assert.match(html, /rt-pub-notice-error/);
  assert.match(html, /Your product licence could not be verified/);
});