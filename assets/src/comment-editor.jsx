/** @jsx h */
import { h } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { renderMarkdown } from './markdown.js';
import { PersonAvatar } from './avatars.jsx';

const TOOLS = [
  { id: 'bold', label: 'Bold', title: 'Bold', wrap: ['**', '**'] },
  { id: 'italic', label: 'Italic', title: 'Italic', wrap: ['_', '_'] },
  { id: 'code', label: 'Code', title: 'Inline code', wrap: ['`', '`'] },
  { id: 'link', label: 'Link', title: 'Link', wrap: ['[', '](url)'] },
  { id: 'list', label: 'List', title: 'Bulleted list', prefix: '- ' },
  { id: 'quote', label: 'Quote', title: 'Quote', prefix: '> ' },
  { id: 'fence', label: 'Block', title: 'Code block', wrap: ['```\n', '\n```'] },
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

  return (
    <div class="rt-addwrap">
      <PersonAvatar initials="Y" size="sm" class="rt-you-ava" />
      <div class="rt-editor rt-mdeditor">
        <div class="rt-ed-tabs">
          <button type="button" class={mode === 'write' ? 'on' : ''} onClick={() => setMode('write')}>Write</button>
          <button type="button" class={mode === 'preview' ? 'on' : ''} onClick={() => setMode('preview')}>Preview</button>
        </div>
        {mode === 'write' && (
          <div class="rt-ed-toolbar">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" class="rt-ed-tool" title={t.title} disabled={posting} onClick={() => applyTool(t)}>
                {t.label}
              </button>
            ))}
          </div>
        )}
        {mode === 'write' ? (
          <textarea
            ref={areaRef}
            class="rt-ed-input"
            placeholder="Add a comment…"
            rows="4"
            value={value}
            disabled={posting}
            onInput={(e) => onInput(e.currentTarget.value)}
          />
        ) : (
          <div
            class="rt-ed-preview rt-prose"
            dangerouslySetInnerHTML={{ __html: value.trim() ? renderMarkdown(value) : '<p class="rt-ed-preview-empty">Nothing to preview yet.</p>' }}
          />
        )}
        <div class="rt-ed-foot">
          <span class="rt-ed-hint" title="Markdown is supported">?</span>
          {error ? <span class="rt-ed-error">Could not post. Try again.</span> : <span class="rt-ed-spacer" />}
          <button type="button" class="rt-post-btn" disabled={posting || !value.trim() || mode !== 'write'} onClick={onSubmit}>
            {posting ? 'Posting…' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}