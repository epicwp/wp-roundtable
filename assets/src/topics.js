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
export function mapCaseToTopic(row) {
  const type = row.type || 'question';
  const status = row.status || 'open';
  return {
    id: row.id,
    title: row.title || '',
    snippet: row.summary || '',
    typeLabel: TYPE_LABELS[type] || type,
    typeClass: TYPE_CLASS[type] || 'rt-b-q',
    statusLabel: STATUS_LABELS[status] || status,
    statusClass: STATUS_CLASS[status] || 'rt-s-open',
    handle: row.author_handle || '',
    net: typeof row.net === 'number' ? row.net : 0,
    age: formatAge(row.created_at),
  };
}