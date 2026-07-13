/** @jsx h */
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { fetchMyCases } from './api.js';
import { mapCaseToTopic } from './topics.js';
import { TopicRow } from './topic-list.jsx';

function DraftRow({ topic, onReview }) {
  return (
    <div class="rt-draft">
      <div class="rt-draft-icon" aria-hidden="true">✎</div>
      <div class="rt-draft-main">
        <div class="rt-draft-title">{topic.title}</div>
        <div class="rt-draft-meta">
          <span class="rt-badge rt-b-draft">Draft</span>
          <span class="rt-dot">·</span>
          <span>Only you can see this</span>
          {topic.age ? <span><span class="rt-dot">·</span>{topic.age}</span> : null}
        </div>
      </div>
      <div class="rt-draft-actions">
        <button type="button" class="rt-btn-sm rt-btn-pub" onClick={() => onReview(topic)}>Review &amp; publish</button>
      </div>
    </div>
  );
}

function SectionHead({ title, hint }) {
  return (
    <div class="rt-sechead">
      <h2 class="rt-sechead-title">{title}</h2>
      {hint ? <span class="rt-sechead-hint">{hint}</span> : null}
      <span class="rt-sechead-line" />
    </div>
  );
}

export function StartedList({ refreshNonce = 0, onSelectTopic, onReviewDraft }) {
  const [drafts, setDrafts] = useState([]);
  const [published, setPublished] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      const res = await fetchMyCases();
      if (cancelled) return;
      setLoading(false);
      if (res.error) {
        setError(true);
        setDrafts([]);
        setPublished([]);
        return;
      }
      const topics = (res.cases || []).map(mapCaseToTopic);
      setDrafts(topics.filter((t) => t.isDraft));
      setPublished(topics.filter((t) => !t.isDraft));
    })();
    return () => { cancelled = true; };
  }, [refreshNonce]);

  if (loading) return <div class="rt-list-msg">Loading your topics…</div>;
  if (error) return <div class="rt-list-msg rt-list-error">Could not load your topics. Try again.</div>;
  if (drafts.length === 0 && published.length === 0) {
    return <div class="rt-list-msg">No topics started yet. Use Sage on the right to draft one.</div>;
  }

  return (
    <div class="rt-started-area">
      {drafts.length > 0 && (
        <div class="rt-started-block">
          <SectionHead title="Drafts" hint={`${drafts.length} · only you can see these`} />
          <div class="rt-list">
            {drafts.map((t) => <DraftRow key={t.id} topic={t} onReview={onReviewDraft} />)}
          </div>
        </div>
      )}
      {published.length > 0 && (
        <div class="rt-started-block">
          <SectionHead title="Started by me" hint={`${published.length} published`} />
          <div class="rt-list">
            {published.map((t) => <TopicRow key={t.id} topic={t} onSelect={onSelectTopic} />)}
          </div>
        </div>
      )}
    </div>
  );
}