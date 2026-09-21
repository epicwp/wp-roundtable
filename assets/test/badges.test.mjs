import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { MaintainerBadge } from '../src/badges.jsx';

test('MaintainerBadge renders the "Maintainer" label on the shared badge classes', () => {
  const html = renderToString(h(MaintainerBadge, {}));
  assert.equal(html, '<span class="rt-badge rt-b-maintainer">Maintainer</span>');
});
