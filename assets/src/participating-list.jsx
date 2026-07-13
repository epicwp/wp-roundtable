/** @jsx h */
import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { fetchParticipatingCases } from './api.js';
import { mapCaseToTopic } from './topics.js';
import { TopicRow } from './topic-list.jsx';

const TYPE_SEGS = [
  { id: '', label: 'All' },
  { id: 'question', label: 'Questions' },
  { id: 'bug', label: 'Bugs' },
  { id: 'feature_request', label: 'Features' },
];

const TYPE_CLASS_TO_ID = {
  'rt-b-q': 'question',
  'rt-b-bug': 'bug',
  'rt-b-feat': 'feature_request',
};

export function ParticipatingList({ refreshNonce = 0, onSelectTopic }) {
  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      const res = await fetchParticipatingCases();
      if (cancelled) return;
      setLoading(false);
      if (res.error) {
        setError(true);
        setTopics([]);
        return;
      }
      setTopics((res.cases || []).map(mapCaseToTopic));
    })();
    return () => { cancelled = true; };
  }, [refreshNonce]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return topics.filter((topic) => {
      if (type && TYPE_CLASS_TO_ID[topic.typeClass] !== type) return false;
      if (!needle) return true;
      const haystack = `${topic.title} ${topic.snippet}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [topics, q, type]);

  return (
    <div class="rt-list-area">
      <div class="rt-toolbar">
        <div class="rt-search">
          <input
            type="search"
            placeholder="Search topics you joined…"
            value={q}
            onInput={(e) => setQ(e.currentTarget.value)}
          />
        </div>
        <div class="rt-segs">
          {TYPE_SEGS.map((s) => (
            <button
              key={s.id || 'all'}
              type="button"
              class={type === s.id ? 'on' : ''}
              onClick={() => setType(s.id)}
            >{s.label}</button>
          ))}
        </div>
      </div>
      <div class="rt-list">
        {loading && <div class="rt-list-msg">Loading your topics…</div>}
        {!loading && error && <div class="rt-list-msg rt-list-error">Could not load your topics. Try again.</div>}
        {!loading && !error && filtered.length === 0 && (
          <div class="rt-list-msg">
            {topics.length === 0
              ? 'You have not commented or voted on any topics yet.'
              : 'No matching topics in your participating list.'}
          </div>
        )}
        {!loading && !error && filtered.map((t) => (
          <TopicRow key={t.id} topic={t} onSelect={onSelectTopic} />
        ))}
      </div>
    </div>
  );
}