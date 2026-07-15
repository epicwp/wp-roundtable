/** @jsx h */
import { h } from 'preact';
import {
  useEffect, useRef, useState,
} from 'preact/hooks';
import { renderMarkdown } from './markdown.js';
import { streamMessage, sendMessage, resetChat, createDraft, publishCase } from './api.js';
import { eventsToTurn } from './events.js';
import { canDraftTopic, turnsToConversation } from './conversation.js';
import { PublishDialog } from './publish-dialog.jsx';
import { AgentAvatar, agentDisplayName } from './avatars.jsx';
import { labelStep } from './steps.js';
import { CHAT_GREETING, NEW_TOPIC_INTRO, TOPIC_CHIPS } from './chat-copy.js';

const STREAM_FIRST_EVENT_TIMEOUT_MS = 15000;

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
  setTurns((t) => [...t, { role: 'user', reply: text, steps: [], error: false, at: Date.now() }]);
  setTurns((t) => [...t, {
    role: 'agent', reply: '', steps: [], done: false, error: false, at: Date.now(),
  }]);
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
      const now = Date.now();
      setTurns((t) => applyStreamEvent(t, ev, now));
    },
    onError: async () => {
      clearTimeout(timer);
      if (streamed) {
        setTurns((t) => applyStreamEvent(t, { type: 'error' }, Date.now()));
        setBusy(false);
      } else {
        await fallback();
      }
    },
    onDone: () => {
      clearTimeout(timer);
      // Belt-and-suspenders: if the stream ended without a `result` event,
      // applyStreamEvent never got a chance to fall back to a captured
      // finalText (e.g. an assistant_text refusal). Reconcile here so the
      // turn still shows something instead of rendering empty.
      setTurns((t) => {
        if (!t.length) return t;
        const last = t[t.length - 1];
        if (last.reply === '' && last.finalText) {
          const next = t.slice();
          next[next.length - 1] = { ...last, reply: last.finalText, done: true };
          return next;
        }
        return t;
      });
      setBusy(false);
    },
  });
}

/**
 * Fold one streamed hub event onto the last (in-flight agent) turn.
 * guarded_text_delta keeps accumulating onto `reply` even after `result` —
 * the guard flushes a trailing delta after `result`, so accumulation must not
 * stop there. assistant_text is stored as `finalText` without touching
 * `reply`, so it never overwrites (and duplicates) a delta-built reply. On
 * `result`, if no deltas arrived (`reply` is still empty) but a `finalText`
 * was captured — e.g. an off-topic refusal, or a turn the model didn't
 * stream partial-message deltas for — it becomes the reply, so the turn
 * doesn't render as empty.
 * @param {Array} turns
 * @param {{type:string, text?:string, summary?:string}} ev
 * @param {number} now current time (ms), used to stamp step/completion timestamps
 * @returns {Array} new turns array
 */
export function applyStreamEvent(turns, ev, now) {
  if (!turns.length) return turns;
  const i = turns.length - 1;
  const turn = turns[i];
  let patch;
  if (ev.type === 'guarded_text_delta') patch = { reply: turn.reply + (ev.text || '') };
  else if (ev.type === 'assistant_text') patch = { finalText: ev.text };
  else if (ev.type === 'progress') patch = { steps: [...turn.steps, { summary: ev.summary, at: now }] };
  else if (ev.type === 'result') {
    const base = ev.is_error === true
      ? { done: true, error: true, doneAt: now }
      : { done: true, doneAt: now };
    patch = (turn.reply === '' && turn.finalText)
      ? { ...base, reply: turn.finalText }
      : base;
  } else if (ev.type === 'error') patch = { error: true };
  else return turns;
  const next = turns.slice();
  next[i] = { ...turn, ...patch };
  return next;
}

/**
 * Steps shown to the user: drops the "Working on it" placeholder frame, which
 * only exists to drive the immediate thinking indicator (see Bubble) and is
 * not a real step.
 * @param {Array<{summary:string, at?:number}>} steps
 * @returns {Array}
 */
export function visibleSteps(steps) {
  return (steps || []).filter((s) => s.summary !== 'Working on it');
}

/**
 * Format the time a step took: (next step's timestamp, or the turn's
 * completion timestamp) minus this step's timestamp.
 * @param {{at?:number}} step
 * @param {number} [nextAt]
 * @returns {string|null} e.g. "1.2s" or "80ms", or null if not measurable
 */
export function stepDuration(step, nextAt) {
  if (step?.at == null || nextAt == null) return null;
  const ms = nextAt - step.at;
  if (ms < 0) return null;
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
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

/**
 * Local HH:MM for a message timestamp.
 * @param {number} ms
 * @returns {string}
 */
function formatTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ThinkingDots() {
  return (
    <span class="rt-thinking" aria-hidden="true">
      <span class="rt-thinking-dot" />
      <span class="rt-thinking-dot" />
      <span class="rt-thinking-dot" />
    </span>
  );
}

/**
 * Advance a "shown length" toward target.length on an interval, revealing
 * more per tick the further behind it is (so a big chunk lands smoothly
 * instead of snapping). While inactive, shown tracks the full text.
 * @param {string} text
 * @param {boolean} active
 * @returns {number} shown length
 */
function useTypewriter(text, active) {
  const [shown, setShown] = useState(() => (active ? 0 : text.length));
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    if (!active) {
      setShown(textRef.current.length);
      return undefined;
    }
    const id = setInterval(() => {
      setShown((s) => {
        const total = textRef.current.length;
        if (s >= total) return s;
        const step = Math.max(1, Math.ceil((total - s) / 10));
        return Math.min(total, s + step);
      });
    }, 24);
    return () => clearInterval(id);
  }, [active]);

  return active ? Math.min(shown, text.length) : text.length;
}

/**
 * The reply bubble content. Types out `turn.reply` character-by-character
 * while `streaming` is true; otherwise renders the full text immediately.
 */
function TypedBubble({ turn, streaming }) {
  const shown = useTypewriter(turn.reply, streaming);
  const text = streaming ? turn.reply.slice(0, shown) : turn.reply;
  return (
    <div class={'rt-ab' + (turn.error ? ' rt-ab-error' : '')}
         // eslint-disable-next-line react/no-danger
         dangerouslySetInnerHTML={{ __html: turn.error ? 'Something went wrong. Please try again.' : renderMarkdown(text) }} />
  );
}

function Bubble({ turn, onChipSend, chipDisabled }) {
  if (turn.role === 'user') {
    return (
      <div class="rt-user-wrap">
        <div class="rt-user">{turn.reply}</div>
        {turn.at && <div class="rt-time">{formatTime(turn.at)}</div>}
      </div>
    );
  }
  const agentName = agentDisplayName();
  const steps = turn.steps || [];
  const n = steps.length;
  const vsteps = visibleSteps(steps);
  // Only the turn sendTurn is currently streaming carries done:false explicitly
  // (static turns — greeting, buffered-fallback replies, ... — leave done unset).
  const streaming = turn.done === false && !turn.error;
  const thinking = streaming && turn.reply === '';
  return (
    <div class="rt-agent-turn">
      <AgentAvatar size="sm" class="rt-agent-ava" />
      <div class="rt-agent-body">
        <span class="rt-name">{agentName}</span>
        {thinking ? (
          <div class="rt-ab rt-ab-thinking">
            <ThinkingDots />
          </div>
        ) : (
          <TypedBubble turn={turn} streaming={streaming} />
        )}
        {turn.introChips && <TopicChips disabled={chipDisabled} onSend={onChipSend} />}
        {n > 0 && !turn.done && (
          <div class="rt-activity-live">⏺ {steps[n - 1].summary}</div>
        )}
        {turn.done && vsteps.length > 0 && (
          <details class="rt-activity">
            <summary>Code doorzocht · {vsteps.length} {vsteps.length === 1 ? 'stap' : 'stappen'}</summary>
            <ul>
              {vsteps.map((s, i) => {
                const nextAt = i + 1 < vsteps.length ? vsteps[i + 1].at : turn.doneAt;
                const dur = stepDuration(s, nextAt);
                return <li key={i}>{dur ? `${s.summary} · ${dur}` : s.summary}</li>;
              })}
            </ul>
          </details>
        )}
        {turn.at && <div class="rt-time">{formatTime(turn.at)}</div>}
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

export function Thread({
  turns, onChipSend, chipDisabled, threadRef,
}) {
  return (
    <div class="rt-thread" ref={threadRef}>
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
  const threadRef = useRef(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    if (resetNonce > 0) newTopic();
  }, [resetNonce]);

  // Track whether the user is parked near the bottom, via real scroll events
  // rather than recomputing from post-update scrollHeight (which would
  // already reflect newly streamed content and read as "far from bottom").
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return undefined;
    const onScroll = () => {
      stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  // Stick to the bottom as new turns/deltas arrive, unless the user scrolled
  // up to read history.
  useEffect(() => {
    const el = threadRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [turns]);

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
      <Thread turns={turns} chipDisabled={busy || draftBusy} onChipSend={(msg) => send(msg)} threadRef={threadRef} />
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