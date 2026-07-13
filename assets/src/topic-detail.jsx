/** @jsx h */
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { fetchComments } from './api.js';
import { renderMarkdown } from './markdown.js';
import { mapCommentToView } from './topics.js';

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

export function TopicDetail({ topic, onBack }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      const res = await fetchComments(topic.id);
      if (cancelled) return;
      setLoading(false);
      if (res.error) {
        setError(true);
        setComments([]);
        return;
      }
      setComments((res.comments || []).map(mapCommentToView));
    })();
    return () => { cancelled = true; };
  }, [topic.id]);

  return (
    <div class="rt-detail-area">
      <button type="button" class="rt-back" onClick={onBack}>← All topics</button>
      <div class="rt-detail-card">
        <div class="rt-th">
          <div class="rt-vote">
            <button type="button" class="rt-vote-btn" disabled aria-label="Upvote (read-only)">▲</button>
            <span class="rt-vote-n">{topic.net}</span>
            <button type="button" class="rt-vote-btn" disabled aria-label="Downvote (read-only)">▼</button>
          </div>
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
          <div class="rt-thread">
            {comments.map((c) => <CommentRow key={c.id} comment={c} />)}
          </div>
        )}
      </div>
    </div>
  );
}