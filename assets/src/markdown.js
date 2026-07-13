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
  html: false, // raw HTML in input is escaped, never emitted
  linkify: true,
  breaks: false,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre class="rt-code"><code class="hljs">' +
          hljs.highlight(code, { language: lang }).value + '</code></pre>';
      } catch {
        /* fall through */
      }
    }
    return '<pre class="rt-code"><code class="hljs">' + md.utils.escapeHtml(code) + '</code></pre>';
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
