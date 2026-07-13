# SDK-M2 Slice 2a — Community List (All tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show real public topics on the Community admin page: two-column layout (list left, Sage chat right), **All** tab wired to `GET /cases`, reusable topic-row, search/sort/type filters. Participating/Started/Roadmap tabs render disabled (slice 2b). Votes read-only; no comment count yet (hub gap).

**Architecture:** Extend `Transport` with `get()`; `HubClient::listCases()` forwards query params to hub `GET /cases`. New `CasesController` registers `GET /roundtable/v1/cases` behind `Rest\Gate`. Front-end: `topics.js` maps hub `case` → UI `Topic`; `CommunityApp` composes `TopicList` + existing `ChatPanel`; `index.js` mounts `CommunityApp`.

**Tech Stack:** Same as slice 1. PHP gate: `composer cs && composer stan && composer test`. JS gate: `cd assets && npm ci && npm test && npm run build`.

**Milestone:** SDK-M2 issues **#7** (browse proxy, partial), **#9** (list + row, partial — All tab only).

**Deferred to slice 2b:** Participating/Started/Roadmap tabs, vote proxy, `comment_count`, topic detail links.

---

## Task 1: `Transport::get()` seam

**Files:** Modify `src/Http/Transport.php`, `src/Http/WpHttpTransport.php`, `tests/Support/FakeTransport.php`

- [ ] Add `get(string $url, array $headers, int $timeoutSeconds): TransportResponse` to interface
- [ ] Implement in `WpHttpTransport` via `wp_remote_get`
- [ ] Implement in `FakeTransport` (record `lastMethod = 'GET'`)
- [ ] Commit

## Task 2: `HubClient::listCases()` + tests

**Files:** Modify `src/HubClient.php`; Create `tests/HubClientListCasesTest.php`

- [ ] `listCases(array $query): array` — GET `{hub}/cases?{type,q,sort,limit,offset}`, Bearer auth, JSON decode, `guardStatus`
- [ ] Tests: builds URL with query string; maps 403/5xx to `HubException`; returns decoded list
- [ ] Commit

## Task 3: `CasesController` REST proxy

**Files:** Create `src/CasesController.php`, `tests/CasesControllerTest.php`; Modify `src/Roundtable.php`

- [ ] `GET /roundtable/v1/cases` — Gate permission; sanitize `type` (`question|bug|feature_request`), `q`, `sort` (`newest|top|trending`), `limit` (1–100), `offset` (≥0)
- [ ] Success `200` passes through hub JSON array; errors → `{"error":{"kind":…}}` like `MessageController`
- [ ] Wire in `Roundtable::mount()` on `rest_api_init`
- [ ] Tests: permission gates; handle forwards and returns cases; hub error mapping
- [ ] Commit

## Task 4: `topics.js` case→Topic mapping + tests

**Files:** Create `assets/src/topics.js`, `assets/test/topics.test.mjs`

- [ ] `mapCaseToTopic(caseRow)` — UI labels: type badge, status pill (`escalated`→Planned, etc.), `formatAge(created_at)`
- [ ] Tests: type/status mapping, age formatting
- [ ] Commit

## Task 5: `api.js` + `fetchCases`

**Files:** Modify `assets/src/api.js`, add `assets/test/api.test.mjs` if needed (or cover via components test)

- [ ] Generic `get(path, query)` helper
- [ ] `fetchCases({type, q, sort, limit, offset})`
- [ ] Commit

## Task 6: `TopicRow` + `TopicList` components

**Files:** Create `assets/src/topic-list.jsx`; Modify `assets/src/components.jsx`; tests in `assets/test/topic-list.test.mjs`

- [ ] `TopicRow` — vote display read-only (buttons disabled), title, snippet, meta badges, no comment count column (or em dash)
- [ ] `TopicList` — loads cases on mount/filter change; search debounce; type segs; sort selector; loading/error/empty states
- [ ] Commit

## Task 7: `CommunityApp` layout + styles

**Files:** Create `assets/src/community-app.jsx`; Modify `assets/src/index.js`, `assets/src/styles.css`, `assets/src/components.jsx` (export ChatPanel, wire `resetNonce` for header New topic)

- [ ] Two-column `.rt-layout` / `.rt-main` / `.rt-aside` (mockup proportions)
- [ ] Page header + "+ New topic" triggers chat reset via shared `resetNonce`
- [ ] Tabs: All active; Participating/Started/Roadmap disabled with `aria-disabled` + title "Coming soon"
- [ ] `index.js` mounts `CommunityApp`
- [ ] Commit

## Task 8: Gate + build

- [ ] `composer cs && composer stan && composer test`
- [ ] `cd assets && npm test && npm run build` — commit dist
- [ ] Update `tests/RoundtableMountTest.php` for third `rest_api_init` route
- [ ] Commit