// assets/src/events.js — match backend TurnResult::steps() (tool_step + progress only).
import { collectSteps } from './steps.js';

/**
 * Fold a turn's ordered events into a view model.
 * @param {Array<{type:string,data:Object}>} events
 * @returns {{reply:string, steps:Array, outcome:Object|null, error:boolean}}
 */
export function eventsToTurn(events) {
  const turn = { reply: '', steps: [], outcome: null, error: false };
  const list = Array.isArray(events) ? events : [];
  for (const ev of list) {
    if (ev.type === 'assistant_text' && typeof ev.data?.text === 'string') turn.reply += ev.data.text;
    else if (ev.type === 'error') turn.error = true;
    else if (ev.type === 'result') {
      turn.outcome = ev.data || null;
      if (ev.data?.is_error) turn.error = true;
    }
  }
  turn.steps = collectSteps(list);
  return turn;
}