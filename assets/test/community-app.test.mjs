import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { CommunityApp } from '../src/community-app.jsx';

test('CommunityApp shows the project name under the Community title', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Nova', projectName: 'Acme Plugin', chatEnabled: true } };
  const html = renderToString(h(CommunityApp, {}));
  assert.match(html, /rt-title[^>]*>Community</);
  assert.match(html, /rt-sub[^>]*>Acme Plugin</);
  assert.doesNotMatch(html, /Browse public topics/);
  assert.match(html, /aria-label="Open Nova chat"/);
});

test('CommunityApp renders no sub-line when no project name is configured', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Nova' } };
  const html = renderToString(h(CommunityApp, {}));
  assert.doesNotMatch(html, /rt-sub/);
});

test('CommunityApp renders a Beta pill next to the Community heading when beta is configured', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Nova', beta: true } };
  const html = renderToString(h(CommunityApp, {}));
  assert.match(html, /rt-title[^>]*>Community<span class="rt-beta-pill">Beta<\/span><\/h1>/);
});

test('CommunityApp renders no Beta pill when beta is absent', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Nova' } };
  const html = renderToString(h(CommunityApp, {}));
  assert.doesNotMatch(html, /rt-beta-pill/);
});

test('CommunityApp hides all chat UI when chatEnabled is false (the v1 default)', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Nova' } };
  const html = renderToString(h(CommunityApp, {}));
  assert.doesNotMatch(html, /rt-aside/);
  assert.doesNotMatch(html, /rt-chat-launch/);
  assert.doesNotMatch(html, /rt-chat-backdrop/);
  assert.match(html, /rt-newtopic-head[^>]*>\+ New topic</);
});

test('CommunityApp shows the chat panel when chatEnabled is true', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Nova', chatEnabled: true } };
  const html = renderToString(h(CommunityApp, {}));
  assert.match(html, /rt-aside/);
  assert.match(html, /rt-chat-launch/);
});
