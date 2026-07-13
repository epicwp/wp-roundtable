/** @jsx h */
import { h } from 'preact';
import { useState } from 'preact/hooks';

export function PublishDialog({ draft, busy, onCancel, onPublish }) {
  const [title, setTitle] = useState(draft?.title || '');
  const [summary, setSummary] = useState(draft?.summary || '');

  return (
    <div class="rt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Review and publish topic">
      <div class="rt-modal">
        <h2 class="rt-modal-title">Review &amp; publish</h2>
        <p class="rt-modal-sub">This topic will become public in the community.</p>
        <label class="rt-field">
          <span>Title</span>
          <input type="text" value={title} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <label class="rt-field">
          <span>Summary</span>
          <textarea rows="4" value={summary} onInput={(e) => setSummary(e.currentTarget.value)} />
        </label>
        <div class="rt-modal-actions">
          <button type="button" class="rt-btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
          <button type="button" class="rt-btn-primary" disabled={busy || !title.trim()} onClick={() => onPublish({ title: title.trim(), summary: summary.trim() })}>
            {busy ? 'Publishing…' : 'Publish topic'}
          </button>
        </div>
      </div>
    </div>
  );
}