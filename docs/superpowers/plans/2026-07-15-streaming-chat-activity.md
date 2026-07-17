# Streaming Chat & Live Activity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream the agent's reply token-by-token to the chat UI and show a live activity line ("searching the code…") that collapses to an expandable step list — safely, proving the streaming redaction equals the existing batch guard.

**Architecture:** The hub already yields contract events incrementally over SSE. We turn on `include_partial_messages`, feed the raw token deltas through a new stateful `StreamingGuard` (releases only a provably-safe prefix, holds a bounded tail, flushes at end), and map tool steps to human-readable `ProgressEvent`s that respect `repo_private`. The SDK gains a curl streaming transport and a streaming REST endpoint that pumps frames to the browser; the browser consumes them with `fetch()` + `ReadableStream`, falling back to the existing buffered endpoint when streaming is unavailable.

**Tech Stack:** Python 3.12 (pytest + ruff + mypy strict) for the hub; PHP 8.2 (PHPUnit + Brain Monkey, PHPStan L6, PHPCS Oblak) + Preact/esbuild (`node --test`) for the SDK.

**Spec:** `docs/superpowers/specs/2026-07-15-streaming-chat-activity-design.md`

**Two repositories — commit each task in its own repo:**
- **Hub tasks (A1–A6):** `/Users/robbertvermeulen/dev/roundtable-hub`. Create branch `streaming-chat-activity` off the hub's default branch before A1. Gates: `.venv/bin/pytest -q`, `.venv/bin/ruff check src tests`, `.venv/bin/mypy` (strict). These become their own hub PR.
- **SDK/UI tasks (B1–D1):** `/Users/robbertvermeulen/dev/wp-roundtable`, branch `streaming-chat-activity` (already created; the spec is committed on it). Gates: `composer test`, `composer stan`, `composer cs`, and from `assets/`: `npm test`, `npm run build`.

## Global Constraints

- **The guard invariant (security anchor):** for *any* split of a reply into deltas, the concatenation of everything `StreamingGuard` releases is **byte-identical to `guard_output(full_text)`**. This is the primary test. We prove the incremental guard equals the batch guard; we do not invent new redaction.
- **`guard_output` is narrowed:** it keeps only secret/private-key redaction. The >40-line code-block truncation is **removed** (with its tests).
- **Private-repo floor:** a `ProgressEvent` summary for a private repo must never contain a path, filename, or search pattern. The existing `ToolStepEvent` `tool_input` floor in `event_filter.py` stays as defense-in-depth.
- **Raw `TextDeltaEvent` is still always dropped by `event_filter`** — only the new `GuardedTextDeltaEvent` passes. The belt-and-suspenders test `test_streamed_text_delta_never_reaches_the_client` stays green.
- **`markPrimed()` fires only after a turn completes successfully** — a disconnect or failed stream leaves the session un-primed (unchanged at-least-once first-turn semantics).
- **Fallback:** the browser must fall back to the buffered `POST /roundtable/v1/message` when streaming fails or stalls.
- **SDK gates are hard:** PHPStan L6 + PHPCS Oblak must pass; every public symbol carries a docblock. Hub: ruff (google docstrings, `D` rules) + mypy strict must pass.

---

## Group A — Hub (repo: `roundtable-hub`, branch `streaming-chat-activity`)

### Task A1: Narrow `guard_output` — drop code-block truncation

**Files:**
- Modify: `src/roundtable_hub/agent/output_guard.py`
- Test: `tests/test_output_guard.py`

**Interfaces:**
- Produces: `guard_output(text: str) -> str` — now redacts only PEM private-key blocks and the `SECRET_TOKEN_PATTERN` tokens to `[REDACTED]`; no code-block handling. `PRIVATE_KEY_BLOCK_PATTERN` and `SECRET_TOKEN_PATTERN` remain exported (imported by `services/scrub.py` and, next task, `StreamingGuard`).

- [ ] **Step 1: Update the tests to drop code-truncation expectations**

In `tests/test_output_guard.py`, remove every test asserting the `[large code block omitted]` behavior, and add one asserting a long code block now passes through unchanged:

```python
def test_long_code_block_is_no_longer_truncated():
    block = "```python\n" + "\n".join(f"line{i}" for i in range(100)) + "\n```"
    assert guard_output(block) == block
```

Keep the secret/PEM redaction tests unchanged.

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest tests/test_output_guard.py -q`
Expected: FAIL — the surviving long-block test fails because `guard_output` still truncates.

- [ ] **Step 3: Remove the truncation logic**

Replace `src/roundtable_hub/agent/output_guard.py` body with:

```python
"""Deterministic reply guard: redacts leaked secrets from reply text.

A pure function over the complete reply. `StreamingGuard`
(`agent/streaming_guard.py`) applies the *same* redaction incrementally and is
proven byte-identical to this function. This is not the §11 PII/URL redaction
layer (`services/scrub.py`, which imports the patterns below).
"""

import re

PRIVATE_KEY_BLOCK_PATTERN = re.compile(
    r"-----BEGIN[ \w]*PRIVATE KEY-----.*?-----END[ \w]*PRIVATE KEY-----", re.DOTALL
)
SECRET_TOKEN_PATTERN = re.compile(r"ghp_[A-Za-z0-9]{36}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]+")


def guard_output(text: str) -> str:
    """Redact leaked secrets in reply text.

    Args:
        text: The candidate reply text to guard.

    Returns:
        The text with private-key blocks and well-known token formats
        (`ghp_...`, `AKIA...`, `xox[baprs]-...`) replaced with `[REDACTED]`.
        Ordinary answers are unchanged.
    """
    redacted = PRIVATE_KEY_BLOCK_PATTERN.sub("[REDACTED]", text)
    return SECRET_TOKEN_PATTERN.sub("[REDACTED]", redacted)
```

- [ ] **Step 4: Run to verify pass**

Run: `.venv/bin/pytest tests/test_output_guard.py -q && .venv/bin/ruff check src/roundtable_hub/agent/output_guard.py && .venv/bin/mypy`
Expected: PASS, ruff clean, mypy clean.

- [ ] **Step 5: Commit**

```bash
git add src/roundtable_hub/agent/output_guard.py tests/test_output_guard.py
git commit -m "refactor(guard): drop code-block truncation, keep only secret redaction"
```

---

### Task A2: `GuardedTextDeltaEvent` type + filter passthrough

**Files:**
- Modify: `src/roundtable_hub/agent/events.py`, `src/roundtable_hub/agent/event_filter.py`
- Test: `tests/test_event_filter.py`

**Interfaces:**
- Produces: `GuardedTextDeltaEvent(type="guarded_text_delta", text: str)`, added to the `ContractEvent` union. `filter_event` passes it through under both verbosities; raw `TextDeltaEvent` is still dropped.

- [ ] **Step 1: Write the failing tests**

In `tests/test_event_filter.py`, add:

```python
from roundtable_hub.agent.events import GuardedTextDeltaEvent

def test_guarded_text_delta_passes_under_concise():
    ev = GuardedTextDeltaEvent(text="hello")
    assert filter_event(ev, verbosity="concise", repo_private=True) is ev

def test_guarded_text_delta_passes_under_verbose():
    ev = GuardedTextDeltaEvent(text="hello")
    assert filter_event(ev, verbosity="verbose", repo_private=False) is ev
```

(Keep the existing `test_text_delta_event_dropped_under_concise` / `_under_verbose` — they must stay green.)

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest tests/test_event_filter.py -q`
Expected: FAIL — `ImportError: cannot import name 'GuardedTextDeltaEvent'`.

- [ ] **Step 3: Add the event type and the union member**

In `src/roundtable_hub/agent/events.py`, after `TextDeltaEvent`:

```python
class GuardedTextDeltaEvent(BaseModel):
    """A streaming partial-text token already run through the output guard."""

    type: Literal["guarded_text_delta"] = "guarded_text_delta"
    text: str
```

Add `GuardedTextDeltaEvent` to the `ContractEvent` union.

`event_filter.py` needs no code change: its final `return event` (line 66) already passes any unrecognized event, and `GuardedTextDeltaEvent` is not `ThinkingEvent`/`TextDeltaEvent`/`ToolResultEvent`/`ToolStepEvent`, so it falls through. Add it to the module docstring's list of always-passed events for clarity.

- [ ] **Step 4: Run to verify pass**

Run: `.venv/bin/pytest tests/test_event_filter.py -q && .venv/bin/mypy`
Expected: PASS, mypy clean.

- [ ] **Step 5: Commit**

```bash
git add src/roundtable_hub/agent/events.py src/roundtable_hub/agent/event_filter.py tests/test_event_filter.py
git commit -m "feat(events): add GuardedTextDeltaEvent, passed by the filter"
```

---

### Task A3: `StreamingGuard` — incremental redaction, proven equal to the batch guard

**Files:**
- Create: `src/roundtable_hub/agent/streaming_guard.py`
- Test: `tests/test_streaming_guard.py`

**Interfaces:**
- Consumes: `guard_output`, `PRIVATE_KEY_BLOCK_PATTERN`, `SECRET_TOKEN_PATTERN` from `agent/output_guard.py`; `GuardedTextDeltaEvent` from `agent/events.py`.
- Produces: `class StreamingGuard` with `push(text: str) -> list[GuardedTextDeltaEvent]` (feed a raw delta, get 0+ safe guarded deltas) and `flush() -> list[GuardedTextDeltaEvent]` (release everything held, at turn end). **Invariant:** `"".join(e.text for e in all_pushed + flushed) == guard_output(full_raw_text)` for any chunking.

- [ ] **Step 1: Write the invariant property test first**

Create `tests/test_streaming_guard.py`:

```python
from roundtable_hub.agent.output_guard import guard_output
from roundtable_hub.agent.streaming_guard import StreamingGuard

CORPUS = [
    "just a normal answer with no secrets at all",
    "here is a token ghp_" + "a" * 36 + " in the middle",
    "aws AKIA" + "B" * 16 + " done",
    "slack xoxb-123456789012-abcdefABCDEF end",
    "-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----",
    "text before -----BEGIN PRIVATE KEY-----\nX\n-----END PRIVATE KEY----- text after",
    "```python\n" + "\n".join(f"line{i}" for i in range(60)) + "\n```",
    "two ghp_" + "c" * 36 + " and xoxb-999-zzz tokens",
    "trailing partial start ghp",
    "trailing partial pem -----BEG",
]


def _run(chunks: list[str]) -> str:
    guard = StreamingGuard()
    out: list[str] = []
    for c in chunks:
        out += [e.text for e in guard.push(c)]
    out += [e.text for e in guard.flush()]
    return "".join(out)


def test_every_single_split_point_matches_batch_guard():
    for s in CORPUS:
        for i in range(len(s) + 1):
            assert _run([s[:i], s[i:]]) == guard_output(s), (s, i)


def test_char_by_char_matches_batch_guard():
    for s in CORPUS:
        assert _run(list(s)) == guard_output(s), s


def test_three_way_splits_of_a_token_match_batch_guard():
    s = "prefix ghp_" + "d" * 36 + " suffix"
    for i in range(len(s)):
        for j in range(i, len(s)):
            assert _run([s[:i], s[i:j], s[j:]]) == guard_output(s), (i, j)
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest tests/test_streaming_guard.py -q`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `StreamingGuard`**

Create `src/roundtable_hub/agent/streaming_guard.py`:

```python
"""Incremental output guard: redacts a streamed reply as safely as the batch guard.

Holds back a bounded tail so a secret split across deltas is never half-released,
and holds from any unclosed `-----BEGIN ... PRIVATE KEY-----` block until it closes.
Proven byte-identical to `guard_output(full_text)` for any chunking — see
`tests/test_streaming_guard.py`.
"""

from roundtable_hub.agent.events import GuardedTextDeltaEvent
from roundtable_hub.agent.output_guard import (
    PRIVATE_KEY_BLOCK_PATTERN,
    SECRET_TOKEN_PATTERN,
    guard_output,
)

# Longest token-start prefix we must be able to hold whole at the tail:
# "-----BEGIN" (10) and the token leads ("ghp_", "AKIA", "xox?-"). 16 is a safe margin.
_TAIL_HOLD = 16


def _safe_split(pending: str) -> int:
    """Return the largest index up to which `pending` is safe to guard and release.

    The prefix `pending[:k]` contains no secret pattern that a future delta could
    still be extending or completing, so guarding it in isolation equals guarding
    it as part of the whole reply.
    """
    n = len(pending)
    k = max(0, n - _TAIL_HOLD)  # hold a small tail for a partial token/PEM start

    # A token match that touches the tail may still be growing (the token regex is
    # greedy/unbounded for xox); one straddling k would be half-released. Hold from
    # its start in both cases.
    for m in SECRET_TOKEN_PATTERN.finditer(pending):
        if m.end() == n or (m.start() < k < m.end()):
            k = min(k, m.start())

    # A complete PEM block straddling k → hold from its start.
    for m in PRIVATE_KEY_BLOCK_PATTERN.finditer(pending):
        if m.start() < k < m.end():
            k = min(k, m.start())

    # An unclosed BEGIN (no END yet) → hold from it until the END arrives.
    begin = pending.rfind("-----BEGIN")
    if begin != -1 and not PRIVATE_KEY_BLOCK_PATTERN.search(pending[begin:]):
        k = min(k, begin)

    return max(k, 0)


class StreamingGuard:
    """Guards a streamed reply incrementally, holding back only what isn't yet safe."""

    def __init__(self) -> None:
        """Start with an empty hold buffer."""
        self._pending = ""

    def push(self, text: str) -> list[GuardedTextDeltaEvent]:
        """Accept a raw text delta; return 0+ guarded deltas that are safe to release now."""
        self._pending += text
        k = _safe_split(self._pending)
        if k == 0:
            return []
        safe, self._pending = self._pending[:k], self._pending[k:]
        return [GuardedTextDeltaEvent(text=guard_output(safe))]

    def flush(self) -> list[GuardedTextDeltaEvent]:
        """Release everything held; call once the turn's text is complete."""
        if not self._pending:
            return []
        out = GuardedTextDeltaEvent(text=guard_output(self._pending))
        self._pending = ""
        return [out] if out.text else []
```

- [ ] **Step 4: Run to verify pass**

Run: `.venv/bin/pytest tests/test_streaming_guard.py -q && .venv/bin/ruff check src/roundtable_hub/agent/streaming_guard.py && .venv/bin/mypy`
Expected: PASS on all split-point cases, ruff clean, mypy clean. If any split fails, `_safe_split` has a boundary bug — fix it until the invariant holds; do not weaken the test.

- [ ] **Step 5: Commit**

```bash
git add src/roundtable_hub/agent/streaming_guard.py tests/test_streaming_guard.py
git commit -m "feat(guard): StreamingGuard proven equal to batch guard_output"
```

---

### Task A4: `StepSummarizer` — tool steps to human-readable progress, repo-privacy aware

**Files:**
- Create: `src/roundtable_hub/agent/step_summarizer.py`
- Test: `tests/test_step_summarizer.py`

**Interfaces:**
- Consumes: `ToolStepEvent`, `ProgressEvent` from `agent/events.py`.
- Produces: `class StepSummarizer` with `__init__(self, *, repo_private: bool)` and `summarize(self, step: ToolStepEvent) -> ProgressEvent`. Public repo weaves the file/pattern into the summary; private repo stays generic and never includes `tool_input`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_step_summarizer.py`:

```python
from roundtable_hub.agent.events import ProgressEvent, ToolStepEvent
from roundtable_hub.agent.step_summarizer import StepSummarizer


def _step(tool: str, **inp: object) -> ToolStepEvent:
    return ToolStepEvent(tool=tool, tool_use_id="t1", tool_input=dict(inp))


def test_public_repo_names_the_file_and_pattern():
    s = StepSummarizer(repo_private=False)
    assert s.summarize(_step("Read", file_path="src/price.php")).summary == "Reading price.php"
    assert s.summarize(_step("Grep", pattern="price")).summary == 'Searching for "price"'
    assert s.summarize(_step("Glob", pattern="*.php")).summary == 'Searching for "*.php"'


def test_private_repo_stays_generic_and_leaks_no_input():
    s = StepSummarizer(repo_private=True)
    assert s.summarize(_step("Read", file_path="src/secret.php")).summary == "Reading a file"
    assert s.summarize(_step("Grep", pattern="apikey")).summary == "Searching the code"
    assert s.summarize(_step("Glob", pattern="*.env")).summary == "Searching the code"


def test_unknown_tool_falls_back_to_generic():
    assert StepSummarizer(repo_private=False).summarize(_step("Other")).summary == "Working on it"
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest tests/test_step_summarizer.py -q`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `src/roundtable_hub/agent/step_summarizer.py`:

```python
"""Maps a raw tool step to a human-readable ProgressEvent for the chat activity line.

Public repos get specifics ("Reading price.php"); private repos stay generic
("Reading a file") and never echo `tool_input` — the repo-privacy floor.
"""

import os

from roundtable_hub.agent.events import ProgressEvent, ToolStepEvent


class StepSummarizer:
    """Turns `ToolStepEvent`s into human-readable `ProgressEvent`s, privacy-aware."""

    def __init__(self, *, repo_private: bool) -> None:
        """Store whether specifics may be shown.

        Args:
            repo_private: When True, summaries never include a path or pattern.
        """
        self._private = repo_private

    def summarize(self, step: ToolStepEvent) -> ProgressEvent:
        """Return a one-line progress summary for a tool step.

        Args:
            step: The tool invocation to describe.

        Returns:
            A `ProgressEvent` whose `summary` is generic for a private repo and
            specific (naming the file or pattern) for a public one.
        """
        if step.tool == "Read":
            if self._private:
                return ProgressEvent(summary="Reading a file")
            name = os.path.basename(str(step.tool_input.get("file_path", ""))) or "a file"
            return ProgressEvent(summary=f"Reading {name}")
        if step.tool in ("Grep", "Glob"):
            if self._private:
                return ProgressEvent(summary="Searching the code")
            pattern = str(step.tool_input.get("pattern", ""))
            return ProgressEvent(summary=f'Searching for "{pattern}"' if pattern else "Searching the code")
        return ProgressEvent(summary="Working on it")
```

- [ ] **Step 4: Run to verify pass**

Run: `.venv/bin/pytest tests/test_step_summarizer.py -q && .venv/bin/ruff check src/roundtable_hub/agent/step_summarizer.py && .venv/bin/mypy`
Expected: PASS, ruff clean, mypy clean.

- [ ] **Step 5: Commit**

```bash
git add src/roundtable_hub/agent/step_summarizer.py tests/test_step_summarizer.py
git commit -m "feat(activity): StepSummarizer maps tool steps to repo-privacy-aware progress"
```

---

### Task A5: Enable partial-message streaming + secret system-prompt line

**Files:**
- Modify: `src/roundtable_hub/agent/role1.py`, `src/roundtable_hub/agent/prompt.py`
- Test: `tests/test_role1_agent.py`, `tests/test_prompt.py`

**Interfaces:**
- Produces: `build_options(...)` now sets `include_partial_messages=True`; `_RULES_PREAMBLE` gains a clause forbidding echoing secrets found while reading.

- [ ] **Step 1: Update the tests**

In `tests/test_role1_agent.py`, change the two assertions (currently at lines ~41 and ~142) from `is False` to `is True`:

```python
    assert options.include_partial_messages is True
```

In `tests/test_prompt.py`, add an assertion that the preamble forbids echoing secrets:

```python
def test_preamble_forbids_echoing_secrets():
    prompt = build_system_prompt("Product X")
    assert "secret" in prompt.lower()
    assert "never" in prompt.lower()
```

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest tests/test_role1_agent.py tests/test_prompt.py -q`
Expected: FAIL — `include_partial_messages` still False; the new prompt assertion may already pass if "secret" is present, so make the added clause explicit in Step 3 and keep the assertion.

- [ ] **Step 3: Flip the flag and strengthen the preamble**

In `src/roundtable_hub/agent/role1.py`, replace the `include_partial_messages` line and its comment:

```python
        # Partial-message streaming is on: raw deltas are redacted by StreamingGuard
        # (agent/streaming_guard.py), proven byte-identical to guard_output, before
        # they can reach the client; event_filter still drops any raw TextDeltaEvent.
        include_partial_messages=True,
```

In `src/roundtable_hub/agent/prompt.py`, append a sentence to `_RULES_PREAMBLE` (after the existing exfiltration clause):

```python
    "If you encounter a secret, credential, API key, or private key while "
    "reading the repository, never include it in your reply.\n\n"
```

- [ ] **Step 4: Run to verify pass**

Run: `.venv/bin/pytest tests/test_role1_agent.py tests/test_prompt.py -q && .venv/bin/ruff check src/roundtable_hub/agent && .venv/bin/mypy`
Expected: PASS, ruff clean, mypy clean.

- [ ] **Step 5: Commit**

```bash
git add src/roundtable_hub/agent/role1.py src/roundtable_hub/agent/prompt.py tests/test_role1_agent.py tests/test_prompt.py
git commit -m "feat(agent): enable partial-message streaming + secret non-disclosure rule"
```

---

### Task A6: Wire `StreamingGuard` + `StepSummarizer` into `ChatPipeline.run_turn`

**Files:**
- Modify: `src/roundtable_hub/services/chat_pipeline.py`
- Test: `tests/test_chat_pipeline.py`

**Interfaces:**
- Consumes: `StreamingGuard`, `StepSummarizer`, `GuardedTextDeltaEvent`, `ProgressEvent`, `TextDeltaEvent`, `ToolStepEvent`.
- Produces: `run_turn` now transforms raw `TextDeltaEvent`s into `GuardedTextDeltaEvent`s via a per-turn `StreamingGuard`, emits a `ProgressEvent` per `ToolStepEvent`, flushes the guard after the SDK stream ends, and still guards + filters the final `AssistantTextEvent`.

- [ ] **Step 1: Write the failing tests**

In `tests/test_chat_pipeline.py`, add tests driven by a fake agent that yields SDK messages producing a text delta, a tool step, and a final assistant text. Assert:

```python
async def test_text_deltas_are_emitted_as_guarded_deltas(...):
    # fake agent yields a StreamEvent text-delta "hel" then "lo" then a final AssistantMessage "hello"
    events = [e async for e in pipeline.run_turn(...)]
    kinds = [e.type for e in events]
    assert "guarded_text_delta" in kinds
    assert "text_delta" not in kinds          # raw deltas never leave the pipeline
    assert "".join(e.text for e in events if e.type == "guarded_text_delta") == "hello"

async def test_tool_step_emits_a_progress_summary(...):
    # fake agent yields a ToolUseBlock Read on src/foo.php; project.repo_private = False
    events = [e async for e in pipeline.run_turn(...)]
    summaries = [e.summary for e in events if e.type == "progress"]
    assert "Reading foo.php" in summaries

async def test_held_tail_is_flushed_after_the_stream_ends(...):
    # fake agent yields a single delta "trailing ghp" (a partial token start) and nothing else
    events = [e async for e in pipeline.run_turn(...)]
    assert "".join(e.text for e in events if e.type == "guarded_text_delta") == "trailing ghp"
```

(Keep `test_streamed_text_delta_never_reaches_the_client` — it must stay green.)

- [ ] **Step 2: Run to verify failure**

Run: `.venv/bin/pytest tests/test_chat_pipeline.py -q`
Expected: FAIL — deltas currently dropped; no `progress` events; no flush.

- [ ] **Step 3: Rework the streaming loop**

In `src/roundtable_hub/services/chat_pipeline.py`, add imports:

```python
from roundtable_hub.agent.events import (
    AssistantTextEvent, ContractEvent, GuardedTextDeltaEvent, ProgressEvent,
    ResultEvent, TextDeltaEvent, ToolStepEvent,
)
from roundtable_hub.agent.streaming_guard import StreamingGuard
from roundtable_hub.agent.step_summarizer import StepSummarizer
```

Replace the `async for sdk_msg ...` loop body (the current per-event `filter_event(_guard(event), ...)` block) with a transform that runs each mapped event through the guard/summarizer, then guards+filters each produced event, and flushes after the loop:

```python
        guard = StreamingGuard()
        summarizer = StepSummarizer(repo_private=project.repo_private)

        def _emit(ev: ContractEvent):
            filtered = filter_event(
                _guard(ev), verbosity=self._settings.verbosity, repo_private=project.repo_private
            )
            return filtered

        async for sdk_msg in self._agent.run(...):   # keep the existing run(...) args
            captured_session_id = getattr(sdk_msg, "session_id", None) or captured_session_id
            for event in map_message(sdk_msg):
                if isinstance(event, TextDeltaEvent):
                    for delta in guard.push(event.text):
                        out = _emit(delta)
                        if out is not None:
                            yield out
                    continue
                if isinstance(event, ToolStepEvent):
                    out = _emit(summarizer.summarize(event))
                    if out is not None:
                        yield out
                    # fall through so the raw ToolStepEvent still hits the filter
                    # (dropped under concise, kept-with-floor under verbose)
                out = _emit(event)
                if out is not None:
                    yield out

        for delta in guard.flush():
            out = _emit(delta)
            if out is not None:
                yield out

        await self._chat_sessions.upsert(project.id, chat_id, captured_session_id, self._now())
```

Note: `_guard` still redacts the final `AssistantTextEvent`; `GuardedTextDeltaEvent`/`ProgressEvent` pass `_guard` unchanged (not `AssistantTextEvent`), so there is no double-guard.

- [ ] **Step 4: Run to verify pass**

Run: `.venv/bin/pytest tests/test_chat_pipeline.py -q && .venv/bin/ruff check src/roundtable_hub/services/chat_pipeline.py && .venv/bin/mypy`
Expected: PASS (including the retained belt-and-suspenders test), ruff clean, mypy clean.

- [ ] **Step 5: Run the whole hub suite + commit**

Run: `.venv/bin/pytest -q && .venv/bin/ruff check src tests && .venv/bin/mypy`
Expected: all green.

```bash
git add src/roundtable_hub/services/chat_pipeline.py tests/test_chat_pipeline.py
git commit -m "feat(chat): stream guarded deltas and progress summaries through the pipeline"
```

**After A6:** push the hub branch and open its PR (the hub is a separate repo/review cycle). The wire contract it now emits — `guarded_text_delta` and `progress` SSE frames — is what Group B/C consume.

---

## Group B — SDK transport & streaming endpoint (repo: `wp-roundtable`, branch `streaming-chat-activity`)

### Task B1: Streaming transport seam

**Files:**
- Create: `src/Http/StreamingTransport.php` (interface), `src/Http/CurlStreamingTransport.php`, `tests/Support/FakeStreamingTransport.php`
- Test: `tests/Http/CurlStreamingTransportTest.php`

**Interfaces:**
- Produces: `interface StreamingTransport { public function stream(string $url, array $headers, string $body, int $timeoutSeconds, callable $onFrame): int; }` — `$onFrame` is called with each complete raw SSE frame string as it arrives; returns the HTTP status code. `CurlStreamingTransport` is the production impl; `FakeStreamingTransport` (test double) replays a preset list of frames and returns a preset status.

- [ ] **Step 1: Write the failing test for the fake + interface contract**

Create `tests/Http/CurlStreamingTransportTest.php` covering the *contract* via a small consumer, plus a construction smoke test of the real class:

```php
public function test_fake_streaming_transport_replays_frames_and_returns_status(): void
{
    $fake = new FakeStreamingTransport(200, ["data: {\"type\":\"a\"}", "data: {\"type\":\"b\"}"]);
    $seen = [];
    $status = $fake->stream('u', [], 'body', 30, function (string $f) use (&$seen) { $seen[] = $f; });
    self::assertSame(200, $status);
    self::assertSame(["data: {\"type\":\"a\"}", "data: {\"type\":\"b\"}"], $seen);
}

public function test_curl_streaming_transport_implements_the_interface(): void
{
    self::assertInstanceOf(StreamingTransport::class, new CurlStreamingTransport());
}
```

- [ ] **Step 2: Run to verify failure**

Run: `composer test -- --filter CurlStreamingTransport`
Expected: FAIL — classes/interface do not exist.

- [ ] **Step 3: Implement the interface, the fake, and the curl transport**

`src/Http/StreamingTransport.php`:

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Http;

/** Streams a hub SSE response frame-by-frame (wp_remote_post buffers; this does not). */
interface StreamingTransport {
    /**
     * POST and invoke $onFrame for each complete SSE frame as it arrives.
     *
     * @param string                $url            The hub URL.
     * @param array<string, string> $headers        Request headers.
     * @param string                $body           The JSON request body.
     * @param int                   $timeoutSeconds The overall timeout.
     * @param callable(string):void $onFrame        Called with each raw frame (text between blank lines).
     *
     * @return int The HTTP status code.
     * @throws TransportException On a connection failure.
     */
    public function stream( string $url, array $headers, string $body, int $timeoutSeconds, callable $onFrame ): int;
}
```

`src/Http/CurlStreamingTransport.php` — curl with `CURLOPT_WRITEFUNCTION`, buffering bytes and splitting on the `\n\n` frame boundary, invoking `$onFrame` per frame:

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Http;

/** curl-based streaming transport: reads the SSE body incrementally and emits whole frames. */
final class CurlStreamingTransport implements StreamingTransport {
    public function stream( string $url, array $headers, string $body, int $timeoutSeconds, callable $onFrame ): int {
        $buffer = '';
        $ch     = \curl_init( $url );
        $hdr    = array();
        foreach ( $headers as $k => $v ) {
            $hdr[] = $k . ': ' . $v;
        }
        \curl_setopt_array( $ch, array(
            \CURLOPT_POST           => true,
            \CURLOPT_POSTFIELDS     => $body,
            \CURLOPT_HTTPHEADER     => $hdr,
            \CURLOPT_TIMEOUT        => $timeoutSeconds,
            \CURLOPT_WRITEFUNCTION  => static function ( $ch, string $chunk ) use ( &$buffer, $onFrame ): int {
                $buffer .= $chunk;
                while ( false !== ( $pos = \strpos( $buffer, "\n\n" ) ) ) {
                    $frame  = \substr( $buffer, 0, $pos );
                    $buffer = \substr( $buffer, $pos + 2 );
                    if ( '' !== \trim( $frame ) ) {
                        $onFrame( $frame );
                    }
                }
                return \strlen( $chunk );
            },
        ) );
        $ok     = \curl_exec( $ch );
        $status = (int) \curl_getinfo( $ch, \CURLINFO_HTTP_CODE );
        $errno  = \curl_errno( $ch );
        \curl_close( $ch );
        if ( false === $ok && 0 !== $errno ) {
            throw new TransportException( 'streaming transport failed' );
        }
        if ( '' !== \trim( $buffer ) ) {
            $onFrame( $buffer );
        }
        return $status;
    }
}
```

`tests/Support/FakeStreamingTransport.php`:

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Support;

use EpicWP\Roundtable\Http\StreamingTransport;

final class FakeStreamingTransport implements StreamingTransport {
    /** @param list<string> $frames */
    public function __construct( private int $status, private array $frames ) {}

    public function stream( string $url, array $headers, string $body, int $timeoutSeconds, callable $onFrame ): int {
        foreach ( $this->frames as $frame ) {
            $onFrame( $frame );
        }
        return $this->status;
    }
}
```

- [ ] **Step 4: Run to verify pass + gates**

Run: `composer test -- --filter CurlStreamingTransport && composer stan && composer cs`
Expected: PASS, PHPStan clean, PHPCS clean.

**Note on coverage:** `CurlStreamingTransport`'s live socket behavior (incremental reads over a real connection) is exercised only in the E2E task (D1), not in unit tests — real curl streaming cannot be unit-tested cleanly. The frame-splitting logic is what the fake and the downstream tests cover.

- [ ] **Step 5: Commit**

```bash
git add src/Http/StreamingTransport.php src/Http/CurlStreamingTransport.php tests/Support/FakeStreamingTransport.php tests/Http/CurlStreamingTransportTest.php
git commit -m "feat(http): streaming transport seam with curl impl and fake"
```

---

### Task B2: `HubClient::streamMessage`

**Files:**
- Modify: `src/HubClient.php`
- Test: `tests/HubClientStreamTest.php`

**Interfaces:**
- Consumes: `StreamingTransport`, `FakeStreamingTransport`, `SseParser::decodeFrame` behavior (reuse frame decoding), `HubException`.
- Produces: `HubClient::streamMessage(string $chatId, string $message, bool $isFirstTurn, StreamingTransport $transport, callable $onEvent): void` — calls the hub stream endpoint, decodes each frame to an `Event`, and invokes `$onEvent(Event $e)` per event; maps a non-2xx status / connection failure to `HubException` before any event is delivered where possible (reuse `guardStatus`).

- [ ] **Step 1: Write the failing test**

Create `tests/HubClientStreamTest.php`:

```php
public function test_stream_message_decodes_frames_and_invokes_callback(): void
{
    $frames = [
        'data: {"type":"guarded_text_delta","text":"hel"}',
        'data: {"type":"guarded_text_delta","text":"lo"}',
        'data: {"type":"result","subtype":"ok","is_error":false,"num_turns":1}',
    ];
    $client = new HubClient(new Config('pk', new FakeConsumer()), new FakeTransport(/* buffered unused */));
    $seen = [];
    $client->streamMessage('chat-1', 'hi', false, new FakeStreamingTransport(200, $frames),
        function (Event $e) use (&$seen) { $seen[] = $e->type; });
    self::assertSame(['guarded_text_delta', 'guarded_text_delta', 'result'], $seen);
}

public function test_stream_message_maps_403_to_blocked_before_events(): void
{
    $client = new HubClient(new Config('pk', new FakeConsumer()), new FakeTransport());
    $this->expectException(HubException::class);
    $client->streamMessage('c', 'hi', false, new FakeStreamingTransport(403, []),
        function (Event $e) { /* never called */ });
}
```

- [ ] **Step 2: Run to verify failure**

Run: `composer test -- --filter HubClientStream`
Expected: FAIL — method does not exist.

- [ ] **Step 3: Implement `streamMessage`**

In `src/HubClient.php`, add (reusing `buildBody`, `guardStatus`, and the frame decode from `SseParser`):

```php
    /**
     * Stream a chat turn, invoking $onEvent per decoded hub event.
     *
     * @param string                       $chatId      The chat/session id.
     * @param string                       $message     The user's message.
     * @param bool                         $isFirstTurn Whether to send first-turn context.
     * @param \EpicWP\Roundtable\Http\StreamingTransport $transport The streaming transport.
     * @param callable(\EpicWP\Roundtable\Event):void    $onEvent   Per-event callback.
     *
     * @throws \EpicWP\Roundtable\HubException On a gate refusal, server error, or network failure.
     */
    public function streamMessage( string $chatId, string $message, bool $isFirstTurn, \EpicWP\Roundtable\Http\StreamingTransport $transport, callable $onEvent ): void {
        $url  = ( $this->config->hubBaseUrl ?? self::HUB_URL ) . '/chats/' . $chatId . '/messages';
        $body = $this->buildBody( $message, $isFirstTurn );
        try {
            $status = $transport->stream(
                $url,
                array(
                    'Accept'        => 'text/event-stream',
                    'Authorization' => 'Bearer ' . $this->config->projectApiKey,
                    'Content-Type'  => 'application/json',
                ),
                $body,
                $this->config->timeoutSeconds,
                function ( string $frame ) use ( $onEvent ): void {
                    $event = \EpicWP\Roundtable\Chat\SseParser::parse( $frame );
                    foreach ( $event as $e ) {
                        $onEvent( $e );
                    }
                },
            );
        } catch ( \EpicWP\Roundtable\Http\TransportException $e ) {
            // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- internal transport error string, never rendered as HTML.
            throw \EpicWP\Roundtable\HubException::network( $e->getMessage() );
        }
        $this->guardStatus( $status );
    }
```

(Reusing `SseParser::parse` on a single frame decodes that frame's event; it returns 0 or 1 events, defensively skipping malformed frames — same contract as the buffered path.)

- [ ] **Step 4: Run to verify pass + gates**

Run: `composer test -- --filter HubClientStream && composer stan && composer cs`
Expected: PASS, gates clean. Note: `guardStatus` runs after streaming; a 403/429 with no frames still throws (the fake returns the status with an empty frame list, so no events precede the throw). If a future need arises to fail *before* streaming, that is out of scope here.

- [ ] **Step 5: Commit**

```bash
git add src/HubClient.php tests/HubClientStreamTest.php
git commit -m "feat(hub-client): streamMessage decodes frames to events via a callback"
```

---

### Task B3: `StreamController` — the streaming REST endpoint

**Files:**
- Create: `src/StreamController.php`
- Modify: `src/Roundtable.php`
- Test: `tests/StreamControllerTest.php`, `tests/RoundtableMountTest.php`

**Interfaces:**
- Consumes: `Config`, `HubClient::streamMessage`, `CurlStreamingTransport`, `Rest\Gate::permits`, `Session`.
- Produces: `StreamController` registering `POST /roundtable/v1/message/stream`, gated by `Rest\Gate`. Its handler takes over output via `rest_pre_serve_request`, emits `text/event-stream`, pumps each hub event as an SSE frame with `flush()`, and calls `Session::markPrimed()` only after `streamMessage` returns without throwing.

- [ ] **Step 1: Write the failing tests**

Create `tests/StreamControllerTest.php` using Brain Monkey + `FakeStreamingTransport`, asserting: the route registers with `POST`; `permission()` delegates to `Rest\Gate`; on a successful stream the handler echoes one SSE frame per event and calls `markPrimed` once (inject a `HubClient` built with a `FakeStreamingTransport`); on a first-turn hub exception, `markPrimed` is never called. Mirror the structure of `tests/MessageControllerTest.php` (which uses `WpRestPolyfills` and a real `HubClient` + fake transport). Assert the emitted output (captured via `ob_start`) contains `data: {"type":"guarded_text_delta"...}` frames.

In `tests/RoundtableMountTest.php`, add an assertion that `rest_api_init` registers the stream controller (the mount now adds one more `register` callback).

- [ ] **Step 2: Run to verify failure**

Run: `composer test -- --filter StreamController`
Expected: FAIL — class does not exist.

- [ ] **Step 3: Implement `StreamController`**

Create `src/StreamController.php` — register the route with a permission callback of `Rest\Gate::permits`; in the callback, hook `rest_pre_serve_request` to stream and short-circuit REST serialization:

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

/** Streaming REST proxy: pumps hub SSE frames straight to the browser. */
final class StreamController {
    public const ROUTE_NAMESPACE = 'roundtable/v1';
    public const ROUTE           = '/message/stream';

    public function __construct(
        private Config $config,
        private HubClient $hubClient,
        private Http\StreamingTransport $transport,
    ) {}

    public function register(): void {
        \register_rest_route( self::ROUTE_NAMESPACE, self::ROUTE, array(
            'callback'            => array( $this, 'handle' ),
            'methods'             => 'POST',
            'permission_callback' => array( $this, 'permission' ),
        ) );
    }

    public function permission( \WP_REST_Request $request ): bool { // phpcs:ignore Squiz.Commenting.FunctionComment.IncorrectTypeHint
        return \EpicWP\Roundtable\Rest\Gate::permits( $this->config, $request );
    }

    public function handle( \WP_REST_Request $request ): \WP_REST_Response { // phpcs:ignore Squiz.Commenting.FunctionComment.IncorrectTypeHint
        $message = (string) $request->get_param( 'message' );
        $session = new Session( (int) \wp_get_current_user()->ID );
        $chatId  = $session->chatId();
        $first   = ! $session->isPrimed();

        \add_filter( 'rest_pre_serve_request', function () use ( $message, $session, $chatId, $first ): bool {
            \header( 'Content-Type: text/event-stream' );
            \header( 'Cache-Control: no-cache' );
            \header( 'X-Accel-Buffering: no' );
            while ( \ob_get_level() > 0 ) {
                \ob_end_flush();
            }
            try {
                $this->hubClient->streamMessage( $chatId, $message, $first, $this->transport, static function ( Event $e ): void {
                    echo 'data: ' . \wp_json_encode( array_merge( array( 'type' => $e->type ), $e->data ) ) . "\n\n";
                    \flush();
                } );
                if ( $first ) {
                    $session->markPrimed();
                }
            } catch ( HubException $e ) {
                echo 'data: ' . \wp_json_encode( array( 'type' => 'error', 'message' => $e->kind() ) ) . "\n\n";
                \flush();
            }
            return true;
        } );

        return new \WP_REST_Response( null, 200 );
    }
}
```

Wire it in `src/Roundtable.php::mount`, after the `$message` controller:

```php
        $stream = new StreamController( $config, $hub, new Http\CurlStreamingTransport() );
```
```php
        \add_action( 'rest_api_init', array( $stream, 'register' ) );
```

- [ ] **Step 4: Run to verify pass + gates**

Run: `composer test -- --filter 'StreamController|RoundtableMount' && composer stan && composer cs`
Expected: PASS, gates clean.

- [ ] **Step 5: Run the full PHP suite + commit**

Run: `composer test && composer stan && composer cs`
Expected: all green.

```bash
git add src/StreamController.php src/Roundtable.php tests/StreamControllerTest.php tests/RoundtableMountTest.php
git commit -m "feat(rest): streaming /message/stream endpoint gated like the buffered one"
```

---

## Group C — UI (repo: `wp-roundtable`, branch `streaming-chat-activity`)

### Task C1: SSE frame parser + streaming API client

**Files:**
- Create: `assets/src/sse.js`
- Modify: `assets/src/api.js`
- Test: `assets/test/sse.test.mjs`

**Interfaces:**
- Produces: `parseSseChunk(buffer: string) -> { events: object[], rest: string }` in `sse.js` (splits a growing buffer on `\n\n`, decodes each `data:` JSON payload, returns decoded event objects plus the unparsed remainder). `streamMessage(text, { onEvent, onError, onDone, signal })` in `api.js` — `fetch()`es `/message/stream` with the `X-WP-Nonce` header, reads the `ReadableStream`, and feeds chunks through `parseSseChunk`.

- [ ] **Step 1: Write the failing test**

Create `assets/test/sse.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSseChunk } from '../src/sse.js';

test('parseSseChunk decodes complete frames and keeps the remainder', () => {
  const { events, rest } = parseSseChunk('data: {"type":"a","text":"hi"}\n\ndata: {"type":"b"');
  assert.deepEqual(events, [{ type: 'a', text: 'hi' }]);
  assert.equal(rest, 'data: {"type":"b"');
});

test('parseSseChunk skips malformed frames', () => {
  const { events } = parseSseChunk('data: not-json\n\ndata: {"type":"ok"}\n\n');
  assert.deepEqual(events, [{ type: 'ok' }]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd assets && npm test`
Expected: FAIL — `../src/sse.js` does not exist.

- [ ] **Step 3: Implement the parser and the stream client**

Create `assets/src/sse.js`:

```javascript
// assets/src/sse.js — incremental SSE frame parsing for the streaming chat.

/**
 * Split a growing SSE buffer into decoded event objects plus the unparsed remainder.
 * @param {string} buffer Accumulated response text.
 * @returns {{events: object[], rest: string}}
 */
export function parseSseChunk(buffer) {
  const events = [];
  let rest = buffer;
  let idx;
  while ((idx = rest.indexOf('\n\n')) !== -1) {
    const frame = rest.slice(0, idx).trim();
    rest = rest.slice(idx + 2);
    if (!frame.startsWith('data:')) continue;
    try {
      events.push(JSON.parse(frame.slice(5).trim()));
    } catch {
      /* skip malformed frame */
    }
  }
  return { events, rest };
}
```

In `assets/src/api.js`, add (reusing `cfg()`/`restBase()`):

```javascript
/**
 * Stream a chat turn. Calls onEvent per decoded event; onError on failure; onDone at end.
 * @param {string} text
 * @param {{onEvent:(e:object)=>void, onError:()=>void, onDone:()=>void, signal?:AbortSignal}} handlers
 */
export async function streamMessage(text, { onEvent, onError, onDone, signal }) {
  let res;
  try {
    res = await fetch(restBase() + '/message/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg().nonce },
      body: JSON.stringify({ message: text }),
      signal,
    });
  } catch { onError(); return; }
  if (!res.ok || !res.body) { onError(); return; }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseChunk(buffer);
      buffer = parsed.rest;
      for (const ev of parsed.events) onEvent(ev);
    }
    onDone();
  } catch { onError(); }
}
```

Add `import { parseSseChunk } from './sse.js';` at the top of `api.js`.

- [ ] **Step 4: Run to verify pass**

Run: `cd assets && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/src/sse.js assets/src/api.js assets/test/sse.test.mjs
git commit -m "feat(ui): incremental SSE parser and streaming message client"
```

---

### Task C2: Live rendering — streaming text, activity line, collapse

**Files:**
- Modify: `assets/src/components.jsx`, `assets/src/styles.css`
- Test: `assets/test/components.test.mjs`

**Interfaces:**
- Consumes: `streamMessage` from `api.js`.
- Produces: a `Bubble`/`Thread` that renders a `progress` activity line while a turn streams and a collapsible `rt-activity` summary ("Code doorzocht · N stappen") after `result`; the `rt-working` "Working…" indicator is removed.

- [ ] **Step 1: Write the failing test**

In `assets/test/components.test.mjs`, add a test rendering a `Thread` with an agent turn that carries streamed deltas plus collected steps, asserting the collapsed activity affordance renders:

```javascript
test('Thread renders a collapsed activity summary after streaming', () => {
  const turns = [{
    role: 'agent', reply: 'because shortcodes run after translation',
    steps: [{ summary: 'Searching the code' }, { summary: 'Reading a file' }],
    done: true, error: false,
  }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /rt-activity/);
  assert.match(html, /2 stappen|2 steps/);
});

test('Thread renders the live activity line while streaming', () => {
  const turns = [{
    role: 'agent', reply: 'because short', steps: [{ summary: 'Reading a file' }],
    done: false, error: false,
  }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /Reading a file/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd assets && npm test`
Expected: FAIL — no activity rendering; the turn view model has no `steps`/`done` handling in the bubble.

- [ ] **Step 3: Implement the rendering**

In `assets/src/components.jsx`:
- Extend the agent `Bubble` so that when `turn.steps?.length` and `!turn.done`, it renders the latest step's `summary` as a live line `<div class="rt-activity-live">⏺ {last.summary}</div>` under the reply; when `turn.done && turn.steps?.length`, it renders a collapsible `<details class="rt-activity"><summary>Code doorzocht · {n} {n===1?'stap':'stappen'}</summary>...</summary>` listing each step's `summary`.
- Rework `send()` to call `streamMessage`: push an empty agent turn, then on each `guarded_text_delta` append to its `reply`; on each `progress` push `{summary}` to its `steps` (updating the live line); on `result` set `done=true`; on the final `assistant_text` snap `reply` to the guarded full text; on `error` set the error state. Remove the `{busy && <div class="rt-working">…}` block.

Add CSS to `assets/src/styles.css`:

```css
#roundtable-app .rt-activity-live { margin-top:6px; font-size:12.5px; color:var(--rt-ink-soft); display:flex; align-items:center; gap:6px; }
#roundtable-app .rt-activity { margin-top:6px; font-size:12.5px; color:var(--rt-ink-soft); }
#roundtable-app .rt-activity > summary { cursor:pointer; list-style:none; color:var(--rt-ink-faint); }
#roundtable-app .rt-activity ul { margin:6px 0 0; padding-left:16px; }
```

- [ ] **Step 4: Run to verify pass**

Run: `cd assets && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/src/components.jsx assets/src/styles.css assets/test/components.test.mjs
git commit -m "feat(ui): live streaming text, activity line, and collapsible step summary"
```

---

### Task C3: Fallback to the buffered endpoint

**Files:**
- Modify: `assets/src/components.jsx`
- Test: `assets/test/components.test.mjs`

**Interfaces:**
- Consumes: `streamMessage`, `sendMessage` from `api.js`.
- Produces: `send()` starts the stream; if `onError` fires before any event, or no event arrives within ~2s, it aborts and falls back to the buffered `sendMessage()`, rendering the reply and the collapsed step list exactly as the streamed path does.

- [ ] **Step 1: Write the failing test**

Add a test that injects a `streamMessage` that immediately calls `onError` (e.g. via a small seam: `send()` accepts an injected stream function in tests, defaulting to the real one), and asserts the turn still ends with the buffered reply text and `done:true`. Keep it deterministic — no real timers; simulate the error path directly.

- [ ] **Step 2: Run to verify failure**

Run: `cd assets && npm test`
Expected: FAIL — no fallback path yet.

- [ ] **Step 3: Implement the fallback**

In `send()`: track whether any event arrived. On `onError` (or a 2s no-first-event timeout via `AbortController`), if nothing was rendered yet, call `sendMessage(text)` and fold its `events` through the same view-model reducer used by the buffered path today (`eventsToTurn`), then mark the turn `done`. If events already streamed, an error just ends the turn with the error bubble (no double-render).

- [ ] **Step 4: Run to verify pass**

Run: `cd assets && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/src/components.jsx assets/test/components.test.mjs
git commit -m "feat(ui): fall back to the buffered endpoint when streaming is unavailable"
```

---

## Group D — Integration

### Task D1: Build, browser E2E, and docs

**Files:**
- Modify: `assets/dist/roundtable.js`, `assets/dist/roundtable.css` (rebuilt artefacts, committed)
- Modify: `docs/superpowers/specs/2026-07-15-streaming-chat-activity-design.md` (status note if needed)

- [ ] **Step 1: Run every gate in both repos**

Hub (already merged/pushed): confirm `.venv/bin/pytest -q`, `.venv/bin/ruff check src tests`, `.venv/bin/mypy` are green.
SDK: `composer test && composer stan && composer cs`, then `cd assets && npm test && npm run build`.
Expected: all green; `built dist/roundtable.js + dist/roundtable.css`.

- [ ] **Step 2: Point the harness at the streaming hub**

Ensure the local hub (branch `streaming-chat-activity`) runs on `:8799`, the rt-harness vendor copy is refreshed to the SDK branch (`composer update epicwp/wp-roundtable` in the harness plugin), and the harness `Config` is unchanged from Spec A.

- [ ] **Step 3: Browser E2E against the harness**

Open **Roundtable → Community**, send a message, and verify against the spec's user journey:
1. The reply types out live (multiple `guarded_text_delta` frames, not one blob) — confirm via the network panel that `/message/stream` returns `text/event-stream` and streams incrementally.
2. A live activity line appears under the forming reply and updates ("Searching the code" → "Reading a file"); PLLAT is private, so lines stay generic (no paths/patterns).
3. On completion the activity collapses to "Code doorzocht · N stappen" and expands on click.
4. No secret leaks: this is covered by the hub invariant tests; spot-check that a normal reply renders intact.
Take a screenshot of a completed streamed turn with the collapsed activity.

- [ ] **Step 4: Forced-fallback check**

Temporarily make the stream endpoint fail (e.g. stop the hub mid-session, or block `/message/stream` in the harness) and confirm the UI falls back to the buffered reply with the same collapsed step list. Restore afterward.

- [ ] **Step 5: Commit the build + open the PR**

```bash
git add assets/dist
git commit -m "chore(build): rebuild bundle for streaming chat & live activity"
git push -u origin streaming-chat-activity
gh pr create --title "Streaming chat & live activity (Spec B)" --body "Implements docs/superpowers/specs/2026-07-15-streaming-chat-activity-design.md. Requires the roundtable-hub streaming-chat-activity PR to be deployed. Real token streaming with a StreamingGuard proven byte-identical to guard_output; live activity line collapsing to a step summary; graceful fallback to the buffered endpoint."
```

---

## Follow-ups (not part of this plan)

- Case-publish redaction over-redacts brand names (Claude → `[ORG]`): [epicwp/roundtable-hub#43](https://github.com/epicwp/roundtable-hub/issues/43).
- Restore the last conversation after a page refresh (feedback item 7) — its own spec.
- Comment upvoting (feedback item 4) — needs a hub comment-votes endpoint.
