import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { CommunityApp } from '../src/community-app.jsx';

test('CommunityApp shows the project name under the Community title', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Nova', projectName: 'Acme Plugin' } };
  const html = renderToString(h(CommunityApp, {}));
  assert.match(html, /rt-title[^>]*>Community</);
  assert.match(html, /rt-sub[^>]*>Acme Plugin</);
  assert.doesNotMatch(html, /Browse public topics/);
});

test('CommunityApp renders no sub-line when no project name is configured', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Nova' } };
  const html = renderToString(h(CommunityApp, {}));
  assert.doesNotMatch(html, /rt-sub/);
});
