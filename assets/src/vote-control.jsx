/** @jsx h */
import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { castVote, retractVote } from './api.js';

/**
 * Interactive up/down vote control for a public topic.
 * @param {{caseId:string, net:number, onChange?:(tally:object)=>void}} props
 */
export function VoteControl({ caseId, net: initialNet, onChange }) {
  const [net, setNet] = useState(initialNet);
  const [myVote, setMyVote] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNet(initialNet);
  }, [initialNet, caseId]);

  async function apply(value) {
    if (busy) return;
    setBusy(true);
    const res = myVote === value
      ? await retractVote(caseId)
      : await castVote(caseId, value);
    setBusy(false);
    if (res.error || !res.tally) return;
    setNet(res.tally.net);
    setMyVote(res.tally.my_vote ?? null);
    onChange && onChange(res.tally);
  }

  return (
    <div
      class="rt-vote"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        class={'rt-vote-btn' + (myVote === 1 ? ' on-up' : '')}
        disabled={busy}
        aria-label="Upvote"
        aria-pressed={myVote === 1}
        onClick={() => apply(1)}
      >▲</button>
      <span class="rt-vote-n">{net}</span>
      <button
        type="button"
        class={'rt-vote-btn' + (myVote === -1 ? ' on-dn' : '')}
        disabled={busy}
        aria-label="Downvote"
        aria-pressed={myVote === -1}
        onClick={() => apply(-1)}
      >▼</button>
    </div>
  );
}