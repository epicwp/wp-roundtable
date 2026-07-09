# wp-roundtable SDK-M1 (chat backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the dependency-free PHP backend that lets an authorised WordPress-admin user chat with the Roundtable hub's Role-1 agent — buffered transport, licence-gated, health-report injected on the first turn — without exposing the project key to the browser.

**Architecture:** A plain PSR-4 library under `EpicWP\Roundtable\`. Two injected seams isolate WordPress: a `Transport` (HTTP) so the core `HubClient` is pure and unit-testable, and thin WP-glue classes (`WpHttpTransport`, `Session`, `MessageController`, `Roundtable`) tested with Brain Monkey. The hub streams SSE; the SDK reads the whole response buffered and parses it into typed `Event`s.

**Tech Stack:** PHP 8.1+ · WordPress core HTTP (`wp_remote_post`) · PHPCS (Oblak) · PHPStan level 6 · PHPUnit 9.6 · Brain Monkey (dev, for WP-function mocking). **No runtime composer dependencies.**

**Spec:** `epicwp/roundtable` → `docs/specs/2026-07-09-project-2-sdk-m1-chat-backend-design.md`. Implements umbrella API contract §9. Milestone: `epicwp/wp-roundtable` #1 "SDK-M1: chat backend"; tracker issue #1.

## Global Constraints

- **PHP 8.1+**, PSR-4 namespace `EpicWP\Roundtable\` → `src/`; tests `EpicWP\Roundtable\Tests\` → `tests/`.
- **No runtime composer dependencies.** Production code uses only WordPress core functions + PHP stdlib. Dev-only deps (PHPUnit, Brain Monkey/Mockery, phpcs, phpstan) are fine.
- **Hard quality gate for every task:** `composer cs` (PHPCS Oblak, `src/`) **and** `composer stan` (PHPStan L6, `src/`) **and** `composer test` (PHPUnit, all) must pass. This is a public API for external devs.
- **Full docblocks on every public class, interface, method, and property** — description + `@param`/`@return`/`@throws` where applicable. Typed everything (no untyped params/returns); typed interfaces over loose callables.
- **The project API key never appears in an exception message, log, or response body.**
- The hub URL is **not** consumer config: it is `HubClient::HUB_URL` (EpicWP's hosted multi-tenant SaaS), with an optional `Config::$hubBaseUrl` override for dev/staging only.
- Tests **never** hit a live hub: the core goes through the `Transport` seam (fake in tests); WP-glue is mocked with Brain Monkey.
- Content bodies (messages) are passed through **verbatim** — no transforms.

---

### Task 1: Test harness + tooling gate

**Files:**
- Modify: `composer.json` (add dev deps + confirm scripts)
- Create: `phpunit.xml.dist`
- Create: `tests/bootstrap.php`
- Create: `tests/TestCase.php` (Brain Monkey base)
- Create: `tests/SmokeTest.php` (throwaway, proves the harness runs)
- Modify: `.github/workflows/ci.yml` (add a `composer test` step)

**Interfaces:**
- Produces: `EpicWP\Roundtable\Tests\TestCase` — a base test case that boots/tears down Brain Monkey, for WP-coupled tests. Pure tests extend `PHPUnit\Framework\TestCase` directly.

- [ ] **Step 1: Add dev dependencies.** In `composer.json` `require-dev`, add `"brain/monkey": "^2.6"` (pulls in `mockery/mockery`). Keep the existing `scripts` (`cs`, `cs:fix`, `stan`, `test`).

- [ ] **Step 2: Create `phpunit.xml.dist`:**

```xml
<?xml version="1.0"?>
<phpunit xmlns:xsi="https://www.w3.org/2001/XMLSchema-instance"
         xsi:noNamespaceSchemaLocation="vendor/phpunit/phpunit/phpunit.xsd"
         bootstrap="tests/bootstrap.php"
         colors="true"
         failOnWarning="true"
         failOnRisky="true">
  <testsuites>
    <testsuite name="unit">
      <directory>tests</directory>
    </testsuite>
  </testsuites>
</phpunit>
```

- [ ] **Step 3: Create `tests/bootstrap.php`:**

```php
<?php
declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';
```

- [ ] **Step 4: Create `tests/TestCase.php`** (base for WP-coupled tests):

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

/** Base test case that boots Brain Monkey so WordPress functions can be mocked. */
abstract class TestCase extends PHPUnitTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Monkey\setUp();
    }

    protected function tearDown(): void
    {
        Monkey\tearDown();
        parent::tearDown();
    }
}
```

- [ ] **Step 5: Create `tests/SmokeTest.php`** (throwaway):

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class SmokeTest extends PHPUnitTestCase
{
    public function test_harness_runs(): void
    {
        self::assertTrue(true);
    }
}
```

- [ ] **Step 6: Add the test step to CI.** In `.github/workflows/ci.yml`, after the `composer stan` run step, add:

```yaml
      - run: composer test
```

- [ ] **Step 7: Install + run the gate.**

Run: `composer install --no-interaction && composer test && composer cs && composer stan`
Expected: PHPUnit `OK (1 test)`, PHPCS no errors, PHPStan `[OK] No errors`.

- [ ] **Step 8: Commit.**

```bash
git add composer.json composer.lock phpunit.xml.dist tests/ .github/workflows/ci.yml
git commit -m "chore(test): add PHPUnit + Brain Monkey harness and CI test step"
```

---

### Task 2: `Consumer` interface + `Config`

**Files:**
- Create: `src/Consumer.php`
- Create: `src/Config.php`
- Create: `tests/ConfigTest.php`
- Create: `tests/Support/FakeConsumer.php` (reused by later tasks)

**Interfaces:**
- Produces: `Consumer` (`isUserAllowed():bool`, `subjectId():string`, `metadata():?string`, `clientVersion():?string`); `Config` (constructor below + no behaviour); `Tests\Support\FakeConsumer` (a configurable test double).

- [ ] **Step 1: Write the failing test** `tests/ConfigTest.php`:

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class ConfigTest extends PHPUnitTestCase
{
    public function test_exposes_its_values_with_defaults(): void
    {
        $consumer = new FakeConsumer();
        $config   = new Config('pk_live_123', $consumer);

        self::assertSame('pk_live_123', $config->projectApiKey);
        self::assertSame($consumer, $config->consumer);
        self::assertSame('Roundtable', $config->agentName);
        self::assertNull($config->agentAvatarUrl);
        self::assertSame(30, $config->timeoutSeconds);
        self::assertNull($config->hubBaseUrl);
    }

    public function test_accepts_overrides(): void
    {
        $config = new Config('pk', new FakeConsumer(), 'Sage', 'https://x/a.png', 45, 'https://staging');
        self::assertSame('Sage', $config->agentName);
        self::assertSame('https://x/a.png', $config->agentAvatarUrl);
        self::assertSame(45, $config->timeoutSeconds);
        self::assertSame('https://staging', $config->hubBaseUrl);
    }
}
```

Also create `tests/Support/FakeConsumer.php`:

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Support;

use EpicWP\Roundtable\Consumer;

/** A configurable Consumer test double. */
final class FakeConsumer implements Consumer
{
    public function __construct(
        private bool $allowed = true,
        private string $subjectId = 'subject-1',
        private ?string $metadata = null,
        private ?string $clientVersion = null,
    ) {}

    public function isUserAllowed(): bool { return $this->allowed; }
    public function subjectId(): string { return $this->subjectId; }
    public function metadata(): ?string { return $this->metadata; }
    public function clientVersion(): ?string { return $this->clientVersion; }
}
```

- [ ] **Step 2: Run it — fails** (`Config`/`Consumer` not found).

Run: `composer test -- --filter ConfigTest`
Expected: FAIL (class not found).

- [ ] **Step 3: Create `src/Consumer.php`** (full docblocks per spec §4) and `src/Config.php`:

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

/**
 * The consuming plugin's licensing/identity boundary.
 *
 * The SDK calls these per request to decide whether a request may be made and to supply
 * per-user context; it never hardcodes any of it. All methods run server-side.
 */
interface Consumer
{
    /**
     * Whether the current user may use Roundtable (e.g. holds a valid licence).
     *
     * The SDK makes NO hub request when this returns false.
     *
     * @return bool True to allow the request; false to refuse before any hub call.
     */
    public function isUserAllowed(): bool;

    /**
     * A stable, opaque per-user handle (e.g. derived from the licence).
     *
     * Never a real name; the hub mints its pseudonymous handle from this value.
     *
     * @return string The opaque subject id.
     */
    public function subjectId(): string;

    /**
     * Opaque ambient context sent silently on the first turn (the WP site health report).
     *
     * The agent uses it without announcing it. Return null to send none.
     *
     * @return string|null The metadata string, or null.
     */
    public function metadata(): ?string;

    /**
     * The consuming plugin's version, sent as the top-level `client_version` field.
     *
     * @return string|null The version string, or null.
     */
    public function clientVersion(): ?string;
}
```

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

/** Immutable SDK configuration, built once by the consumer at bootstrap. */
final class Config
{
    /**
     * @param string       $projectApiKey  Per-project (multi-tenant) bearer key; stays server-side.
     * @param Consumer      $consumer       The plugin's licensing/identity boundary.
     * @param string        $agentName      Display name for the agent (local; no /project/config yet).
     * @param string|null   $agentAvatarUrl Optional avatar URL for the agent.
     * @param int           $timeoutSeconds HTTP timeout for a buffered turn.
     * @param string|null   $hubBaseUrl     Dev/staging override ONLY; null uses the baked-in SaaS URL.
     */
    public function __construct(
        public readonly string $projectApiKey,
        public readonly Consumer $consumer,
        public readonly string $agentName = 'Roundtable',
        public readonly ?string $agentAvatarUrl = null,
        public readonly int $timeoutSeconds = 30,
        public readonly ?string $hubBaseUrl = null,
    ) {}
}
```

- [ ] **Step 4: Run — passes.** `composer test -- --filter ConfigTest` → PASS.
- [ ] **Step 5: Gate + commit.** `composer cs && composer stan && composer test`, then:

```bash
git add src/Consumer.php src/Config.php tests/ConfigTest.php tests/Support/FakeConsumer.php
git commit -m "feat(config): add Consumer interface and Config value object"
```

---

### Task 3: `HubError`

**Files:**
- Create: `src/HubError.php`
- Create: `tests/HubErrorTest.php`

**Interfaces:**
- Produces: `HubError extends \RuntimeException` with kind constants `BLOCKED`, `OVER_QUOTA`, `NETWORK`, `SERVER`, `BAD_RESPONSE`; `kind(): string`; static factories `blocked()`, `overQuota()`, `network(string $detail)`, `server(int $status)`, `badResponse(string $detail)`. Messages never contain the API key.

- [ ] **Step 1: Write the failing test** `tests/HubErrorTest.php`:

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\HubError;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class HubErrorTest extends PHPUnitTestCase
{
    public function test_factories_carry_their_kind(): void
    {
        self::assertSame(HubError::BLOCKED, HubError::blocked()->kind());
        self::assertSame(HubError::OVER_QUOTA, HubError::overQuota()->kind());
        self::assertSame(HubError::NETWORK, HubError::network('dns')->kind());
        self::assertSame(HubError::SERVER, HubError::server(503)->kind());
        self::assertSame(HubError::BAD_RESPONSE, HubError::badResponse('bad json')->kind());
    }

    public function test_is_a_runtime_exception(): void
    {
        self::assertInstanceOf(\RuntimeException::class, HubError::blocked());
    }
}
```

- [ ] **Step 2: Run — fails.** `composer test -- --filter HubErrorTest` → FAIL.
- [ ] **Step 3: Create `src/HubError.php`:**

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

/**
 * A failure talking to the hub. The API key is never included in the message.
 *
 * Use the named constructors; `kind()` returns one of the `*` constants so callers can
 * branch (e.g. render "you are over your limit" for OVER_QUOTA).
 */
final class HubError extends \RuntimeException
{
    public const BLOCKED = 'blocked';
    public const OVER_QUOTA = 'over_quota';
    public const NETWORK = 'network';
    public const SERVER = 'server';
    public const BAD_RESPONSE = 'bad_response';

    private function __construct(private string $kind, string $message)
    {
        parent::__construct($message);
    }

    /** @return string One of the class constants. */
    public function kind(): string
    {
        return $this->kind;
    }

    /** The request was refused by the gate (HTTP 403). */
    public static function blocked(): self
    {
        return new self(self::BLOCKED, 'The request was refused (blocked).');
    }

    /** The subject is over its request quota (HTTP 429). */
    public static function overQuota(): self
    {
        return new self(self::OVER_QUOTA, 'The request was refused (over quota).');
    }

    /** A transport-level failure (no HTTP response). `$detail` must not contain secrets. */
    public static function network(string $detail): self
    {
        return new self(self::NETWORK, "Network error contacting the hub: {$detail}");
    }

    /** The hub returned a server error. */
    public static function server(int $status): self
    {
        return new self(self::SERVER, "The hub returned a server error (HTTP {$status}).");
    }

    /** The hub response could not be parsed. `$detail` must not contain secrets. */
    public static function badResponse(string $detail): self
    {
        return new self(self::BAD_RESPONSE, "Malformed hub response: {$detail}");
    }
}
```

- [ ] **Step 4: Run — passes.** `composer test -- --filter HubErrorTest` → PASS.
- [ ] **Step 5: Gate + commit.**

```bash
composer cs && composer stan && composer test
git add src/HubError.php tests/HubErrorTest.php
git commit -m "feat(error): add typed HubError with kind + secret-free messages"
```

---

### Task 4: `Event` + `TurnResult`

**Files:**
- Create: `src/Event.php`
- Create: `src/TurnResult.php`
- Create: `tests/TurnResultTest.php`

**Interfaces:**
- Produces: `Event` (`__construct(string $type, array $data)`, readonly `$type`/`$data`, type constants `ASSISTANT_TEXT`,`THINKING`,`TOOL_STEP`,`TOOL_RESULT`,`PROGRESS`,`RESULT`,`ERROR`); `TurnResult` (`__construct(list<Event> $events)`, `->events`, `assistantText():string`, `outcome():?Event`, `isError():bool`, `steps():list<Event>`).

- [ ] **Step 1: Write the failing test** `tests/TurnResultTest.php`:

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\Event;
use EpicWP\Roundtable\TurnResult;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class TurnResultTest extends PHPUnitTestCase
{
    public function test_assistant_text_concatenates_assistant_events(): void
    {
        $result = new TurnResult([
            new Event(Event::TOOL_STEP, ['tool' => 'grep']),
            new Event(Event::ASSISTANT_TEXT, ['text' => 'Hello ']),
            new Event(Event::ASSISTANT_TEXT, ['text' => 'world.']),
        ]);
        self::assertSame('Hello world.', $result->assistantText());
    }

    public function test_outcome_returns_the_result_event(): void
    {
        $outcome = new Event(Event::RESULT, ['subtype' => 'case_drafted', 'is_error' => false]);
        $result  = new TurnResult([new Event(Event::ASSISTANT_TEXT, ['text' => 'ok']), $outcome]);
        self::assertSame($outcome, $result->outcome());
        self::assertFalse($result->isError());
    }

    public function test_is_error_when_error_event_present(): void
    {
        $result = new TurnResult([new Event(Event::ERROR, ['message' => 'boom'])]);
        self::assertTrue($result->isError());
    }

    public function test_is_error_when_result_flags_error(): void
    {
        $result = new TurnResult([new Event(Event::RESULT, ['subtype' => 'x', 'is_error' => true])]);
        self::assertTrue($result->isError());
    }

    public function test_steps_returns_tool_and_progress_events(): void
    {
        $step     = new Event(Event::TOOL_STEP, ['tool' => 'grep']);
        $progress = new Event(Event::PROGRESS, ['summary' => 'searching']);
        $result   = new TurnResult([$step, new Event(Event::ASSISTANT_TEXT, ['text' => 'x']), $progress]);
        self::assertSame([$step, $progress], $result->steps());
    }
}
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Create `src/Event.php` and `src/TurnResult.php`:**

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

/**
 * One contract event from a chat turn (mirrors the hub's `agent/events.py`).
 *
 * `$data` is the decoded frame payload, verbatim. The event `type` is one of the
 * constants below; unknown types are preserved as-is.
 */
final class Event
{
    public const ASSISTANT_TEXT = 'assistant_text';
    public const THINKING = 'thinking';
    public const TOOL_STEP = 'tool_step';
    public const TOOL_RESULT = 'tool_result';
    public const PROGRESS = 'progress';
    public const RESULT = 'result';
    public const ERROR = 'error';

    /**
     * @param string               $type The event type (one of the class constants).
     * @param array<string, mixed> $data The decoded frame payload.
     */
    public function __construct(
        public readonly string $type,
        public readonly array $data,
    ) {}
}
```

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

/** The parsed outcome of one chat turn: the ordered events plus convenience accessors. */
final class TurnResult
{
    /** @param list<Event> $events The turn's events, in order. */
    public function __construct(public readonly array $events) {}

    /**
     * The assistant's reply — every `assistant_text` event's `text`, concatenated in order.
     *
     * @return string The reply text (empty string if the turn produced no assistant text).
     */
    public function assistantText(): string
    {
        $text = '';
        foreach ($this->events as $event) {
            if ($event->type === Event::ASSISTANT_TEXT && \is_string($event->data['text'] ?? null)) {
                $text .= $event->data['text'];
            }
        }
        return $text;
    }

    /**
     * The turn-completion `result` event, if any.
     *
     * @return Event|null The result event, or null.
     */
    public function outcome(): ?Event
    {
        foreach ($this->events as $event) {
            if ($event->type === Event::RESULT) {
                return $event;
            }
        }
        return null;
    }

    /**
     * Whether the turn errored — an `error` event, or a `result` event flagged `is_error`.
     *
     * @return bool True on error.
     */
    public function isError(): bool
    {
        foreach ($this->events as $event) {
            if ($event->type === Event::ERROR) {
                return true;
            }
            if ($event->type === Event::RESULT && ($event->data['is_error'] ?? false) === true) {
                return true;
            }
        }
        return false;
    }

    /**
     * The "working…" steps (`tool_step` / `progress`) for the later UI to render.
     *
     * @return list<Event> The step events, in order.
     */
    public function steps(): array
    {
        return \array_values(\array_filter(
            $this->events,
            static fn (Event $e): bool => \in_array($e->type, [Event::TOOL_STEP, Event::PROGRESS], true),
        ));
    }
}
```

- [ ] **Step 4: Run — passes.**
- [ ] **Step 5: Gate + commit.**

```bash
composer cs && composer stan && composer test
git add src/Event.php src/TurnResult.php tests/TurnResultTest.php
git commit -m "feat(events): add Event + TurnResult value objects"
```

---

### Task 5: `SseParser`

**Files:**
- Create: `src/Chat/SseParser.php`
- Create: `tests/Chat/SseParserTest.php`

**Interfaces:**
- Consumes: `Event` (Task 4).
- Produces: `SseParser::parse(string $body): list<Event>` — splits a buffered SSE body into ordered `Event`s.

- [ ] **Step 1: Write the failing test** `tests/Chat/SseParserTest.php`:

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Chat;

use EpicWP\Roundtable\Chat\SseParser;
use EpicWP\Roundtable\Event;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class SseParserTest extends PHPUnitTestCase
{
    public function test_parses_multiple_data_frames_in_order(): void
    {
        $body = "data: {\"type\":\"assistant_text\",\"text\":\"Hi\"}\n\n"
              . "data: {\"type\":\"result\",\"subtype\":\"ok\",\"is_error\":false}\n\n";

        $events = SseParser::parse($body);

        self::assertCount(2, $events);
        self::assertSame(Event::ASSISTANT_TEXT, $events[0]->type);
        self::assertSame('Hi', $events[0]->data['text']);
        self::assertSame(Event::RESULT, $events[1]->type);
    }

    public function test_skips_unparseable_frames_without_failing(): void
    {
        $body = "data: not json\n\n"
              . "data: {\"type\":\"assistant_text\",\"text\":\"ok\"}\n\n";

        $events = SseParser::parse($body);

        self::assertCount(1, $events);
        self::assertSame('ok', $events[0]->data['text']);
    }

    public function test_ignores_non_data_lines_and_blank_bodies(): void
    {
        self::assertSame([], SseParser::parse(''));
        self::assertSame([], SseParser::parse(": keep-alive comment\n\n"));
    }

    public function test_frame_missing_type_is_skipped(): void
    {
        $events = SseParser::parse("data: {\"text\":\"no type\"}\n\n");
        self::assertSame([], $events);
    }
}
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Create `src/Chat/SseParser.php`:**

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Chat;

use EpicWP\Roundtable\Event;

/**
 * Parses a *buffered* Server-Sent-Events body into ordered {@see Event}s.
 *
 * The hub streams `data: <json>\n\n` frames; because the SDK reads the whole response at
 * once (no live streaming), this splits the buffer on the blank-line frame boundary and
 * decodes each `data:` payload. Malformed or typeless frames are skipped defensively — a
 * bad frame never aborts the turn.
 */
final class SseParser
{
    /**
     * @param string $body The raw, buffered SSE response body.
     *
     * @return list<Event> The decoded events, in order.
     */
    public static function parse(string $body): array
    {
        $events = [];
        foreach (\preg_split('/\R\R/', $body) ?: [] as $frame) {
            $frame = \trim($frame);
            if ($frame === '' || \strncmp($frame, 'data:', 5) !== 0) {
                continue;
            }
            $json = \trim(\substr($frame, 5));
            /** @var mixed $decoded */
            $decoded = \json_decode($json, true);
            if (!\is_array($decoded) || !\is_string($decoded['type'] ?? null)) {
                continue;
            }
            $type = $decoded['type'];
            unset($decoded['type']);
            /** @var array<string, mixed> $decoded */
            $events[] = new Event($type, $decoded);
        }
        return $events;
    }
}
```

- [ ] **Step 4: Run — passes.**
- [ ] **Step 5: Gate + commit.**

```bash
composer cs && composer stan && composer test
git add src/Chat/SseParser.php tests/Chat/SseParserTest.php
git commit -m "feat(chat): add buffered SSE parser -> Event[]"
```

---

### Task 6: `Transport` seam + `WpHttpTransport`

**Files:**
- Create: `src/Http/Transport.php`
- Create: `src/Http/TransportResponse.php`
- Create: `src/Http/TransportException.php`
- Create: `src/Http/WpHttpTransport.php`
- Create: `tests/Http/WpHttpTransportTest.php`

**Interfaces:**
- Produces: `Transport::post(string $url, array<string,string> $headers, string $body, int $timeoutSeconds): TransportResponse` (throws `TransportException` on transport failure); `TransportResponse` (`__construct(int $status, string $body)`, readonly `$status`/`$body`); `TransportException extends \RuntimeException`; `WpHttpTransport implements Transport` (WP core impl).

- [ ] **Step 1: Write the failing test** `tests/Http/WpHttpTransportTest.php` (Brain Monkey mocks the WP functions):

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Http;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Http\TransportException;
use EpicWP\Roundtable\Http\WpHttpTransport;
use EpicWP\Roundtable\Tests\TestCase;

final class WpHttpTransportTest extends TestCase
{
    public function test_returns_status_and_body_on_success(): void
    {
        Functions\when('is_wp_error')->justReturn(false);
        Functions\expect('wp_remote_post')->once()->andReturn(['dummy']);
        Functions\expect('wp_remote_retrieve_response_code')->once()->andReturn(200);
        Functions\expect('wp_remote_retrieve_body')->once()->andReturn('data: {}\n\n');

        $response = (new WpHttpTransport())->post('https://hub/x', ['A' => 'b'], '{}', 30);

        self::assertSame(200, $response->status);
        self::assertSame('data: {}\n\n', $response->body);
    }

    public function test_throws_transport_exception_on_wp_error(): void
    {
        $wpError = \Mockery::mock('WP_Error');
        $wpError->shouldReceive('get_error_message')->andReturn('cURL error 6');
        Functions\expect('wp_remote_post')->once()->andReturn($wpError);
        Functions\when('is_wp_error')->justReturn(true);

        $this->expectException(TransportException::class);
        (new WpHttpTransport())->post('https://hub/x', [], '{}', 30);
    }
}
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Create the four `src/Http/*` files:**

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Http;

/** An HTTP POST over an injectable seam, so the core is testable without WordPress. */
interface Transport
{
    /**
     * POST a request and return the response.
     *
     * @param string                $url            The absolute URL.
     * @param array<string, string> $headers        Request headers.
     * @param string                $body           The request body (already encoded).
     * @param int                   $timeoutSeconds The request timeout.
     *
     * @return TransportResponse The HTTP status + raw body.
     *
     * @throws TransportException On a transport-level failure (no HTTP response).
     */
    public function post(string $url, array $headers, string $body, int $timeoutSeconds): TransportResponse;
}
```

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Http;

/** An HTTP response: the status code and the raw body. */
final class TransportResponse
{
    public function __construct(
        public readonly int $status,
        public readonly string $body,
    ) {}
}
```

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Http;

/** A transport-level failure (no HTTP response was received). */
final class TransportException extends \RuntimeException
{
}
```

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Http;

/** The production {@see Transport}, backed by the WordPress HTTP API. */
final class WpHttpTransport implements Transport
{
    /**
     * {@inheritDoc}
     */
    public function post(string $url, array $headers, string $body, int $timeoutSeconds): TransportResponse
    {
        $response = \wp_remote_post($url, [
            'headers' => $headers,
            'body'    => $body,
            'timeout' => $timeoutSeconds,
        ]);

        if (\is_wp_error($response)) {
            throw new TransportException($response->get_error_message());
        }

        return new TransportResponse(
            (int) \wp_remote_retrieve_response_code($response),
            (string) \wp_remote_retrieve_body($response),
        );
    }
}
```

- [ ] **Step 4: Run — passes.**
- [ ] **Step 5: Gate + commit.**

```bash
composer cs && composer stan && composer test
git add src/Http/ tests/Http/WpHttpTransportTest.php
git commit -m "feat(http): add Transport seam + WpHttpTransport"
```

---

### Task 7: `HubClient`

**Files:**
- Create: `src/HubClient.php`
- Create: `tests/HubClientTest.php`
- Create: `tests/Support/FakeTransport.php`

**Interfaces:**
- Consumes: `Config` (T2), `Consumer` (T2), `Transport`/`TransportResponse`/`TransportException` (T6), `SseParser` (T5), `TurnResult`/`Event` (T4), `HubError` (T3).
- Produces: `HubClient::__construct(Config $config, Transport $transport)`; `HubClient::postMessage(string $chatId, string $message, bool $isFirstTurn): TurnResult`; `HubClient::HUB_URL` constant.

- [ ] **Step 1: Create the fake transport** `tests/Support/FakeTransport.php`:

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Support;

use EpicWP\Roundtable\Http\Transport;
use EpicWP\Roundtable\Http\TransportException;
use EpicWP\Roundtable\Http\TransportResponse;

/** A Transport double that records the last call and returns a canned response (or throws). */
final class FakeTransport implements Transport
{
    public ?string $lastUrl = null;
    /** @var array<string, string>|null */
    public ?array $lastHeaders = null;
    public ?string $lastBody = null;

    public function __construct(
        private int $status = 200,
        private string $responseBody = '',
        private ?TransportException $throw = null,
    ) {}

    public function post(string $url, array $headers, string $body, int $timeoutSeconds): TransportResponse
    {
        $this->lastUrl = $url;
        $this->lastHeaders = $headers;
        $this->lastBody = $body;
        if ($this->throw !== null) {
            throw $this->throw;
        }
        return new TransportResponse($this->status, $this->responseBody);
    }
}
```

- [ ] **Step 2: Write the failing test** `tests/HubClientTest.php`:

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Event;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubError;
use EpicWP\Roundtable\Http\TransportException;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class HubClientTest extends PHPUnitTestCase
{
    private function config(FakeConsumer $consumer): Config
    {
        return new Config('pk_secret', $consumer);
    }

    public function test_posts_to_the_hub_and_parses_the_reply(): void
    {
        $transport = new FakeTransport(200, "data: {\"type\":\"assistant_text\",\"text\":\"Hi\"}\n\n");
        $client    = new HubClient($this->config(new FakeConsumer()), $transport);

        $result = $client->postMessage('chat-1', 'hello', false);

        self::assertSame('Hi', $result->assistantText());
        self::assertSame(HubClient::HUB_URL . '/chats/chat-1/messages', $transport->lastUrl);
        self::assertSame('Bearer pk_secret', $transport->lastHeaders['Authorization']);
    }

    public function test_first_turn_body_carries_metadata_and_client_version(): void
    {
        $transport = new FakeTransport(200, '');
        $client    = new HubClient($this->config(new FakeConsumer(true, 'subj', 'HEALTH', '1.2.3')), $transport);

        $client->postMessage('chat-1', 'hello', true);

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertSame('subj', $body['subject_id']);
        self::assertSame('hello', $body['message']);
        self::assertSame('HEALTH', $body['metadata']);
        self::assertSame('1.2.3', $body['client_version']);
    }

    public function test_later_turn_body_omits_metadata_and_client_version(): void
    {
        $transport = new FakeTransport(200, '');
        $client    = new HubClient($this->config(new FakeConsumer(true, 'subj', 'HEALTH', '1.2.3')), $transport);

        $client->postMessage('chat-1', 'hello', false);

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertArrayNotHasKey('metadata', $body);
        self::assertArrayNotHasKey('client_version', $body);
    }

    public function test_uses_the_hub_base_url_override_when_set(): void
    {
        $transport = new FakeTransport(200, '');
        $config    = new Config('pk', new FakeConsumer(), 'Roundtable', null, 30, 'https://staging');
        (new HubClient($config, $transport))->postMessage('c', 'm', false);
        self::assertSame('https://staging/chats/c/messages', $transport->lastUrl);
    }

    /**
     * @return array<string, array{int, string}>
     */
    public static function errorStatuses(): array
    {
        return [
            'blocked'    => [403, HubError::BLOCKED],
            'over quota' => [429, HubError::OVER_QUOTA],
            'server'     => [503, HubError::SERVER],
        ];
    }

    /** @dataProvider errorStatuses */
    public function test_maps_http_error_statuses_to_hub_error(int $status, string $kind): void
    {
        $client = new HubClient($this->config(new FakeConsumer()), new FakeTransport($status, ''));
        try {
            $client->postMessage('c', 'm', false);
            self::fail('expected HubError');
        } catch (HubError $e) {
            self::assertSame($kind, $e->kind());
            self::assertStringNotContainsString('pk_secret', $e->getMessage());
        }
    }

    public function test_maps_transport_exception_to_network_hub_error(): void
    {
        $client = new HubClient(
            $this->config(new FakeConsumer()),
            new FakeTransport(0, '', new TransportException('cURL error 6')),
        );
        $this->expectException(HubError::class);
        try {
            $client->postMessage('c', 'm', false);
        } catch (HubError $e) {
            self::assertSame(HubError::NETWORK, $e->kind());
            throw $e;
        }
    }
}
```

- [ ] **Step 3: Run — fails.**
- [ ] **Step 4: Create `src/HubClient.php`:**

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

use EpicWP\Roundtable\Chat\SseParser;
use EpicWP\Roundtable\Http\Transport;
use EpicWP\Roundtable\Http\TransportException;

/**
 * Talks to the Roundtable hub over an injected {@see Transport}.
 *
 * The only unit that performs I/O to the hub. `postMessage` sends one chat turn, reads the
 * buffered SSE response, and returns typed events. HTTP error statuses and transport
 * failures become a typed {@see HubError}; the project key never appears in an error.
 */
final class HubClient
{
    /** EpicWP's hosted multi-tenant hub. Overridable per {@see Config::$hubBaseUrl} for dev/staging. */
    public const HUB_URL = 'https://hub.roundtable.epicwp.com';

    public function __construct(
        private Config $config,
        private Transport $transport,
    ) {}

    /**
     * Post one chat message and return the turn's parsed events.
     *
     * @param string $chatId      The consumer-supplied chat/session id (resumes the hub session).
     * @param string $message     The user's message (markdown; sent verbatim).
     * @param bool   $isFirstTurn Whether this is the first turn of the chat — only then are the
     *                            health-report `metadata` and `client_version` included.
     *
     * @return TurnResult The ordered events.
     *
     * @throws HubError On a gate refusal (403/429), a server error (5xx), a malformed response,
     *                  or a network failure. The project key is never in the message.
     */
    public function postMessage(string $chatId, string $message, bool $isFirstTurn): TurnResult
    {
        $url  = ($this->config->hubBaseUrl ?? self::HUB_URL) . '/chats/' . $chatId . '/messages';
        $body = $this->buildBody($message, $isFirstTurn);

        try {
            $response = $this->transport->post(
                $url,
                [
                    'Authorization' => 'Bearer ' . $this->config->projectApiKey,
                    'Content-Type'  => 'application/json',
                    'Accept'        => 'text/event-stream',
                ],
                $body,
                $this->config->timeoutSeconds,
            );
        } catch (TransportException $e) {
            throw HubError::network($e->getMessage());
        }

        $this->guardStatus($response->status);

        return new TurnResult(SseParser::parse($response->body));
    }

    /** @throws HubError When the status is not a success. */
    private function guardStatus(int $status): void
    {
        if ($status >= 200 && $status < 300) {
            return;
        }
        throw match ($status) {
            403 => HubError::blocked(),
            429 => HubError::overQuota(),
            default => HubError::server($status),
        };
    }

    private function buildBody(string $message, bool $isFirstTurn): string
    {
        $payload = [
            'subject_id' => $this->config->consumer->subjectId(),
            'message'    => $message,
        ];
        if ($isFirstTurn) {
            $metadata = $this->config->consumer->metadata();
            if ($metadata !== null) {
                $payload['metadata'] = $metadata;
            }
            $clientVersion = $this->config->consumer->clientVersion();
            if ($clientVersion !== null) {
                $payload['client_version'] = $clientVersion;
            }
        }
        return (string) \json_encode($payload);
    }
}
```

Note: the first-turn body includes `metadata`/`client_version` only when the `Consumer` returns non-null. Adjust the T7 first-turn test's `FakeConsumer` to supply both (it does).

- [ ] **Step 5: Run — passes.**
- [ ] **Step 6: Gate + commit.**

```bash
composer cs && composer stan && composer test
git add src/HubClient.php tests/HubClientTest.php tests/Support/FakeTransport.php
git commit -m "feat(hub): add HubClient (buffered turn, first-turn context, error mapping)"
```

---

### Task 8: `Session`

**Files:**
- Create: `src/Session.php`
- Create: `tests/SessionTest.php`

**Interfaces:**
- Produces: `Session::__construct(int $userId)`; `chatId(): string` (mints + persists a UUID if absent); `isPrimed(): bool`; `markPrimed(): void`; `reset(): void`. User-meta keys: `roundtable_chat_id`, `roundtable_chat_primed`.

- [ ] **Step 1: Write the failing test** `tests/SessionTest.php` (Brain Monkey):

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Session;

final class SessionTest extends TestCase
{
    public function test_chat_id_mints_and_persists_when_absent(): void
    {
        Functions\when('get_user_meta')->justReturn('');
        Functions\when('wp_generate_uuid4')->justReturn('uuid-123');
        Functions\expect('update_user_meta')->once()->with(7, 'roundtable_chat_id', 'uuid-123');

        self::assertSame('uuid-123', (new Session(7))->chatId());
    }

    public function test_chat_id_returns_existing_without_reminting(): void
    {
        Functions\when('get_user_meta')->justReturn('existing-uuid');
        Functions\expect('update_user_meta')->never();

        self::assertSame('existing-uuid', (new Session(7))->chatId());
    }

    public function test_is_primed_reflects_the_flag(): void
    {
        Functions\when('get_user_meta')->justReturn('1');
        self::assertTrue((new Session(7))->isPrimed());
    }

    public function test_mark_primed_sets_the_flag(): void
    {
        Functions\expect('update_user_meta')->once()->with(7, 'roundtable_chat_primed', '1');
        (new Session(7))->markPrimed();
    }

    public function test_reset_clears_id_and_flag(): void
    {
        Functions\expect('delete_user_meta')->once()->with(7, 'roundtable_chat_id');
        Functions\expect('delete_user_meta')->once()->with(7, 'roundtable_chat_primed');
        (new Session(7))->reset();
    }
}
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Create `src/Session.php`:**

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

/**
 * Per-user chat session state, stored in WordPress user meta.
 *
 * Holds the `chat_id` that ties follow-up turns to the same hub session, and a "primed"
 * flag so the health-report `metadata` + `client_version` ride only the first turn.
 */
final class Session
{
    private const META_CHAT_ID = 'roundtable_chat_id';
    private const META_PRIMED = 'roundtable_chat_primed';

    public function __construct(private int $userId) {}

    /**
     * The current chat id, minting and persisting a fresh UUID on first use.
     *
     * @return string The chat/session id.
     */
    public function chatId(): string
    {
        $existing = (string) \get_user_meta($this->userId, self::META_CHAT_ID, true);
        if ($existing !== '') {
            return $existing;
        }
        $chatId = \wp_generate_uuid4();
        \update_user_meta($this->userId, self::META_CHAT_ID, $chatId);
        return $chatId;
    }

    /**
     * Whether the first turn has completed (so context has already been sent).
     *
     * @return bool True once primed.
     */
    public function isPrimed(): bool
    {
        return (string) \get_user_meta($this->userId, self::META_PRIMED, true) === '1';
    }

    /** Mark the session primed after a successful first turn. */
    public function markPrimed(): void
    {
        \update_user_meta($this->userId, self::META_PRIMED, '1');
    }

    /** Clear the session — the next turn starts a fresh chat and re-sends context. */
    public function reset(): void
    {
        \delete_user_meta($this->userId, self::META_CHAT_ID);
        \delete_user_meta($this->userId, self::META_PRIMED);
    }
}
```

- [ ] **Step 4: Run — passes.**
- [ ] **Step 5: Gate + commit.**

```bash
composer cs && composer stan && composer test
git add src/Session.php tests/SessionTest.php
git commit -m "feat(session): add per-user chat_id + primed session state"
```

---

### Task 9: `MessageController` (REST proxy)

**Files:**
- Create: `src/MessageController.php`
- Create: `tests/MessageControllerTest.php`

**Interfaces:**
- Consumes: `Config` (T2), `HubClient` (T7), `Session` (T8), `HubError` (T3), `TurnResult`/`Event` (T4).
- Produces: `MessageController::__construct(Config $config, HubClient $hubClient)`; `register(): void`; `permission(): bool`; `handle(\WP_REST_Request $request): \WP_REST_Response`. Route: `POST /roundtable/v1/message`.

- [ ] **Step 1: Write the failing test** `tests/MessageControllerTest.php` (Brain Monkey + fakes). Cover: unlicensed → no hub call; a licensed turn → JSON with events; the first turn marks primed. Use a `FakeHubClient` recording `postMessage` and a `WP_REST_Request`/`WP_REST_Response` double.

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\MessageController;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;

final class MessageControllerTest extends TestCase
{
    public function test_permission_denies_when_consumer_disallows(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);
        Functions\when('wp_get_current_user')->justReturn((object) ['ID' => 5]);

        $controller = new MessageController(
            new Config('pk', new FakeConsumer(allowed: false)),
            // A HubClient that would fail the test if called; not reached.
            $this->neverCalledHubClient(),
        );

        // permission() reads the nonce from the request header via a helper; here we assert
        // the licence gate: with an invalid licence, permission() returns false.
        self::assertFalse($controller->permission($this->request(['message' => 'hi'])));
    }

    // ... additional tests: valid licence + nonce -> handle() returns a WP_REST_Response whose
    // data has an `events` array; first turn calls Session::markPrimed(); a HubError becomes a
    // structured error response with the `kind`. (Implementer completes using the same doubles.)
}
```

The implementer builds the minimal `WP_REST_Request`/`WP_REST_Response` doubles (or Mockery mocks) and a `FakeHubClient` returning a canned `TurnResult`. Assertions to implement:
1. `permission()` returns false when the nonce is invalid, the capability is missing, **or** `Consumer::isUserAllowed()` is false — and in the false cases `HubClient::postMessage` is never called.
2. `handle()` on a valid request returns a `WP_REST_Response` whose payload is `['events' => [...]]` mirroring the `TurnResult` events (each as `['type' => ..., 'data' => ...]`).
3. On the first turn (`Session::isPrimed()` false) `handle()` passes `isFirstTurn: true` to `postMessage` and calls `Session::markPrimed()` afterward; on a later turn it passes `false` and does not re-mark.
4. A `HubError` thrown by `postMessage` is caught and returned as a structured error payload `['error' => ['kind' => $e->kind()]]` with the appropriate status; the key never appears.

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Create `src/MessageController.php`:**

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

/**
 * The nonce-, capability- and licence-gated REST proxy the (later) chat UI calls.
 *
 * Registers `POST /roundtable/v1/message`. Its permission callback enforces the three
 * gates before any hub call; `handle` resolves the user's session, runs one turn through
 * {@see HubClient}, and returns the events as JSON (or a structured error).
 */
final class MessageController
{
    public const ROUTE_NAMESPACE = 'roundtable/v1';
    public const ROUTE = '/message';

    public function __construct(
        private Config $config,
        private HubClient $hubClient,
    ) {}

    /** Register the REST route. Call on the `rest_api_init` action. */
    public function register(): void
    {
        \register_rest_route(self::ROUTE_NAMESPACE, self::ROUTE, [
            'methods'             => 'POST',
            'callback'            => [$this, 'handle'],
            'permission_callback' => [$this, 'permission'],
        ]);
    }

    /**
     * Gate a request: valid REST nonce, the required capability, and a valid licence.
     *
     * @param \WP_REST_Request<array<string, mixed>> $request The incoming request.
     *
     * @return bool True to proceed; false to refuse (403) before any hub call.
     */
    public function permission(\WP_REST_Request $request): bool
    {
        $nonce = (string) $request->get_header('X-WP-Nonce');
        if (\wp_verify_nonce($nonce, 'wp_rest') === false) {
            return false;
        }
        if (!\current_user_can('read')) {
            return false;
        }
        return $this->config->consumer->isUserAllowed();
    }

    /**
     * Run one chat turn and return its events.
     *
     * @param \WP_REST_Request<array<string, mixed>> $request The incoming request.
     *
     * @return \WP_REST_Response The events payload, or a structured error.
     */
    public function handle(\WP_REST_Request $request): \WP_REST_Response
    {
        $message = (string) $request->get_param('message');
        $session = new Session((int) \wp_get_current_user()->ID);

        try {
            $isFirstTurn = !$session->isPrimed();
            $result      = $this->hubClient->postMessage($session->chatId(), $message, $isFirstTurn);
            if ($isFirstTurn) {
                $session->markPrimed();
            }
        } catch (HubError $e) {
            return new \WP_REST_Response(['error' => ['kind' => $e->kind()]], $this->statusFor($e));
        }

        return new \WP_REST_Response(['events' => $this->serialize($result)], 200);
    }

    /**
     * @return list<array{type: string, data: array<string, mixed>}>
     */
    private function serialize(TurnResult $result): array
    {
        return \array_map(
            static fn (Event $e): array => ['type' => $e->type, 'data' => $e->data],
            $result->events,
        );
    }

    private function statusFor(HubError $error): int
    {
        return match ($error->kind()) {
            HubError::BLOCKED => 403,
            HubError::OVER_QUOTA => 429,
            default => 502,
        };
    }
}
```

- [ ] **Step 4: Run — passes.**
- [ ] **Step 5: Gate + commit.**

```bash
composer cs && composer stan && composer test
git add src/MessageController.php tests/MessageControllerTest.php
git commit -m "feat(api): add nonce/cap/licence-gated REST message proxy"
```

---

### Task 10: `Roundtable` mount + wiring

**Files:**
- Create: `src/Roundtable.php`
- Create: `tests/RoundtableTest.php`
- Modify: `README.md` (add a "Bootstrapping the SDK" usage snippet)

**Interfaces:**
- Consumes: everything above.
- Produces: `Roundtable::mount(Config $config, string $menuSlug): void` — the single entry point; wires the REST route on `rest_api_init` and enqueues placeholder assets on the given admin screen.

- [ ] **Step 1: Write the failing test** `tests/RoundtableTest.php` (Brain Monkey asserts the hooks are added):

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Roundtable;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;

final class RoundtableTest extends TestCase
{
    public function test_mount_registers_the_rest_route_hook(): void
    {
        Functions\expect('add_action')->once()->with('rest_api_init', \Mockery::type('callable'));

        Roundtable::mount(new Config('pk', new FakeConsumer()), 'my-plugin-discussions');
    }
}
```

- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Create `src/Roundtable.php`:**

```php
<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

use EpicWP\Roundtable\Http\WpHttpTransport;

/**
 * The SDK's single entry point.
 *
 * A consuming plugin calls {@see Roundtable::mount()} once with its {@see Config} and the
 * admin menu slug the discussions screen lives under. This wires the REST proxy; the
 * visual chat UI (page render + assets) is a later SDK phase.
 */
final class Roundtable
{
    /**
     * Bootstrap the SDK.
     *
     * @param Config $config   The SDK configuration.
     * @param string $menuSlug The admin page slug the discussions UI mounts on (used by the
     *                         later UI phase to enqueue assets on the right screen).
     */
    public static function mount(Config $config, string $menuSlug): void
    {
        unset($menuSlug); // Reserved for the UI phase (asset enqueue on this screen).
        $controller = new MessageController($config, new HubClient($config, new WpHttpTransport()));
        \add_action('rest_api_init', [$controller, 'register']);
    }
}
```

- [ ] **Step 4: Run — passes.**
- [ ] **Step 5: Document usage in `README.md`** — a "Bootstrapping" section:

````markdown
## Bootstrapping (consumer)

```php
use EpicWP\Roundtable\Roundtable;
use EpicWP\Roundtable\Config;

Roundtable::mount(
    new Config(
        projectApiKey: 'pk_...',   // your project key
        consumer:      $myConsumer, // implements EpicWP\Roundtable\Consumer
    ),
    'my-plugin-discussions',        // your admin page slug
);
```
````

- [ ] **Step 6: Gate + commit.**

```bash
composer cs && composer stan && composer test
git add src/Roundtable.php tests/RoundtableTest.php README.md
git commit -m "feat(sdk): add Roundtable::mount entry point + usage docs"
```

---

### Task 11: Remove the smoke test + finalise

**Files:**
- Delete: `tests/SmokeTest.php`

- [ ] **Step 1: Delete the throwaway smoke test** (real tests now cover the suite).
- [ ] **Step 2: Full gate green.** Run `composer cs && composer stan && composer test` — all pass, no smoke test.
- [ ] **Step 3: Commit.**

```bash
git rm tests/SmokeTest.php
git commit -m "chore(test): drop the scaffolding smoke test"
```

---

## Notes for the executor

- **Every task's gate is `composer cs && composer stan && composer test`** — all three green before commit. Full docblocks on public API are part of PHPCS (Oblak) passing.
- Pure units (`Config`, `HubError`, `Event`, `TurnResult`, `SseParser`, `HubClient`) extend `PHPUnit\Framework\TestCase` and use fakes — no WordPress. WP-coupled units (`WpHttpTransport`, `Session`, `MessageController`, `Roundtable`) extend `EpicWP\Roundtable\Tests\TestCase` and mock WP functions with Brain Monkey.
- The project key must never appear in an error or response — asserted in T7.
- `HubClient::HUB_URL` is a placeholder production domain; confirm/replace with the real hub URL at deploy (tracked separately — not a code change this milestone needs beyond the constant).
