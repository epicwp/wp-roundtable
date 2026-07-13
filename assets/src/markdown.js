import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import php from 'highlight.js/lib/languages/php';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('php', php);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
  highlight(code, lang) {
    const language = lang && hljs.getLanguage(lang) ? lang : '';
    const label = (language || 'text').toUpperCase();
    let inner;
    if (language) {
      try {
        inner = hljs.highlight(code, { language }).value;
      } catch {
        inner = md.utils.escapeHtml(code);
      }
    } else {
      inner = md.utils.escapeHtml(code);
    }
    const langClass = language ? ' language-' + language : '';
    return (
      '<div class="rt-ccode">' +
      '<div class="rt-ccode-head">' +
      '<span class="rt-ccode-lang">' + label + '</span>' +
      '<button type="button" class="rt-ccode-copy" aria-label="Copy code">Copy</button>' +
      '</div>' +
      '<pre class="rt-ccode-pre"><code class="hljs' + langClass + '">' + inner + '</code></pre>' +
      '</div>'
    );
  },
});

/**
 * Render markdown to an XSS-safe HTML string.
 * @param {string} src markdown source
 * @returns {string} sanitized HTML
 */
export function renderMarkdown(src) {
  return md.render(typeof src === 'string' ? src : '');
}