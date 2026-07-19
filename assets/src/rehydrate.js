// assets/src/rehydrate.js — reconstruct ChatPanel `turns` from stored hub events.
import { eventsToTurn } from './events.js';
import { labelStep } from './steps.js';

/**
 * Split a flat, ordered event list (as returned by /history) into the panel's
 * `turns` model. Each `user_text` becomes a completed user turn; the agent
 * events that follow it (up to and including a `result`) fold into one agent
 * turn via the shared `eventsToTurn` reducer.
 * @param {Array<{type:string, data?:object}>} events
 * @returns {Array<object>} turns
 */
export function eventsToTurns(events) {
  const list = Array.isArray(events) ? events : [];
  const turns = [];
  let agentBuf = [];

  const flushAgent = () => {
    if (!agentBuf.length) return;
    const t = eventsToTurn(agentBuf);
    turns.push({
      role: 'agent',
      reply: t.reply,
      steps: t.steps.map((s) => ({ summary: labelStep(s) })),
      error: t.error,
      done: true,
    });
    agentBuf = [];
  };

  for (const ev of list) {
    if (ev.type === 'user_text') {
      flushAgent();
      turns.push({ role: 'user', reply: ev.data?.text || '', steps: [], done: true, error: false });
    } else {
      agentBuf.push(ev);
    }
  }
  flushAgent();
  return turns;
}

/**
 * Compute the panel's initial turns from a /history response, or null to keep
 * the default greeting. Non-empty history → the greeting (chips off) followed
 * by the reconstructed turns; empty history or an error → null (no change).
 * @param {object} greeting The default greeting turn.
 * @param {{events?:Array, error?:object}} res The /history response.
 * @returns {Array<object>|null}
 */
export function rehydratedTurns(greeting, res) {
  if (!res || res.error) return null;
  const turns = eventsToTurns(res.events);
  if (!turns.length) return null;
  return [{ ...greeting, introChips: false }, ...turns];
}
