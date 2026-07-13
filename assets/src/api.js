// assets/src/api.js
function cfg() {
  return window.RoundtableConfig || { restUrl: '', nonce: '' };
}

function restBase() {
  return cfg().restUrl.replace(/\/$/, '');
}

async function parseJson(res) {
  const json = await res.json().catch(() => ({ error: { kind: 'bad_response' } }));
  if (!res.ok && !json.error) return { error: { kind: 'http_' + res.status } };
  return json;
}

async function post(path, body) {
  const res = await fetch(restBase() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg().nonce },
    body: JSON.stringify(body || {}),
  });
  return parseJson(res);
}

async function get(path, query) {
  const qs = new URLSearchParams();
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
    });
  }
  const suffix = qs.toString() ? '?' + qs.toString() : '';
  const res = await fetch(restBase() + path + suffix, {
    headers: { 'X-WP-Nonce': cfg().nonce },
  });
  return parseJson(res);
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

/**
 * List public topics (hub cases).
 * @param {{type?:string,q?:string,sort?:string,limit?:number,offset?:number}} params
 * @returns {Promise<{cases:Array}|{error:{kind:string}}>}
 */
export function fetchCases(params) {
  return get('/cases', params);
}

/**
 * Draft a Case from the chat transcript.
 * @param {{conversation:string, title?:string, summary?:string, type?:string}} body
 */
export function createDraft(body) {
  return post('/case', body);
}

/**
 * Publish a drafted Case.
 * @param {{case_id:string, title?:string, summary?:string}} body
 */
export function publishCase(body) {
  return post('/publish', body);
}

/**
 * List comments on a public topic.
 * @param {string} caseId
 * @returns {Promise<{comments:Array}|{error:{kind:string}}>}
 */
export function fetchComments(caseId) {
  return get('/cases/' + encodeURIComponent(caseId) + '/comments');
}
