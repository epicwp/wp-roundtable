/** @jsx h */
import { h } from 'preact';
import { useState } from 'preact/hooks';
import { renderMarkdown } from './markdown.js';

const TYPES = [
  { id: 'question', label: 'Question', badgeClass: 'rt-b-q' },
  { id: 'bug', label: 'Bug', badgeClass: 'rt-b-bug' },
  { id: 'feature_request', label: 'Feature', badgeClass: 'rt-b-feat' },
];

function normalizeType(raw) {
  const t = String(raw || 'question');
  return TYPES.some((x) => x.id === t) ? t : 'question';
}

/**
 * @param {{draft:object, busy:boolean, onCancel:()=>void, onPublish:(p:{title:string,summary:string,type:string})=>void}} props
 */
export function PublishDialog({ draft, busy, onCancel, onPublish }) {
  const [title, setTitle] = useState(draft?.title || '');
  const [summary, setSummary] = useState(draft?.summary || '');
  const [type, setType] = useState(normalizeType(draft?.type));
  const [mode, setMode] = useState('write');
  const activeType = TYPES.find((t) => t.id === type) || TYPES[0];

  return (
    <div class="rt-modal-backdrop rt-pub-backdrop" role="dialog" aria-modal="true" aria-label="Review and publish topic">
      <div class="rt-modal rt-pub-modal">
        <div class="rt-pub-head">
          <div>
            <h2 class="rt-modal-title">Review &amp; publish</h2>
            <p class="rt-modal-sub">Edit the draft below. Once published, others can read and vote on it.</p>
          </div>
          <span class={'rt-badge ' + activeType.badgeClass}>{activeType.label}</span>
        </div>
        <div class="rt-pub-types" role="group" aria-label="Topic type">
          {TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              class={'rt-pub-type' + (type === t.id ? ' on' : '')}
              disabled={busy}
              onClick={() => setType(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label class="rt-field rt-pub-field">
          <span>Title</span>
          <input type="text" value={title} disabled={busy} onInput={(e) => setTitle(e.currentTarget.value)} />
        </label>
        <div class="rt-pub-body">
          <div class="rt-ed-top rt-pub-ed-top">
            <div class="rt-ed-tabs">
              <button type="button" class={'rt-ed-tab' + (mode === 'write' ? ' on' : '')} onClick={() => setMode('write')}>Write</button>
              <button type="button" class={'rt-ed-tab' + (mode === 'preview' ? ' on' : '')} onClick={() => setMode('preview')}>Preview</button>
            </div>
          </div>
          {mode === 'write' ? (
            <textarea
              class="rt-pub-textarea"
              rows="14"
              value={summary}
              disabled={busy}
              placeholder="Describe the issue clearly so others can understand it at a glance…"
              onInput={(e) => setSummary(e.currentTarget.value)}
            />
          ) : (
            <div
              class="rt-pub-preview rt-prose"
              dangerouslySetInnerHTML={{ __html: summary.trim() ? renderMarkdown(summary) : '<p class="rt-ed-preview-empty">Nothing to preview yet.</p>' }}
            />
          )}
        </div>
        <div class="rt-modal-actions">
          <button type="button" class="rt-btn-secondary" disabled={busy} onClick={onCancel}>Cancel</button>
          <button
            type="button"
            class="rt-btn-primary"
            disabled={busy || !title.trim() || !summary.trim() || mode !== 'write'}
            onClick={() => onPublish({ title: title.trim(), summary: summary.trim(), type })}
          >
            {busy ? 'Publishing…' : 'Publish topic'}
          </button>
        </div>
      </div>
    </div>
  );
}