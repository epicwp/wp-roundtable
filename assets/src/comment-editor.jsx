/** @jsx h */
import { h } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { renderMarkdown } from './markdown.js';
import { PersonAvatar } from './avatars.jsx';

const TOOLS = [
  { id: 'bold', title: 'Bold', wrap: ['**', '**'], label: <b>B</b> },
  { id: 'italic', title: 'Italic', wrap: ['_', '_'], label: <i>I</i> },
  {
    id: 'code', title: 'Inline code', wrap: ['`', '`'],
    label: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m8 8-4 4 4 4M16 8l4 4-4 4" /></svg>,
  },
  {
    id: 'link', title: 'Link', wrap: ['[', '](url)'],
    label: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15l6-6" /><path d="M11 6l1-1a4 4 0 0 1 6 6l-1 1" /><path d="M13 18l-1 1a4 4 0 0 1-6-6l1-1" /></svg>,
  },
  { id: 'sep', sep: true },
  {
    id: 'list', title: 'Bulleted list', prefix: '- ',
    label: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1.1" fill="currentColor" stroke="none" /></svg>,
  },
  {
    id: 'quote', title: 'Quote', prefix: '> ',
    label: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 5v14" /><path d="M11 8h7M11 12h7M11 16h5" /></svg>,
  },
  {
    id: 'fence', title: 'Code block', wrap: ['```\n', '\n```'],
    label: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="m9 10-2 2 2 2M15 10l2 2-2 2" /></svg>,
  },
];

/**
 * @param {HTMLTextAreaElement} el
 * @param {[string,string]} wrap
 * @param {string} value
 */
function applyWrap(el, wrap, value) {
  const [before, after] = wrap;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const sel = value.slice(start, end);
  const next = value.slice(0, start) + before + sel + after + value.slice(end);
  const cursor = start + before.length + sel.length;
  return { next, cursor };
}

/**
 * @param {HTMLTextAreaElement} el
 * @param {string} prefix
 * @param {string} value
 */
function applyPrefix(el, prefix, value) {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const block = value.slice(start, end) || '';
  const lines = block.split('\n');
  const prefixed = lines.map((line) => prefix + line).join('\n');
  const next = value.slice(0, start) + prefixed + value.slice(end);
  return { next, cursor: start + prefixed.length };
}

/**
 * Full markdown comment composer with Write/Preview and toolbar.
 * @param {{value:string, onInput:(v:string)=>void, onSubmit:()=>void, posting:boolean, error:boolean}} props
 */
export function CommentEditor({ value, onInput, onSubmit, posting, error }) {
  const [mode, setMode] = useState('write');
  const areaRef = useRef(null);

  function applyTool(tool) {
    if (tool.sep) return;
    const el = areaRef.current;
    if (!el || mode !== 'write') return;
    let result;
    if (tool.wrap) result = applyWrap(el, tool.wrap, value);
    else if (tool.prefix) result = applyPrefix(el, tool.prefix, value);
    else return;
    onInput(result.next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.cursor, result.cursor);
    });
  }

  function onKeyDown(e) {
    if (mode !== 'write' || posting) return;
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (value.trim()) onSubmit();
    }
  }

  return (
    <div class="rt-addwrap rt-cm-composer">
      <PersonAvatar initials="Y" size="sm" class="rt-you-ava" />
      <div class="rt-editor rt-mdeditor">
        <div class="rt-ed-top">
          <div class="rt-ed-tabs">
            <button type="button" class={'rt-ed-tab' + (mode === 'write' ? ' on' : '')} onClick={() => setMode('write')}>Write</button>
            <button type="button" class={'rt-ed-tab' + (mode === 'preview' ? ' on' : '')} onClick={() => setMode('preview')}>Preview</button>
          </div>
          <span class="rt-ed-grow" />
          {mode === 'write' && (
            <div class="rt-ed-tools">
              {TOOLS.map((t) => t.sep
                ? <span key={t.id} class="rt-ed-sep" />
                : (
                  <button key={t.id} type="button" class="rt-ed-tool" title={t.title} disabled={posting} onClick={() => applyTool(t)}>
                    {t.label}
                  </button>
                ))}
            </div>
          )}
        </div>
        {mode === 'write' ? (
          <textarea
            ref={areaRef}
            class="rt-ed-input"
            placeholder="Add a comment…"
            rows="4"
            value={value}
            disabled={posting}
            onInput={(e) => onInput(e.currentTarget.value)}
            onKeyDown={onKeyDown}
          />
        ) : (
          <div
            class="rt-ed-preview rt-prose"
            dangerouslySetInnerHTML={{ __html: value.trim() ? renderMarkdown(value) : '<p class="rt-ed-preview-empty">Nothing to preview yet.</p>' }}
          />
        )}
        <div class="rt-ed-foot">
          <span class="rt-ed-md" title="Markdown is supported" aria-label="Markdown supported">
            <svg viewBox="0 0 16 16" fill="currentColor"><path d="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.69C0 12.48.52 13 1.15 13h13.69c.64 0 1.15-.52 1.15-1.15v-7.7C16 3.52 15.48 3 14.85 3ZM9 11H7V8L5.5 9.92 4 8v3H2V5h2l1.5 2L7 5h2v6Zm2.99.5L9.5 8H11V5h2v3h1.5l-2.51 3.5Z" /></svg>
          </span>
          {error ? <span class="rt-ed-error">Could not post. Try again.</span> : <span class="rt-ed-spacer" />}
          <button type="button" class="rt-post-btn" disabled={posting || !value.trim() || mode !== 'write'} onClick={onSubmit}>
            {posting ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}