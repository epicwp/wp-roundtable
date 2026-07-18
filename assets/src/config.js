// assets/src/config.js — the names localized by src/Admin/Page.php.

/** @returns {{agentName?:string, projectName?:string, initialMessage?:string}} */
function cfg() {
  return (typeof window !== 'undefined' && window.RoundtableConfig) || {};
}

/**
 * The assistant's display name, as configured by the consuming plugin.
 * @returns {string}
 */
export function agentDisplayName() {
  return cfg().agentName || 'Roundtable';
}

/**
 * The consuming product's display name, or '' when it is not configured.
 * @returns {string}
 */
export function projectDisplayName() {
  return cfg().projectName || '';
}

/**
 * The vendor's configured initial chat message, or '' when it is not configured.
 * @returns {string}
 */
export function initialMessage() {
  return cfg().initialMessage || '';
}
