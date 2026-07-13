/** @jsx h */
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { renderMarkdown } from './markdown.js';
import { eventsToTurn } from './events.js';
import { sendMessage, resetChat, createDraft, publishCase } from './api.js';
import { canDraftTopic, turnsToConversation } from './conversation.js';
import { PublishDialog } from './publish-dialog.jsx';
import { AgentAvatar, agentDisplayName } from './avatars.jsx';
import { labelStep } from './steps.js';
import { CHAT_GREETING, NEW_TOPIC_INTRO, TOPIC_CHIPS } from './chat-copy.js';

function StepLog({ steps }) {
  if (!steps?.length) return null;
  return (
    <ul class="rt-step-log">
      {steps.map((s, i) => <li key={i}>{labelStep(s)}</li>)}
    </ul>
  );
}

function TopicChips({ onPick, disabled }) {
  return (
    <div class="rt-chips">
      {TOPIC_CHIPS.map((c) => (
        <button key={c.id} type="button" class="rt-chip" disabled={disabled} onClick={() => onPick(c.starter)}>
          {c.label}
        </button>
      ))}
    </div>
  );
}

function Bubble({ turn, onChipPick, busy }) {
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
        {turn.introChips && <TopicChips disabled={busy} onPick={onChipPick} />}
        {!turn.error && <StepLog steps={turn.steps} />}
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

export function Thread({ turns, onChipPick, busy }) {
  return (
    <div class="rt-thread">
      {turns.map((t, i) => <Bubble key={i} turn={t} onChipPick={onChipPick} busy={busy} />)}
    </div>
  );
}

export function ChatPanel({ resetNonce = 0, onTopicPublished }) {
  const [newTopicMode, setNewTopicMode] = useState(false);
  const [turns, setTurns] = useState([{
    role: 'agent', reply: CHAT_GREETING, steps: [], error: false, introChips: false,
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
      reply: `Published **${res.case.title}** to the community. It should appear in the list on the left.`,
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
      <Thread turns={turns} busy={busy} onChipPick={(starter) => { setComposer(starter); }} />
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
      {busy && <div class="rt-working"><span class="rt-dots"><i /><i /><i /></span> Working…</div>}
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