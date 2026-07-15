/** @jsx h */
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { renderMarkdown } from './markdown.js';
import { streamMessage, sendMessage, resetChat, createDraft, publishCase } from './api.js';
import { eventsToTurn } from './events.js';
import { canDraftTopic, turnsToConversation } from './conversation.js';
import { PublishDialog } from './publish-dialog.jsx';
import { AgentAvatar, agentDisplayName } from './avatars.jsx';
import { labelStep } from './steps.js';
import { CHAT_GREETING, NEW_TOPIC_INTRO, TOPIC_CHIPS } from './chat-copy.js';

const STREAM_FIRST_EVENT_TIMEOUT_MS = 2000;

/**
 * Send one turn: start the stream, and fall back to the buffered endpoint if
 * onError fires before any stream event arrives, or nothing arrives within
 * `timeoutMs`. Once at least one event has streamed in, a later error just
 * ends the turn in an error state — the user already saw partial output, so
 * no fallback and no double-render.
 * @param {string} text
 * @param {{setTurns:Function, setBusy:Function, streamFn?:Function, sendFn?:Function, timeoutMs?:number}} opts
 */
export async function sendTurn(text, {
  setTurns, setBusy, streamFn = streamMessage, sendFn = sendMessage, timeoutMs = STREAM_FIRST_EVENT_TIMEOUT_MS,
}) {
  setTurns((t) => [...t, { role: 'user', reply: text, steps: [], error: false }]);
  setTurns((t) => [...t, { role: 'agent', reply: '', steps: [], done: false, error: false }]);
  setBusy(true);

  let streamed = false;
  const controller = new AbortController();
  const timer = setTimeout(() => { if (!streamed) controller.abort(); }, timeoutMs);

  async function fallback() {
    try {
      const res = await sendFn(text);
      if (res.error) {
        setTurns((t) => {
          const next = t.slice();
          const i = next.length - 1;
          next[i] = { ...next[i], error: true, done: true };
          return next;
        });
        return;
      }
      const turn = eventsToTurn(res.events);
      setTurns((t) => {
        const next = t.slice();
        const i = next.length - 1;
        next[i] = {
          ...next[i],
          reply: turn.reply,
          steps: turn.steps.map((s) => ({ summary: labelStep(s) })),
          error: turn.error,
          done: true,
        };
        return next;
      });
    } catch (e) {
      setTurns((t) => {
        const next = t.slice();
        const i = next.length - 1;
        next[i] = { ...next[i], error: true, done: true };
        return next;
      });
    } finally {
      setBusy(false);
    }
  }

  await streamFn(text, {
    signal: controller.signal,
    onEvent: (ev) => {
      streamed = true;
      clearTimeout(timer);
      setTurns((t) => applyStreamEvent(t, ev));
    },
    onError: async () => {
      clearTimeout(timer);
      if (streamed) {
        setTurns((t) => applyStreamEvent(t, { type: 'error' }));
        setBusy(false);
      } else {
        await fallback();
      }
    },
    onDone: () => {
      clearTimeout(timer);
      setBusy(false);
    },
  });
}

/**
 * Fold one streamed hub event onto the last (in-flight agent) turn.
 * guarded_text_delta keeps accumulating onto `reply` even after `result` —
 * the guard flushes a trailing delta after `result`, so accumulation must not
 * stop there. assistant_text is ignored: the deltas already sum to the full
 * guarded text, so snapping to it would duplicate the flushed tail.
 * @param {Array} turns
 * @param {{type:string, text?:string, summary?:string}} ev
 * @returns {Array} new turns array
 */
export function applyStreamEvent(turns, ev) {
  if (!turns.length) return turns;
  const i = turns.length - 1;
  const turn = turns[i];
  let patch;
  if (ev.type === 'guarded_text_delta') patch = { reply: turn.reply + (ev.text || '') };
  else if (ev.type === 'progress') patch = { steps: [...turn.steps, { summary: ev.summary }] };
  else if (ev.type === 'result') patch = { done: true };
  else if (ev.type === 'error') patch = { error: true };
  else return turns;
  const next = turns.slice();
  next[i] = { ...turn, ...patch };
  return next;
}

function StepLog({ steps }) {
  if (!steps?.length) return null;
  return (
    <ul class="rt-step-log">
      {steps.map((s, i) => <li key={i}>{labelStep(s)}</li>)}
    </ul>
  );
}

function TopicChips({ onSend, disabled }) {
  return (
    <div class="rt-chips">
      {TOPIC_CHIPS.map((c) => (
        <button key={c.id} type="button" class="rt-chip" disabled={disabled} onClick={() => onSend(c.message)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

function Bubble({ turn, onChipSend, chipDisabled }) {
  if (turn.role === 'user') return <div class="rt-user">{turn.reply}</div>;
  const agentName = agentDisplayName();
  const steps = turn.steps;
  const n = steps?.length || 0;
  return (
    <div class="rt-agent-turn">
      <AgentAvatar size="sm" class="rt-agent-ava" />
      <div class="rt-agent-body">
        <span class="rt-name">{agentName}</span>
        <div class={'rt-ab' + (turn.error ? ' rt-ab-error' : '')}
             // eslint-disable-next-line react/no-danger
             dangerouslySetInnerHTML={{ __html: turn.error ? 'Something went wrong. Please try again.' : renderMarkdown(turn.reply) }} />
        {turn.introChips && <TopicChips disabled={chipDisabled} onSend={onChipSend} />}
        {!turn.error && <StepLog steps={turn.steps} />}
        {n > 0 && !turn.done && (
          <div class="rt-activity-live">⏺ {steps[n - 1].summary}</div>
        )}
        {turn.done && n > 0 && (
          <details class="rt-activity">
            <summary>Code doorzocht · {n} {n === 1 ? 'stap' : 'stappen'}</summary>
            <ul>
              {steps.map((s, i) => <li key={i}>{s.summary}</li>)}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

function OutcomeCard({ topic, onReview, onDiscard, busy }) {
  return (
    <div class="rt-outcome">
      <div class="rt-outcome-icon">✓</div>
      <div class="rt-outcome-body">
        <b>Drafted a topic</b>
        <div class="rt-outcome-title">{topic.title}</div>
        <div class="rt-outcome-sub">Private for now — review &amp; publish, or discard.</div>
        <div class="rt-outcome-actions">
          <button type="button" class="rt-btn-pub-sm" disabled={busy} onClick={onReview}>Review &amp; publish</button>
          <button type="button" class="rt-btn-ghost" disabled={busy} onClick={onDiscard}>Discard</button>
        </div>
      </div>
    </div>
  );
}

function DraftPrompt({ busy, drafting, onDraft }) {
  return (
    <div class="rt-draft-prompt">
      <p>Ready to share this with the community?</p>
      <button type="button" class="rt-btn-pub-sm" disabled={busy || drafting} onClick={onDraft}>
        {drafting ? 'Drafting…' : 'Turn into topic'}
      </button>
    </div>
  );
}

export function Thread({ turns, onChipSend, chipDisabled }) {
  return (
    <div class="rt-thread">
      {turns.map((t, i) => <Bubble key={i} turn={t} onChipSend={onChipSend} chipDisabled={chipDisabled} />)}
    </div>
  );
}

export function ChatPanel({ resetNonce = 0, onTopicPublished }) {
  const [newTopicMode, setNewTopicMode] = useState(false);
  const [turns, setTurns] = useState([{
    role: 'agent', reply: CHAT_GREETING, steps: [], error: false, introChips: true,
  }]);
  const [composer, setComposer] = useState('');
  const [busy, setBusy] = useState(false);
  const [topicDraft, setTopicDraft] = useState(null);
  const [showPublish, setShowPublish] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);

  useEffect(() => {
    if (resetNonce > 0) newTopic();
  }, [resetNonce]);

  async function send(textOverride) {
    const text = (textOverride ?? composer).trim();
    if (!text || busy) return;
    setComposer('');
    await sendTurn(text, { setTurns, setBusy });
  }

  async function newTopic() {
    if (busy || draftBusy) return;
    setBusy(true);
    const res = await resetChat();
    setBusy(false);
    if (res.error) {
      setTurns((t) => [...t, { role: 'agent', reply: '', steps: [], error: true }]);
      return;
    }
    setNewTopicMode(true);
    setTopicDraft(null);
    setShowPublish(false);
    setTurns([{ role: 'agent', reply: NEW_TOPIC_INTRO, steps: [], error: false, introChips: true }]);
  }

  async function turnIntoTopic() {
    if (busy || draftBusy || topicDraft) return;
    const conversation = turnsToConversation(turns);
    if (!conversation) return;
    setDraftBusy(true);
    const res = await createDraft({ conversation });
    setDraftBusy(false);
    if (res.error) return;
    setTopicDraft(res.case);
  }

  async function confirmPublish({ title, summary, type }) {
    if (!topicDraft?.id || draftBusy) return;
    setDraftBusy(true);
    const res = await publishCase({ case_id: topicDraft.id, title, summary, type });
    setDraftBusy(false);
    if (res.error) return;
    setShowPublish(false);
    setTopicDraft(null);
    setTurns((t) => [...t, {
      role: 'agent',
      reply: `Submitted **${res.case.title}** for approval. You can track it under Started → Pending approval.`,
      steps: [],
      error: false,
    }]);
    onTopicPublished?.();
  }

  const agentName = agentDisplayName();
  const composerPlaceholder = newTopicMode ? 'Describe your topic…' : 'Message Sage…';

  return (
    <div class="rt-panel">
      <div class="rt-head">
        <AgentAvatar class="rt-avatar" />
        <div class="rt-head-text">
          <b>{agentName}</b>
          <span>Community assistant</span>
        </div>
        <span class="rt-head-grow" />
        <button class="rt-iconbtn" type="button" onClick={newTopic} title="New conversation" aria-label="New conversation">+</button>
      </div>
      <Thread turns={turns} chipDisabled={busy || draftBusy} onChipSend={(msg) => send(msg)} />
      {topicDraft && (
        <div class="rt-thread-extras">
          <OutcomeCard
            topic={topicDraft}
            busy={draftBusy}
            onReview={() => setShowPublish(true)}
            onDiscard={() => { setTopicDraft(null); setShowPublish(false); }}
          />
        </div>
      )}
      {!topicDraft && canDraftTopic(turns) && (
        <DraftPrompt busy={busy} drafting={draftBusy} onDraft={turnIntoTopic} />
      )}
      <div class="rt-composer">
        <div class="rt-cbox">
          <textarea rows="1" placeholder={composerPlaceholder} value={composer}
            onInput={(e) => setComposer(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button class="rt-send-icon" type="button" disabled={busy} onClick={() => send()} aria-label="Send">➤</button>
        </div>
        <div class="rt-chint">Enter to send · Shift+Enter for a new line</div>
      </div>
      {showPublish && topicDraft && (
        <PublishDialog
          draft={topicDraft}
          busy={draftBusy}
          onCancel={() => setShowPublish(false)}
          onPublish={confirmPublish}
        />
      )}
    </div>
  );
}