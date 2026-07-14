# Chat polish & naming — design

**Date:** 2026-07-14
**Status:** Approved
**Scope:** SDK front-end only (`assets/src`, `src/Config.php`, `src/Admin/Page.php`). No hub changes.

## Context

Hands-on review of the Community admin page produced eight pieces of feedback. Three of them
need hub work or their own design and are explicitly **out of scope** here:

| # | Feedback | Where it goes |
|---|----------|---------------|
| 4 | Comment upvoting does not work | Hub backlog. `assets/src/comment-actions.jsx` renders the vote/reply buttons `disabled` on purpose; the hub has votes on *cases*, not on *comments*. |
| 5 | Chat must stream and show what the agent is doing | Its own spec. The hub already streams SSE, but `agent/event_filter.py` drops `TextDeltaEvent` fail-closed (no streaming-aware output guard yet) and `MessageController::handle()` buffers the whole turn into one JSON response. |
| 7 | Keep the last conversation after a page refresh | Its own spec. |
| 6 | Are the health report and plugin version sent to the hub? | **Answered, no work needed.** `Consumer::healthReport()` and `Consumer::clientVersion()` ride the first turn of a session as `metadata` + `client_version` (`src/MessageController.php:71`, gated by `Session::isPrimed()`). |

This spec covers the remaining four: **1** (composer field alignment), **2** (configurable agent
name), **3** (project name in the UI), **8** (user bubble colour).

The through-line is that the SDK is a public API for other plugin developers, yet it still
hardcodes one consumer's identity: `"Sage"` appears in nine places across the JS, and the greeting
says *"Ask how translation works"* — copy that only makes sense inside Polylang AI Automatic
Translation. Any second consumer of this SDK would inherit a stranger's assistant name and a
translation-specific greeting. This spec makes both names configuration, and fixes two visual
defects in the same pass.

## Decisions taken

- **Names come from the SDK `Config`, set by the consuming plugin** — not from the hub. The hub
  does have a `Project.name` column, but no endpoint exposes it (`src/Config.php:13` notes
  "local; no /project/config yet"). A hub-driven config would need an endpoint, a migration, SDK
  caching and an offline fallback, to deliver a value the plugin already knows about itself.
- **Header layout:** `H1` stays `Community`; the sub-line becomes the project name. The four
  per-tab sub-lines ("Browse public topics — or ask Sage on the right.", and its Started /
  Participating / Roadmap variants) are dropped.
- **User bubble:** slate `#1e293b` with white text — dark grey-blue, still adjacent to the blue
  accent. Contrast with white is ~14:1 (WCAG AAA). The accent-coloured glow shadow goes.
- **Composer:** centre the text vertically *and* let the textarea grow to five lines, because the
  hint below it already promises "Shift+Enter for a new line" while `rows="1"` merely scrolls.

## Design

### 1. Configuration

`src/Config.php` gains a `projectName` constructor parameter next to the existing `agentName`.

```php
new Config(
    apiKey:      RT_API_KEY,
    consumer:    new PllatConsumer(),
    agentName:   'Sage',                              // default: 'Roundtable'
    projectName: 'Polylang AI Automatic Translation', // default: ''
);
```

`src/Admin/Page.php:54` localises `projectName` alongside `agentName` into
`window.RoundtableConfig`. `projectName` defaults to `''`; when empty the UI omits the sub-line
rather than rendering an empty paragraph. Both are additive optional parameters, so existing
consumers keep working.

### 2. Names throughout the UI

`assets/src/avatars.jsx` already exports `agentDisplayName()`; it gains a sibling
`projectDisplayName()` reading `window.RoundtableConfig?.projectName`. The JS fallback for the
agent name changes from `'Sage'` to `'Roundtable'`, matching the PHP default — today the two
disagree.

Every hardcoded `"Sage"` is replaced with the configured name:

| File | Today | After |
|------|-------|-------|
| `components.jsx:162` | `'Message Sage…'` | `` `Message ${agentName}…` `` |
| `chat-copy.js` | `CHAT_GREETING` / `NEW_TOPIC_INTRO` constants | functions taking the agent + project name |
| `conversation.js:10` | transcript prefix `'Sage'` | the agent name |
| `started-list.jsx:90` | "Use Sage on the right…" | the agent name |
| `community-app.jsx:140` | `aria-label="Open Sage chat"` | the agent name |
| `community-app.jsx:71-77` | four per-tab sub-lines naming Sage | dropped (see header, below) |
| `topics.js:175` | default arg `'Sage'` | `'Roundtable'` |

Changing the transcript prefix is safe: the hub's `services/summarizer.py` hands the conversation
text straight to an LLM ("a chat conversation between a user and a support agent") — it does not
parse a literal `Sage:` prefix.

The greeting becomes project-aware, replacing the translation-specific line:

> Hi — I'm **{agent}**. Ask how **{project}** works, report something off, or suggest an
> improvement. If it's worth tracking, I'll draft a topic for you.

With no project name configured, that middle clause falls back to "Ask how it works".

### 3. Header

```
Community                                [+ New topic]
Polylang AI Automatic Translation

[ All 12 ][ Participating 3 ][ Started 2 ][ Roadmap 5 ]
```

`community-app.jsx` drops the `subCopy` ternary chain entirely and renders `projectDisplayName()`
in `.rt-sub`, or nothing when it is empty.

### 4. Bubble and composer

`assets/src/styles.css` gains two tokens on `#roundtable-app`:

```css
--rt-user-bg:  #1e293b;
--rt-user-ink: #fff;
```

`.rt-user` (line 191) uses them and swaps `box-shadow:0 3px 10px -4px var(--rt-accent)` for
`0 3px 10px -6px rgba(15,23,42,.45)`. `--rt-accent` itself is untouched, so buttons, links and
focus rings keep their blue.

`.rt-cbox` goes from `align-items:flex-end` to `center` — the single-line textarea currently
bottom-aligns against the taller send button, which is what makes the placeholder sit low. An
`onInput` handler in `components.jsx` then resizes the textarea to `scrollHeight`, capped by a
`max-height` of five lines in CSS, and the height resets when the composer clears after send.

## Testing

TDD, per the repo's quality bar (PHPStan L6 + PHPCS Oblak are a hard gate for the SDK).

- `assets/test/conversation.test.mjs` and `components.test.mjs` assert the literal string "Sage"
  today; they move to asserting the *configured* name, with a case proving the fallback.
- New JS coverage: `projectDisplayName()`, the greeting's project-name fallback, and the header
  rendering no sub-line when `projectName` is empty.
- `tests/ConfigTest.php` and `tests/Admin/PageTest.php` cover `projectName` (default and
  localised value).
- Gates: `npm test`, `composer test`, PHPStan, PHPCS.
- Manual: build the assets, load the Community page in the rt-harness, and screenshot the chat —
  bubble colour, composer alignment, growth on Shift+Enter, and the agent/project name in every
  place listed in the table above.
