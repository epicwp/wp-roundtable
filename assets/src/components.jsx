/** @jsx h */
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { renderMarkdown } from './markdown.js';
import { eventsToTurn } from './events.js';
import { sendMessage, resetChat, createDraft, publishCase } from './api.js';
import { canDraftTopic, turnsToConversation } from './conversation.js';
import { PublishDialog } from './publish-dialog.jsx';
import { AgentAvatar, agentDisplayName } from './avatars.jsx';

function Bubble({ turn }) {
  if (turn.role === 'user') return <div class="rt-user">{turn.reply}</div>;
  const agentName = agentDisplayName();
  return (
    <div class="rt-agent-turn">
      <AgentAvatar size="sm" class="rt-agent-ava" />
      <div class="rt-agent-body">
        <span class="rt-name">{agentName}</span>
        <div class={'rt-ab' + (turn.error ? ' rt-ab-error' : '')}
             // eslint-disable-next-line react/no-danger
             dangerouslySetInnerHTML={{ __html: turn.error ? 'Something went wrong. Please try again.' : renderMarkdown(turn.reply) }} />
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
          <button type="button" class="rt-btn-primary" disabled={busy} onClick={onReview}>Review &amp; publish</button>
          <button type="button" class="rt-btn-secondary" disabled={busy} onClick={onDiscard}>Discard</button>
        </div>
      </div>
    </div>
  );
}

export function Thread({ turns }) {
  return <div class="rt-thread">{turns.map((t, i) => <Bubble key={i} turn={t} />)}</div>;
}

export function ChatPanel({ resetNonce = 0, onTopicPublished }) {
  const [turns, setTurns] = useState([{
    role: 'agent', reply: "Hi — I'm here to help. Ask a question, report something off, or suggest an improvement.", steps: [], error: false,
  }]);
  const [composer, setComposer] = useState('');
  const [busy, setBusy] = useState(false);
  const [topicDraft, setTopicDraft] = useState(null);
  const [showPublish, setShowPublish] = useState(false);
  const [draftBusy, setDraftBusy] = useState(false);

  useEffect(() => {
    if (resetNonce > 0) newTopic();
  }, [resetNonce]);

  async function send() {
    const text = composer.trim();
    if (!text || busy) return;
    setComposer('');
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
    if (busy || draftBusy) return;
    await resetChat();
    setTopicDraft(null);
    setShowPublish(false);
    setTurns([{ role: 'agent', reply: "Let's start a new topic. What's going on?", steps: [], error: false }]);
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

  async function confirmPublish({ title, summary }) {
    if (!topicDraft?.id || draftBusy) return;
    setDraftBusy(true);
    const res = await publishCase({ case_id: topicDraft.id, title, summary });
    setDraftBusy(false);
    if (res.error) return;
    setShowPublish(false);
    setTopicDraft(null);
    setTurns((t) => [...t, {
      role: 'agent',
      reply: `Published **${res.case.title}** to the community. It should appear in the list on the left.`,
      steps: [],
      error: false,
    }]);
    onTopicPublished?.();
  }

  const agentName = agentDisplayName();

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
      <Thread turns={turns} />
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
        <div class="rt-draft-cta">
          <button type="button" class="rt-btn-primary" disabled={busy || draftBusy} onClick={turnIntoTopic}>
            {draftBusy ? 'Drafting…' : 'Turn into topic'}
          </button>
        </div>
      )}
      {busy && <div class="rt-working">Working…</div>}
      <div class="rt-composer">
        <div class="rt-cbox">
          <textarea rows="1" placeholder="Message Sage…" value={composer}
            onInput={(e) => setComposer(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button class="rt-send-icon" type="button" disabled={busy} onClick={send} aria-label="Send">➤</button>
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