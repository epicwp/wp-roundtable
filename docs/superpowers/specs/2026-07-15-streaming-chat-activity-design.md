# Streaming chat & live activity — design

**Date:** 2026-07-15
**Status:** Approved
**Scope:** Roundtable hub (Python) + wp-roundtable SDK (PHP) + Preact chat UI. Spec B in the chat-UX feedback series (spec A = `2026-07-14-chat-polish-naming-design.md`).

## Context

Feedback item 5: the chat must keep the user engaged. Today you type a message, it sits on a static "Working…" indicator, and then the whole reply appears at once — you never see that the assistant is doing anything. The user wants three things: the reply to **stream** (type out live), the "Working…" state to sit **where the reply will form** rather than as a detached line, and **visible activity** ("searching files…") so it's clear the assistant is actually working.

The hub already streams Server-Sent Events and its pipeline yields each contract event as the agent produces it. Two buffers erase that liveness before it reaches the browser: the SDK reads the hub response with `wp_remote_post` (which waits for the whole body), and `MessageController::handle()` runs the whole turn and returns one JSON blob. This spec breaks both buffers and adds the pieces needed to stream real tokens and live activity safely.

### Decisions taken (with the user)

- **Full token streaming in one spec**, including a new streaming-aware output guard — not a plumbing-only MVP.
- **Activity display:** one live status line under the forming reply during the turn, collapsing to an expandable "Code doorzocht · N steps" affordance when the reply lands. Not permanent separate messages; not fully ephemeral.
- **Activity phrasing is produced in the hub**, respecting `Project.repo_private`: specific where allowed (public repo: `Reading price.php`), generic where not (private repo, e.g. PLLAT: `Reading a file`). The private-repo floor that strips `tool_input` stays a hard filter.
- **Chat output guard is narrowed:** keep only the hard secret/private-key redaction (near-zero quality cost, catches a real leak); **drop the >40-line code-block truncation.** The built plugin already ships to customers, so quoting its code is not sensitive, and dropping truncation makes the streaming guard much simpler (no need to hold an open code fence). Add one soft system-prompt line telling the agent not to share secrets from the code — defense in depth, not the boundary.
- **Transport/auth:** the browser consumes the stream with `fetch()` + a `ReadableStream`, not `EventSource`, so the existing `X-WP-Nonce` header auth is preserved and `Rest\Gate` is untouched.
- **Graceful fallback:** if streaming fails (host buffers output, curl unavailable), the browser falls back to the existing buffered `/message` and renders as today, including the collapsed step list.

### Explicitly out of scope

- The case-publish redaction over-redacting brand names (Claude → `[ORG]`) is a **separate** issue: [epicwp/roundtable-hub#43](https://github.com/epicwp/roundtable-hub/issues/43). That is the publish-time semantic `RedactionAgent`, not the chat-time `guard_output` this spec touches.

## Why the guard is the crux, and the invariant that de-risks it

`guard_output` (hub `agent/output_guard.py`) runs on the *complete* reply text. After this spec it does exactly one thing: redact PEM private-key blocks and the known secret-token patterns (`ghp_…`, `AKIA…`, `xox…`) to `[REDACTED]`. (The code-block truncation is removed per the decision above; its `test_output_guard.py` cases are removed with it.)

Streaming means text arrives token-by-token, so the guard can no longer see the whole string at once. The design does **not** invent new redaction logic. Instead a stateful `StreamingGuard` releases only a **provably safe prefix** of the accumulated buffer and holds a bounded tail:

- Hold back the last `MAX_SECRET_TAIL` characters (the longest bounded secret-token pattern, derived from the pattern definitions, ~64) so a token split across a delta boundary is never half-released.
- Hold from any unmatched `-----BEGIN … PRIVATE KEY-----` marker until its `-----END-----` arrives (PEM spans are unbounded).
- The released prefix, `buffer[:hold_from]`, contains only *complete* patterns, so `guard_output(buffer[:hold_from])` fully redacts it and nothing in it can change with future deltas.
- On turn end, flush: run `guard_output` over the entire remaining buffer and release it.

**The security anchor and primary test — the invariant:** for *any* split of a reply into deltas, the concatenation of everything `StreamingGuard` releases is **byte-identical** to `guard_output(full_text)`. We prove the incremental guard equals the batch guard rather than trusting a second implementation. This is property-tested against the existing `output_guard` corpus with adversarial splits — secret patterns broken at every byte offset.

Dropping code-block truncation removes the only unbounded hold-back reason, so the guard never withholds a large open code block — typing stays snappy and the guard stays small.

## Architecture (data flow)

```
Claude Agent SDK (include_partial_messages = TRUE)          hub: agent/role1.py
  → map_message: TextDeltaEvent (raw) · ToolStepEvent · ResultEvent
  → StreamingGuard (NEW): raw TextDeltaEvent in → GuardedTextDeltaEvent out
  → StepSummarizer (NEW): ToolStepEvent → ProgressEvent(summary), respects repo_private
  → event_filter: still drops raw TextDeltaEvent + ThinkingEvent; passes GuardedTextDeltaEvent
  → SSE text/event-stream                                    hub: api/chat.py (already streams)
SDK (PHP):
  → StreamingTransport (NEW, curl CURLOPT_WRITEFUNCTION — wp_remote_post cannot read incrementally)
  → StreamController (NEW): POST /roundtable/v1/message/stream
       takes over REST output via rest_pre_serve_request, sets SSE headers, pumps each frame + flush;
       same Rest\Gate; markPrimed only after the turn completes successfully
Browser:
  → fetch() + ReadableStream (keeps X-WP-Nonce header; Rest\Gate unchanged)
  → live typing from GuardedTextDeltaEvent · live status line from progress · collapse on result
  → on stream failure/timeout: fall back to buffered POST /roundtable/v1/message
```

## Components

### Hub (Python)

- **`agent/events.py`** — add `GuardedTextDeltaEvent` (`type="guarded_text_delta"`, `text: str`). Keep the existing (unused-downstream) `ProgressEvent(summary)`.
- **`agent/output_guard.py`** — remove the code-block truncation; `guard_output` now only redacts secrets/PEM. Update `test_output_guard.py`.
- **`agent/streaming_guard.py` (NEW)** — the stateful `StreamingGuard` above. One clear responsibility: turn a raw delta stream into safe `GuardedTextDeltaEvent`s plus a final flush, with the batch-equality invariant.
- **`agent/step_summarizer.py` (NEW)** — map a `ToolStepEvent(tool, tool_input)` to a `ProgressEvent(summary)`. `tool` is only ever `Read`/`Glob`/`Grep` (the agent is read-only). Public repo: weave in the file/pattern (`Reading price.php`, `Searching for "price"`). Private repo (`repo_private=True`): generic (`Reading a file`, `Searching the code`). Never emit `tool_input` for a private repo — the existing floor in `event_filter.py` remains the hard guarantee.
- **`agent/role1.py`** — set `include_partial_messages=True`; add one system-prompt line: never include secrets, credentials, API keys, or private keys from the codebase in a reply. Update the three `include_partial_messages is False` assertions in `test_role1_agent.py`.
- **`agent/event_filter.py`** — unchanged behavior for raw `TextDeltaEvent` (still dropped — the belt-and-suspenders test stays green) and `ThinkingEvent`; pass `GuardedTextDeltaEvent`. The layered defense is intact: raw deltas are swallowed by `StreamingGuard` before the filter, and if one ever reached the filter it is still dropped.
- **`services/chat_pipeline.py`** — insert `StreamingGuard` and `StepSummarizer` into `run_turn`'s per-event loop where `_guard` sits today; `_guard` still guards the final `AssistantTextEvent`. The pipeline stays a true incremental generator.
- **`api/chat.py`** — no shape change; it already SSE-frames whatever events the pipeline yields.

### SDK (PHP)

- **`src/Http/StreamingTransport.php` (NEW)** + interface seam — curl with `CURLOPT_WRITEFUNCTION`, invoking a per-frame callback as SSE frames arrive. `WpHttpTransport` stays for all buffered calls. A `FakeStreamingTransport` test double drives the controller tests.
- **`src/HubClient.php`** — a `streamMessage(chatId, message, isFirstTurn, onEvent)` path parallel to `postMessage`, parsing frames incrementally (reuse `SseParser`'s frame-decode on a per-frame basis) and invoking `onEvent` per `Event`. First-turn `metadata`/`client_version` priming is unchanged.
- **`src/StreamController.php` (NEW)** — registers `POST /roundtable/v1/message/stream`, gated by the shared `Rest\Gate`. In the callback it hooks `rest_pre_serve_request`, sends `text/event-stream` headers, disables output buffering, pumps each hub frame to the client with `flush()`, and calls `Session::markPrimed()` only after the hub turn completes successfully (preserving the at-least-once first-turn priming). The buffered `MessageController` (`POST /roundtable/v1/message`) stays as the fallback endpoint.

### UI (Preact)

- **Stream client** — `fetch()` the stream endpoint with the `X-WP-Nonce` header, read the `ReadableStream`, and parse SSE frames incrementally into events.
- **Live rendering** — accumulate `guarded_text_delta` text into the forming agent bubble (real live typing). Show one live status line under the bubble from the latest `progress` summary; on `result`, collapse the collected steps into an expandable "Code doorzocht · N steps". Remove the detached `rt-working` "Working…" indicator — the status line now sits where the reply forms. On the final `assistant_text`, snap the bubble to the guarded full text (equal to the accumulated deltas by the invariant).
- **Fallback** — if the stream errors or no frame arrives within a short timeout (~2s), abort and call the existing buffered `sendMessage()`, rendering the reply and the collapsed step list as today.

## Error handling

- Gate refusals (blocked 403, over-quota 429) still surface as HTTP status before any stream starts — the hub's peek-first pattern already does this; the SDK stream path must propagate the status to the browser before switching into SSE mode so the UI shows the same refusal it shows today.
- Mid-stream hub error → an `error` event; the UI renders the existing error bubble and stops typing.
- `markPrimed()` fires only on successful turn completion, so a client disconnect or a failed stream leaves the session un-primed and the next turn re-sends first-turn context (unchanged at-least-once semantics).

## Testing

- **Hub:** `StreamingGuard` invariant (released concatenation == `guard_output(full)`) property-tested with adversarial splits of the `output_guard` corpus; `guard_output` without code truncation; `event_filter` (raw `TextDeltaEvent` dropped, `GuardedTextDeltaEvent` passed); `role1` (`include_partial_messages=True`, system-prompt line present); `chat_pipeline` (guarded deltas + progress summaries emitted in order); `StepSummarizer` respects `repo_private` (never leaks `tool_input` when private).
- **SDK:** `StreamingTransport` against the fake curl seam; `StreamController` gates, pumps frames, and falls back; `Session::markPrimed` only after success; `Rest\Gate` still enforces nonce+cap+licence on the stream route. PHPStan L6 + PHPCS Oblak stay green (hard gate for this SDK).
- **UI:** incremental SSE frame parser; delta accumulation into the bubble; status-line update then collapse; fallback path when the stream fails.
- **End-to-end:** browser test against the rt-harness (real hub) — live typing, a live activity line, collapse to "Code doorzocht · N steps"; plus a forced-fallback run (streaming disabled) showing the buffered reply with the same collapsed steps.

## Implementation note

This is large and will be sliced in the implementation plan — hub guard, hub step summaries, SDK streaming transport, SDK stream endpoint, UI — each an independently testable vertical. The plan is written from this spec.
