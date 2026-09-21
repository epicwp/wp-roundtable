import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapCaseToTopic, formatAge, handleInitials, mapCommentToView, resolveCommentRole, commentRoleBadge } from '../src/topics.js';

test('formatAge returns short relative labels', () => {
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
  assert.equal(formatAge(twoDaysAgo), '2d');
  assert.equal(formatAge('not-a-date'), '');
});

test('mapCaseToTopic maps hub fields to UI labels', () => {
  const topic = mapCaseToTopic({
    id: 'c1',
    title: 'Fix shortcodes',
    summary: 'Shortcodes break',
    type: 'bug',
    status: 'escalated',
    author_handle: 'teal-owl',
    net: 12,
    created_at: '2026-07-01T12:00:00',
  });
  assert.equal(topic.typeLabel, 'Bug');
  assert.equal(topic.statusLabel, 'Planned');
  assert.equal(topic.typeClass, 'rt-b-bug');
  assert.equal(topic.statusClass, 'rt-s-plan');
  assert.equal(topic.net, 12);
  assert.equal(topic.handle, 'teal-owl');
  assert.equal(topic.initials, 'TO');
});

test('mapCaseToTopic treats pending visibility as awaiting approval', () => {
  const topic = mapCaseToTopic({
    id: 'c3',
    title: 'Pending bug',
    summary: 's',
    type: 'bug',
    status: 'open',
    visibility: 'pending',
    author_handle: 'h',
    net: 0,
    created_at: '2026-07-01T12:00:00',
  });
  assert.equal(topic.isDraft, false);
  assert.equal(topic.isPending, true);
  assert.equal(topic.statusLabel, 'Pending approval');
  assert.equal(topic.statusClass, 'rt-s-pending');
});

test('mapCaseToTopic defaults authorRole to community when the hub omits it', () => {
  const topic = mapCaseToTopic({
    id: 'c4', title: 'No role', summary: 's', type: 'bug', status: 'open', author_handle: 'h', net: 0, created_at: '2026-07-01T12:00:00',
  });
  assert.equal(topic.authorRole, 'community');
});

test('mapCaseToTopic passes the hub author_role through', () => {
  const topic = mapCaseToTopic({
    id: 'c5', title: 'From a maintainer', summary: 's', type: 'bug', status: 'open', author_handle: 'h', author_role: 'maintainer', net: 0, created_at: '2026-07-01T12:00:00',
  });
  assert.equal(topic.authorRole, 'maintainer');
});

test('mapCaseToTopic treats private visibility as draft', () => {
  const topic = mapCaseToTopic({
    id: 'c2',
    title: 'Private',
    summary: 's',
    type: 'question',
    status: 'open',
    visibility: 'private',
    author_handle: 'h',
    net: 0,
    created_at: '2026-07-01T12:00:00',
  });
  assert.equal(topic.isDraft, true);
  assert.equal(topic.statusLabel, 'Draft');
});

test('handleInitials derives two letters from handle', () => {
  assert.equal(handleInitials('slate-meadow'), 'SM');
  assert.equal(handleInitials('solo'), 'SO');
});

test('mapCommentToView marks tombstones and renders active comments', () => {
  const active = mapCommentToView({
    id: 'cm1',
    author_handle: 'slate-meadow',
    body: '**Bold** take',
    status: 'active',
    created_at: '2026-07-01T12:00:00',
  });
  assert.equal(active.isTombstone, false);
  assert.match(active.html, /<strong>Bold<\/strong>/);

  const deleted = mapCommentToView({
    id: 'cm2',
    author_handle: 'solo',
    body: null,
    status: 'deleted',
    created_at: '2026-07-01T12:00:00',
  });
  assert.equal(deleted.isTombstone, true);
  assert.equal(deleted.tombstoneLabel, 'This comment was deleted.');
});

test('resolveCommentRole maps hub roles and legacy subjects', () => {
  assert.equal(resolveCommentRole({ author_role: 'assistant' }), 'assistant');
  assert.equal(resolveCommentRole({ author_role: 'maintainer' }), 'maintainer');
  assert.equal(resolveCommentRole({ subject_id: 'system' }), 'maintainer');
  assert.equal(resolveCommentRole({ subject_id: 'agent:sage' }), 'assistant');
  assert.equal(resolveCommentRole({}), 'community');
});

test('mapCommentToView exposes agent badge and avatar hint', () => {
  const view = mapCommentToView({ id: 'c', author_handle: 'sage', author_role: 'assistant', body: 'Hi', status: 'active', created_at: '2026-07-01T12:00:00' }, 'Sage');
  assert.equal(view.isAgent, true);
  assert.equal(view.roleBadge, 'Sage · Assistant');
  assert.equal(commentRoleBadge('maintainer', 'Sage'), 'Maintainer');
});

test('mapCommentToView falls back to the SDK default agent name when none is passed', () => {
  const view = mapCommentToView({ id: 'c', author_handle: 'sage', author_role: 'assistant', body: 'Hi', status: 'active', created_at: '2026-07-01T12:00:00' });
  assert.equal(view.roleBadge, 'Roundtable · Assistant');
});