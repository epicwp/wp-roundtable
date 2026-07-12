// assets/src/api.js
function cfg() {
  return window.RoundtableConfig || { restUrl: '', nonce: '' };
}

async function post(path, body) {
  const { restUrl, nonce } = cfg();
  const res = await fetch(restUrl.replace(/\/$/, '') + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({ error: { kind: 'bad_response' } }));
  if (!res.ok && !json.error) return { error: { kind: 'http_' + res.status } };
  return json;
}

/**
 * Send one chat message.
 * @param {string} text
 * @returns {Promise<{events:Array}|{error:{kind:string}}>}
 */
export function sendMessage(text) {
  return post('/message', { message: text });
}

/** Start a fresh chat (clears server-side session). */
export function resetChat() {
  return post('/reset', {});
}
