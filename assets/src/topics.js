import { renderMarkdown } from './markdown.js';

/** UI labels for hub case types. */
const TYPE_LABELS = {
  question: 'Question',
  bug: 'Bug',
  feature_request: 'Feature',
};

/** UI labels for hub case statuses (escalated → Planned per spec). */
const STATUS_LABELS = {
  open: 'Open',
  escalated: 'Planned',
  in_progress: 'In progress',
  shipped: 'Shipped',
  closed: 'Closed',
  merged: 'Merged',
  chatting: 'Draft',
};

const TYPE_CLASS = {
  question: 'rt-b-q',
  bug: 'rt-b-bug',
  feature_request: 'rt-b-feat',
};

const STATUS_CLASS = {
  open: 'rt-s-open',
  escalated: 'rt-s-plan',
  in_progress: 'rt-s-prog',
  shipped: 'rt-s-ship',
  closed: 'rt-s-open',
  merged: 'rt-s-ship',
  chatting: 'rt-s-open',
};

/**
 * Format an ISO timestamp as a short relative age (e.g. "3d", "2w").
 * @param {string} iso
 * @returns {string}
 */
export function formatAge(iso) {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const days = Math.max(0, Math.floor((Date.now() - then) / 86400000));
  if (days < 1) return 'today';
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}w`;
  return `${Math.floor(days / 30)}mo`;
}

/**
 * Map a hub CaseListItem to the UI Topic view model.
 * @param {object} row hub case list item
 * @returns {object} topic view model
 */
/**
 * Two-letter initials from a community handle.
 * @param {string} handle
 * @returns {string}
 */
export function handleInitials(handle) {
  const parts = String(handle || '').split(/[-_]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  const h = String(handle || '?');
  return h.slice(0, 2).toUpperCase();
}

export function mapCaseToTopic(row) {
  const type = row.type || 'question';
  const status = row.status || 'open';
  const handle = row.author_handle || '';
  const summary = row.summary || '';
  return {
    id: row.id,
    title: row.title || '',
    snippet: summary,
    typeLabel: TYPE_LABELS[type] || type,
    typeClass: TYPE_CLASS[type] || 'rt-b-q',
    statusLabel: STATUS_LABELS[status] || status,
    statusClass: STATUS_CLASS[status] || 'rt-s-open',
    handle,
    initials: handleInitials(handle),
    net: typeof row.net === 'number' ? row.net : 0,
    age: formatAge(row.created_at),
  };
}

const TOMBSTONE_LABELS = {
  deleted: 'This comment was deleted.',
  removed: 'This comment was removed.',
};

/**
 * Map a hub CommentResponse to the UI comment view model.
 * @param {object} row hub comment
 * @returns {object}
 */
export function mapCommentToView(row) {
  const handle = row.author_handle || '';
  const status = row.status || 'active';
  const isTombstone = status !== 'active' || row.body == null || row.body === '';
  return {
    id: row.id,
    handle,
    initials: handleInitials(handle),
    age: formatAge(row.created_at),
    isTombstone,
    tombstoneLabel: TOMBSTONE_LABELS[status] || 'This comment is unavailable.',
    html: isTombstone ? '' : renderMarkdown(row.body),
  };
}