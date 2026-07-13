/** @jsx h */
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { renderMarkdown } from './markdown.js';
import { eventsToTurn } from './events.js';
import { sendMessage, resetChat } from './api.js';

function Bubble({ turn }) {
  if (turn.role === 'user') return <div class="rt-user">{turn.reply}</div>;
  return (
    <div class="rt-turn">
      <span class="rt-name">{window.RoundtableConfig?.agentName || 'Sage'}</span>
      <div class={'rt-ab' + (turn.error ? ' rt-ab-error' : '')}
           // eslint-disable-next-line react/no-danger
           dangerouslySetInnerHTML={{ __html: turn.error ? 'Something went wrong. Please try again.' : renderMarkdown(turn.reply) }} />
    </div>
  );
}

export function Thread({ turns }) {
  return <div class="rt-thread">{turns.map((t, i) => <Bubble key={i} turn={t} />)}</div>;
}

export function ChatPanel({ resetNonce = 0 }) {
  const [turns, setTurns] = useState([{
    role: 'agent', reply: "Hi — I'm here to help. Ask a question, report something off, or suggest an improvement.", steps: [], error: false,
  }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (resetNonce > 0) newTopic();
  }, [resetNonce]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setTurns((t) => [...t, { role: 'user', reply: text, steps: [], error: false }]);
    setBusy(true);
    const res = await sendMessage(text);
    setBusy(false);
    if (res.error) {
      setTurns((t) => [...t, { role: 'agent', reply: '', steps: [], error: true }]);
      return;
    }
    setTurns((t) => [...t, { role: 'agent', ...eventsToTurn(res.events) }]);
  }

  async function newTopic() {
    if (busy) return;
    await resetChat();
    setTurns([{ role: 'agent', reply: "Let's start a new topic. What's going on?", steps: [], error: false }]);
  }

  return (
    <div class="rt-panel">
      <div class="rt-head">
        <div class="rt-avatar">S</div>
        <b>{window.RoundtableConfig?.agentName || 'Sage'}</b>
        <button class="rt-newtopic" type="button" onClick={newTopic}>+ New topic</button>
      </div>
      <Thread turns={turns} />
      {busy && <div class="rt-working">Working…</div>}
      <div class="rt-composer">
        <textarea rows="2" placeholder="Message…" value={draft}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button class="rt-send" type="button" disabled={busy} onClick={send}>Send</button>
      </div>
    </div>
  );
}
