/** @jsx h */
import { h } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { fetchComments, postComment } from './api.js';
import { renderMarkdown } from './markdown.js';
import { mapCommentToView } from './topics.js';
import { VoteControl } from './vote-control.jsx';

function CommentRow({ comment }) {
  return (
    <div class="rt-cm">
      <div class="rt-cm-ava" aria-hidden="true">{comment.initials}</div>
      <div class="rt-cm-body">
        <div class="rt-cm-who">
          <b>{comment.handle}</b>
          {comment.age ? <span class="rt-cm-time">{comment.age}</span> : null}
        </div>
        {comment.isTombstone
          ? <p class="rt-cm-tomb">{comment.tombstoneLabel}</p>
          : <div class="rt-cm-txt rt-prose" dangerouslySetInnerHTML={{ __html: comment.html }} />}
      </div>
    </div>
  );
}

function CommentComposer({ caseId, onPosted }) {
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(false);

  const submit = async () => {
    const body = text.trim();
    if (!body || posting) return;
    setPosting(true);
    setError(false);
    const res = await postComment(caseId, body);
    setPosting(false);
    if (res.error) {
      setError(true);
      return;
    }
    setText('');
    onPosted();
  };

  return (
    <div class="rt-addwrap">
      <div class="rt-post-ava rt-you-ava" aria-hidden="true">Y</div>
      <div class="rt-editor">
        <textarea
          class="rt-ed-input"
          placeholder="Add a comment…"
          rows="3"
          value={text}
          disabled={posting}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <div class="rt-ed-foot">
          {error ? <span class="rt-ed-error">Could not post. Try again.</span> : <span class="rt-ed-hint">Markdown supported</span>}
          <button type="button" class="rt-post-btn" disabled={posting || !text.trim()} onClick={submit}>
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TopicDetail({ topic, onBack, onVoteChange }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const loadComments = useCallback(async (cancelledRef) => {
    setLoading(true);
    setError(false);
    const res = await fetchComments(topic.id);
    if (cancelledRef.cancelled) return;
    setLoading(false);
    if (res.error) {
      setError(true);
      setComments([]);
      return;
    }
    setComments((res.comments || []).map(mapCommentToView));
  }, [topic.id]);

  useEffect(() => {
    const cancelledRef = { cancelled: false };
    loadComments(cancelledRef);
    return () => { cancelledRef.cancelled = true; };
  }, [loadComments, refreshNonce]);

  return (
    <div class="rt-detail-area">
      <button type="button" class="rt-back" onClick={onBack}>← All topics</button>
      <div class="rt-detail-card">
        <div class="rt-th">
          <VoteControl caseId={topic.id} net={topic.net} onChange={onVoteChange} />
          <div class="rt-thd">
            <h2 class="rt-dtitle">{topic.title}</h2>
            <div class="rt-cmeta">
              <span class={'rt-badge ' + topic.typeClass}>{topic.typeLabel}</span>
              <span class={'rt-status ' + topic.statusClass}>{topic.statusLabel}</span>
              <span class="rt-dot">·</span>
              <span class="rt-handle">{topic.handle}</span>
              {topic.age ? <span class="rt-age-wrap"><span class="rt-dot">·</span><span>{topic.age}</span></span> : null}
            </div>
          </div>
        </div>
        <div class="rt-post">
          <div class="rt-post-ava" aria-hidden="true">{topic.initials}</div>
          <div class="rt-post-body">
            <div class="rt-post-who"><b>{topic.handle}</b>{topic.age ? <span> · {topic.age}</span> : null}</div>
            <div class="rt-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(topic.snippet) }} />
          </div>
        </div>
      </div>
      <div class="rt-csec">
        <h2 class="rt-csec-title">Comments</h2>
        <p class="rt-csec-cnt">
          {loading ? 'Loading…' : error ? 'Could not load comments.' : `${comments.length} comment${comments.length === 1 ? '' : 's'}`}
        </p>
        {!loading && !error && comments.length === 0 && <p class="rt-csec-empty">No comments yet.</p>}
        {!loading && !error && comments.length > 0 && (
          <div class="rt-cm-thread">
            {comments.map((c) => <CommentRow key={c.id} comment={c} />)}
          </div>
        )}
        <CommentComposer
          caseId={topic.id}
          onPosted={() => {
            setRefreshNonce((n) => n + 1);
            onVoteChange && onVoteChange();
          }}
        />
      </div>
    </div>
  );
}