// assets/src/config.js — the names localized by src/Admin/Page.php.

/** @returns {{agentName?:string, projectName?:string, initialMessage?:string, beta?:boolean, chatDisabled?:boolean}} */
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

/**
 * Read a boolean config flag. wp_localize_script stringifies scalars (true
 * becomes "1", false becomes ""), so a strict === true check silently fails
 * against a real WordPress payload; accept the stringified truthy forms too.
 * @param {unknown} value
 * @returns {boolean}
 */
function flag(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

/**
 * Whether the consuming plugin flagged this integration as beta ("Beta" pill in the UI).
 * @returns {boolean}
 */
export function betaEnabled() {
  return flag(cfg().beta);
}

/**
 * Whether the hub reported the community chat as paused for this project.
 * @returns {boolean}
 */
export function chatDisabled() {
  return flag(cfg().chatDisabled);
}
