# Chat polish & naming — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the assistant name and project name configuration instead of hardcoded `"Sage"`, and fix two visual defects in the chat panel (user bubble colour, composer alignment).

**Architecture:** The consuming plugin sets both names on the SDK's `Config`; `Admin\Page` localises them into `window.RoundtableConfig`; a new `assets/src/config.js` is the single JS reader for both. No hub changes.

**Tech Stack:** PHP 8.2 (PHPUnit + Brain Monkey), Preact + esbuild, plain CSS, `node --test` for the JS suite.

**Spec:** `docs/superpowers/specs/2026-07-14-chat-polish-naming-design.md`
**Branch:** `sdk-m3-chat-polish-naming` (already created; the spec is committed on it)

## Global Constraints

- This SDK is a public API for external plugin developers: PHPStan level 6 and PHPCS (Oblak ruleset) are a hard gate, and every public symbol needs a docblock. Run `composer stan` and `composer cs` before the final commit.
- All new `Config` parameters are **optional with a default**, appended at the end of the constructor — existing consumers pass arguments positionally and must keep working.
- Default agent name is `'Roundtable'` in **both** PHP and JS. `'Sage'` is the harness/PLLAT choice, never an SDK default.
- Default project name is `''`. When empty, the UI renders **no** sub-line — never an empty element.
- `--rt-accent` (`#3858e9`) stays untouched. The user bubble gets its own tokens.
- Run the JS suite with `cd assets && npm test`; the PHP suite with `composer test` from the repo root.

---

### Task 1: `projectName` on the SDK config

**Files:**
- Modify: `src/Config.php:18-26`
- Modify: `src/Admin/Page.php:55-63`
- Test: `tests/ConfigTest.php`, `tests/Admin/PageTest.php`

**Interfaces:**
- Produces: `Config::$projectName` (`public readonly string`, default `''`), and the `projectName` key inside the localised `RoundtableConfig` object that every later JS task reads.

- [ ] **Step 1: Write the failing tests**

In `tests/ConfigTest.php`, add the default assertion to `test_exposes_its_values_with_defaults` and a new test:

```php
        self::assertSame('', $config->projectName);
    }

    public function test_accepts_a_project_name(): void
    {
        $config = new Config('pk', new FakeConsumer(), 'Sage', projectName: 'Polylang AI Automatic Translation');

        self::assertSame('Sage', $config->agentName);
        self::assertSame('Polylang AI Automatic Translation', $config->projectName);
    }
```

In `tests/Admin/PageTest.php`, give the fixture a project name and assert it is localised:

```php
    private function page(): Page
    {
        return new Page(
            new Config('pk_secret', new FakeConsumer(), 'Sage', projectName: 'Polylang AI Automatic Translation'),
            'tools.php',
        );
    }
```

and in `test_enqueue_loads_bundle_and_localizes_config_on_our_screen`, replace the `Mockery::on` closure:

```php
            \Mockery::on(static fn ($d) => 'nonce123' === $d['nonce']
                && 'Sage' === $d['agentName']
                && 'Polylang AI Automatic Translation' === $d['projectName']),
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `composer test`
Expected: FAIL — `ConfigTest` errors on the unknown named argument `projectName`; `PageTest` fails on the undefined `projectName` key.

- [ ] **Step 3: Implement**

In `src/Config.php`, append the parameter (last, for positional back-compat) and document it:

```php
     * @param string|null $hubBaseUrl     Dev/staging override ONLY; null uses the baked-in SaaS URL.
     * @param string      $projectName    The consuming product's display name; '' hides it in the UI.
     */
    public function __construct(
        public readonly string $projectApiKey,
        public readonly Consumer $consumer,
        public readonly string $agentName = 'Roundtable',
        public readonly ?string $agentAvatarUrl = null,
        public readonly int $timeoutSeconds = 30,
        public readonly ?string $hubBaseUrl = null,
        public readonly string $projectName = '',
    ) {
    }
```

In `src/Admin/Page.php`, add the key to the localised array (keys stay alphabetical):

```php
            array(
                'agentName'   => $this->config->agentName,
                'nonce'       => \wp_create_nonce( 'wp_rest' ),
                'projectName' => $this->config->projectName,
                'restUrl'     => \rest_url( 'roundtable/v1' ),
            ),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `composer test`
Expected: PASS (whole suite green).

- [ ] **Step 5: Commit**

```bash
git add src/Config.php src/Admin/Page.php tests/ConfigTest.php tests/Admin/PageTest.php
git commit -m "feat(config): add projectName and localize it to the chat UI"
```

---

### Task 2: One JS reader for both names

**Files:**
- Create: `assets/src/config.js`
- Create: `assets/test/config.test.mjs`
- Modify: `assets/src/avatars.jsx:28-55` (drop `agentDisplayName`, fix the Sage-specific docblock)
- Modify: `assets/src/components.jsx:9`, `assets/src/topic-detail.jsx:6` (import sites)

**Interfaces:**
- Produces: `agentDisplayName(): string` (configured name, else `'Roundtable'`) and `projectDisplayName(): string` (configured project, else `''`), both from `./config.js`. Every later task imports from there.
- Note: `agentDisplayName` moves out of `avatars.jsx`; its two importers must be updated in this task or the bundle breaks.

- [ ] **Step 1: Write the failing test**

Create `assets/test/config.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agentDisplayName, projectDisplayName } from '../src/config.js';

test('agentDisplayName falls back to the SDK default', () => {
  globalThis.window = {};
  assert.equal(agentDisplayName(), 'Roundtable');
});

test('agentDisplayName returns the configured name', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Sage' } };
  assert.equal(agentDisplayName(), 'Sage');
});

test('projectDisplayName is empty when no project is configured', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Sage' } };
  assert.equal(projectDisplayName(), '');
});

test('projectDisplayName returns the configured project', () => {
  globalThis.window = { RoundtableConfig: { projectName: 'Polylang AI Automatic Translation' } };
  assert.equal(projectDisplayName(), 'Polylang AI Automatic Translation');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd assets && npm test`
Expected: FAIL — cannot resolve `../src/config.js`.

- [ ] **Step 3: Implement**

Create `assets/src/config.js`:

```javascript
// assets/src/config.js — the names localized by src/Admin/Page.php.

/** @returns {{agentName?:string, projectName?:string}} */
function cfg() {
  return (typeof window !== 'undefined' && window.RoundtableConfig) || {};
}

/**
 * The assistant's display name, as configured by the consuming plugin.
 * @returns {string}
 */
export function agentDisplayName() {
  return cfg().agentName || 'Roundtable';
}

/**
 * The consuming product's display name, or '' when it is not configured.
 * @returns {string}
 */
export function projectDisplayName() {
  return cfg().projectName || '';
}
```

In `assets/src/avatars.jsx`, delete the `agentDisplayName` export (lines 52-55) and de-Sage the avatar docblock:

```javascript
/**
 * Avatar for the AI assistant.
 * @param {{class?:string, size?:'sm'|'md'|'lg'}} props
 */
```

In `assets/src/components.jsx:9`, split the import:

```javascript
import { AgentAvatar } from './avatars.jsx';
import { agentDisplayName, projectDisplayName } from './config.js';
```

In `assets/src/topic-detail.jsx:6`, do the same:

```javascript
import { AgentAvatar, PersonAvatar } from './avatars.jsx';
import { agentDisplayName } from './config.js';
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd assets && npm test`
Expected: PASS — the new file's 4 tests plus the existing suite (`components`, `topic-detail`, …) still green.

- [ ] **Step 5: Commit**

```bash
git add assets/src/config.js assets/src/avatars.jsx assets/src/components.jsx assets/src/topic-detail.jsx assets/test/config.test.mjs
git commit -m "refactor(ui): read agent and project name from a single config module"
```

---

### Task 3: Project-aware greeting

**Files:**
- Modify: `assets/src/chat-copy.js:1-7`
- Create: `assets/test/chat-copy.test.mjs`

**Interfaces:**
- Consumes: `agentDisplayName()`, `projectDisplayName()` from Task 2.
- Produces: `chatGreeting(agentName, projectName): string`. `NEW_TOPIC_INTRO` and `TOPIC_CHIPS` keep their current names and shapes — only the greeting becomes a function.

- [ ] **Step 1: Write the failing test**

Create `assets/test/chat-copy.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatGreeting } from '../src/chat-copy.js';

test('chatGreeting names the agent and the project', () => {
  const text = chatGreeting('Sage', 'Polylang AI Automatic Translation');
  assert.match(text, /I'm Sage\./);
  assert.match(text, /Ask how Polylang AI Automatic Translation works/);
});

test('chatGreeting falls back when no project name is configured', () => {
  const text = chatGreeting('Roundtable', '');
  assert.match(text, /I'm Roundtable\./);
  assert.match(text, /Ask how it works/);
  assert.doesNotMatch(text, /translation/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd assets && npm test`
Expected: FAIL — `chatGreeting is not a function` (only `CHAT_GREETING` exists).

- [ ] **Step 3: Implement**

In `assets/src/chat-copy.js`, replace the `CHAT_GREETING` constant (keep `NEW_TOPIC_INTRO` and `TOPIC_CHIPS` exactly as they are):

```javascript
/**
 * The greeting shown when the user opens the chat while browsing the community.
 * @param {string} agentName   The configured assistant name.
 * @param {string} projectName The configured product name; '' falls back to generic copy.
 * @returns {string}
 */
export function chatGreeting(agentName, projectName) {
  const subject = projectName ? `how ${projectName} works` : 'how it works';
  return `Hi — I'm ${agentName}. Ask ${subject}, report something off, or suggest an improvement. `
    + "If it's worth tracking, I'll draft a topic for you.";
}
```

In `assets/src/components.jsx`, update the import on line 11 and the initial thread state (lines 90-92):

```javascript
import { chatGreeting, NEW_TOPIC_INTRO, TOPIC_CHIPS } from './chat-copy.js';
```

```javascript
  const [turns, setTurns] = useState([{
    role: 'agent', reply: chatGreeting(agentDisplayName(), projectDisplayName()), steps: [], error: false, introChips: true,
  }]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd assets && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/src/chat-copy.js assets/src/components.jsx assets/test/chat-copy.test.mjs
git commit -m "feat(chat): greeting names the configured agent and project"
```

---

### Task 4: Remove every remaining hardcoded "Sage"

**Files:**
- Modify: `assets/src/components.jsx:135,162` (transcript call, composer placeholder)
- Modify: `assets/src/conversation.js:6-14` (transcript prefix)
- Modify: `assets/src/started-list.jsx` (empty state, line ~90)
- Modify: `assets/src/topics.js:175` (default arg)
- Modify: `assets/src/community-app.jsx:140` (chat launcher aria-label)
- Test: `assets/test/conversation.test.mjs:5-12`, `assets/test/components.test.mjs:17-27`

**Interfaces:**
- Consumes: `agentDisplayName()` from Task 2.
- Produces: `turnsToConversation(turns, agentName = 'Roundtable'): string` — the second parameter is new; `components.jsx` is its only caller.

- [ ] **Step 1: Write the failing tests**

Replace the transcript test in `assets/test/conversation.test.mjs`:

```javascript
test('turnsToConversation labels agent lines with the configured name', () => {
  const text = turnsToConversation([
    { role: 'agent', reply: 'Hello' },
    { role: 'user', reply: 'Shortcodes break' },
  ], 'Sage');
  assert.match(text, /Sage: Hello/);
  assert.match(text, /User: Shortcodes break/);
});

test('turnsToConversation falls back to the SDK default name', () => {
  const text = turnsToConversation([{ role: 'agent', reply: 'Hello' }]);
  assert.match(text, /Roundtable: Hello/);
});
```

Replace the ChatPanel test in `assets/test/components.test.mjs` (a name the SDK never defaults to proves the wiring):

```javascript
test('ChatPanel renders the configured agent name in header, greeting and composer', async () => {
  const { ChatPanel } = await import('../src/components.jsx');
  globalThis.window = { RoundtableConfig: { agentName: 'Nova', projectName: 'Acme Plugin' } };
  const html = renderToString(h(ChatPanel, {}));
  assert.match(html, /Nova/);
  assert.match(html, /Message Nova/);
  assert.match(html, /Ask how Acme Plugin works/);
  assert.doesNotMatch(html, /Sage/);
  assert.match(html, /Community assistant/);
  assert.match(html, /rt-agent-icon/);
  assert.match(html, /rt-cbox/);
  assert.match(html, /rt-chips/);
  assert.match(html, /Report a bug/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd assets && npm test`
Expected: FAIL — the transcript still says `Sage:` regardless of the argument, and the panel renders `Message Sage…`.

- [ ] **Step 3: Implement**

`assets/src/conversation.js` — thread the name through (the hub's summarizer does not parse this prefix, so renaming it is safe):

```javascript
/**
 * Build a hub-ready conversation transcript from chat turns.
 * @param {Array<{role:string, reply:string}>} turns
 * @param {string} agentName The configured assistant name, used to label its lines.
 * @returns {string}
 */
export function turnsToConversation(turns, agentName = 'Roundtable') {
  const lines = [];
  for (const turn of Array.isArray(turns) ? turns : []) {
    if (!turn?.reply?.trim()) continue;
    const who = turn.role === 'user' ? 'User' : agentName;
    lines.push(`${who}: ${turn.reply.trim()}`);
  }
  return lines.join('\n');
}
```

`assets/src/components.jsx:135` — pass the name:

```javascript
    const conversation = turnsToConversation(turns, agentDisplayName());
```

`assets/src/components.jsx:162` — the placeholder:

```javascript
  const composerPlaceholder = newTopicMode ? 'Describe your topic…' : `Message ${agentName}…`;
```

`assets/src/started-list.jsx` — import `agentDisplayName` from `./config.js`, read it once at the top of the `StartedList` component body (next to its other hooks), and use it in the empty state:

```javascript
        <div class="rt-list-msg">{`No topics started yet. Use ${agentName} on the right to draft one.`}</div>
```

`assets/src/topics.js:175` — the default argument:

```javascript
export function mapCommentToView(row, agentName = 'Roundtable') {
```

`assets/src/community-app.jsx:140` — the launcher label (add `const agentName = agentDisplayName();` in the component body, importing from `./config.js`):

```javascript
          aria-label={`Open ${agentName} chat`}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd assets && npm test`
Expected: PASS. Then confirm the string is gone from the source:

Run: `grep -rn "Sage" assets/src`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add assets/src assets/test
git commit -m "feat(ui): use the configured agent name everywhere"
```

---

### Task 5: Header shows the project name

**Files:**
- Modify: `assets/src/community-app.jsx:71-90` (drop the `subCopy` chain, render the project name)
- Create: `assets/test/community-app.test.mjs`

**Interfaces:**
- Consumes: `projectDisplayName()` from Task 2.

- [ ] **Step 1: Write the failing test**

Create `assets/test/community-app.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { CommunityApp } from '../src/community-app.jsx';

test('CommunityApp shows the project name under the Community title', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Nova', projectName: 'Acme Plugin' } };
  const html = renderToString(h(CommunityApp, {}));
  assert.match(html, /rt-title[^>]*>Community</);
  assert.match(html, /rt-sub[^>]*>Acme Plugin</);
  assert.doesNotMatch(html, /Browse public topics/);
});

test('CommunityApp renders no sub-line when no project name is configured', () => {
  globalThis.window = { RoundtableConfig: { agentName: 'Nova' } };
  const html = renderToString(h(CommunityApp, {}));
  assert.doesNotMatch(html, /rt-sub/);
});
```

Both tests import the module once: `projectDisplayName()` is called inside the component body, so it re-reads `window.RoundtableConfig` on every render — no module-cache trickery needed.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd assets && npm test`
Expected: FAIL — the rendered sub-line still reads "Browse public topics — or ask Sage on the right."

- [ ] **Step 3: Implement**

In `assets/src/community-app.jsx`, delete the whole `subCopy` ternary chain (lines 71-77) and render the project name instead (lines 86-92):

```javascript
  const projectName = projectDisplayName();
```

```javascript
            <div class="rt-pagehead">
              <div>
                <h1 class="rt-title">Community</h1>
                {projectName && <p class="rt-sub">{projectName}</p>}
              </div>
              <button class="rt-newtopic-head" type="button" onClick={requestNewTopic}>+ New topic</button>
            </div>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd assets && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add assets/src/community-app.jsx assets/test/community-app.test.mjs
git commit -m "feat(ui): show the project name in the community header"
```

---

### Task 6: User bubble and composer

**Files:**
- Modify: `assets/src/styles.css:4` (tokens), `:191` (`.rt-user`), `:~205` (`.rt-cbox`, `.rt-cbox textarea`)
- Modify: `assets/src/components.jsx:190-198` (composer auto-grow)

**Interfaces:** none — presentation only.

This task has no unit test: bubble colour and textarea growth are visual, and the JS suite has no DOM. It is verified in the browser in Task 7. Do not fake a test for it.

- [ ] **Step 1: Add the bubble tokens and restyle `.rt-user`**

In `assets/src/styles.css` line 4, append two tokens to the `#roundtable-app` custom-property block (leave `--rt-accent` alone):

```css
--rt-user-bg:#1e293b; --rt-user-ink:#fff;
```

Replace line 191:

```css
#roundtable-app .rt-user { align-self:flex-end; background:var(--rt-user-bg); color:var(--rt-user-ink); border-radius:12px 12px 3px 12px; padding:9px 12px; max-width:88%; font-size:13.5px; box-shadow:0 3px 10px -6px rgba(15,23,42,.45); }
```

- [ ] **Step 2: Centre the composer and cap its growth**

Replace the `.rt-cbox` and `.rt-cbox textarea` rules:

```css
#roundtable-app .rt-cbox { display:flex; align-items:center; gap:8px; background:var(--rt-panel); border:1px solid var(--rt-line); border-radius:11px; padding:7px 7px 7px 12px; }
#roundtable-app .rt-cbox textarea { flex:1; border:none!important; background:transparent!important; box-shadow:none!important; resize:none; font:inherit; font-size:13.5px; line-height:1.45; color:var(--rt-ink); outline:none; padding:4px 0; min-height:0; max-height:106px; overflow-y:auto; margin:0; }
```

- [ ] **Step 3: Make the textarea grow to five lines**

In `assets/src/components.jsx`, import `useRef` (line 3: `import { useEffect, useRef, useState } from 'preact/hooks';`), then inside `ChatPanel` add the ref and the resize effect next to the other hooks:

```javascript
  const composerRef = useRef(null);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [composer]);
```

Wire the ref onto the textarea (line 192). The effect runs on every `composer` change, so it also resets the height after `send()` clears the box; `max-height` in CSS caps it at five lines:

```javascript
          <textarea ref={composerRef} rows="1" placeholder={composerPlaceholder} value={composer}
```

- [ ] **Step 4: Verify the suite still passes**

Run: `cd assets && npm test`
Expected: PASS — `useEffect` does not run under `renderToString`, and `composerRef.current` is null there, so server-side rendering is unaffected.

- [ ] **Step 5: Commit**

```bash
git add assets/src/styles.css assets/src/components.jsx
git commit -m "fix(chat): slate user bubble and vertically centered, growing composer"
```

---

### Task 7: Build, gates, and browser verification

**Files:**
- Modify: `assets/dist/roundtable.js`, `assets/dist/roundtable.css` (built artefacts; they are committed in this repo)
- Modify (separate repo): `/Users/robbertvermeulen/dev/rt-harness/wp-content/plugins/roundtable-harness/roundtable-harness.php:45-52`

- [ ] **Step 1: Run every gate**

```bash
cd assets && npm test && npm run build && cd ..
composer test && composer stan && composer cs
```

Expected: JS suite green, `built dist/roundtable.js + dist/roundtable.css`, PHPUnit green, PHPStan "No errors", PHPCS clean. Fix anything red before continuing — PHPStan L6 and PHPCS are a hard gate for this SDK.

- [ ] **Step 2: Point the harness at a project name**

In the harness plugin's `config()` function, add the project name (the harness consumes the SDK through a Composer path repository, so the code change is already live):

```php
	return new Config(
		projectApiKey: \defined( 'ROUNDTABLE_API_KEY' ) ? ROUNDTABLE_API_KEY : API_KEY,
		consumer: new HarnessConsumer(),
		agentName: 'Sage',
		timeoutSeconds: 120, // dev: agent turns that inspect the real repo can exceed the 30s default.
		hubBaseUrl: \defined( 'ROUNDTABLE_HUB_URL' ) ? ROUNDTABLE_HUB_URL : HUB_URL,
		projectName: 'Polylang AI Automatic Translation',
	);
```

Commit that in the `rt-harness` repo separately.

- [ ] **Step 3: Verify in the browser**

Start the harness (DDEV WordPress + the hub on `:8799`), open **Roundtable → Community**, and check each item from the spec:

1. Header reads `Community` with `Polylang AI Automatic Translation` underneath, and no "Browse public topics — or ask Sage on the right." on any of the four tabs.
2. The chat greeting says "Hi — I'm Sage. Ask how Polylang AI Automatic Translation works…".
3. The composer placeholder reads `Message Sage…` and its text sits **vertically centred**, not at the bottom.
4. Shift+Enter grows the textarea line by line, up to five lines, then it scrolls.
5. A sent message renders in a **dark slate** bubble (`#1e293b`, white text) with no blue glow; buttons, links and the focus ring are still blue.
6. The Started tab's empty state says "Use Sage on the right to draft one."

Take a screenshot of the chat panel with one user message and one agent reply.

- [ ] **Step 4: Commit the build artefacts**

```bash
git add assets/dist
git commit -m "chore(build): rebuild bundle for chat polish & naming"
```

- [ ] **Step 5: Open the PR**

```bash
git push -u origin sdk-m3-chat-polish-naming
gh pr create --title "SDK-M3: configurable agent/project name, slate user bubble, composer fix" --body "$(cat <<'EOF'
Implements `docs/superpowers/specs/2026-07-14-chat-polish-naming-design.md` — feedback items 1, 2, 3 and 8.

- `Config::$projectName` + `agentName` localised to the UI; no `"Sage"` left in `assets/src`
- Community header: `Community` + the project name; per-tab sub-lines dropped
- Greeting is project-aware (was: "Ask how translation works")
- User bubble is slate `#1e293b`; composer is vertically centred and grows to five lines

Out of scope, tracked separately: comment upvoting (hub has no comment votes), streaming + activity log, conversation persistence across refresh.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Follow-up issues to file (not part of this plan)

- **Hub:** comment votes — `POST/DELETE /cases/{case_id}/comments/{id}/votes`; the SDK's `comment-actions.jsx` buttons stay `disabled` until that exists (feedback item 4).
- **Spec B:** streaming + activity log — needs a streaming-aware output guard in the hub (`agent/event_filter.py` drops `TextDeltaEvent` fail-closed) and an SSE passthrough in `MessageController` (item 5).
- **Spec C:** restore the last conversation after a page refresh (item 7).
