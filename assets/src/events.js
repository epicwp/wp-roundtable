// assets/src/events.js
const STEP_TYPES = new Set(['thinking', 'tool_step', 'tool_result', 'progress']);

/**
 * Fold a turn's ordered events into a view model.
 * @param {Array<{type:string,data:Object}>} events
 * @returns {{reply:string, steps:Array, outcome:Object|null, error:boolean}}
 */
export function eventsToTurn(events) {
  const turn = { reply: '', steps: [], outcome: null, error: false };
  for (const ev of Array.isArray(events) ? events : []) {
    if (ev.type === 'assistant_text' && typeof ev.data?.text === 'string') turn.reply += ev.data.text;
    else if (ev.type === 'error') turn.error = true;
    else if (ev.type === 'result') {
      turn.outcome = ev.data || null;
      if (ev.data?.is_error) turn.error = true;
    }
    else if (STEP_TYPES.has(ev.type)) turn.steps.push(ev);
  }
  return turn;
}
