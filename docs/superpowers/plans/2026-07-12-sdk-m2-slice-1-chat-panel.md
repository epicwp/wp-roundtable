# SDK-M2 Slice 1 — Chat Panel MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the already-working SDK-M1 chat backend visible: a persistent "Sage" chat panel on a WP-admin "Community" page the host plugin mounts, rendering a buffered turn's typed events (markdown + fenced code, XSS-safe), with "+ New topic" starting a fresh chat.

**Architecture:** PHP adds an admin page (`Admin\Page`) + a shared REST gate (`Rest\Gate`) + a reset route (`SessionController`), all wired by `Roundtable::mount()`; the page renders one root `<div id="roundtable-app">` and enqueues a single self-contained bundle. The front-end is a Preact app built by esbuild into committed `assets/dist/` files; it calls the existing nonce-gated proxy `POST /roundtable/v1/message` and the new `POST /roundtable/v1/reset`, and renders the response `events`.

**Tech Stack:** PHP 8.1 (PSR-4 `EpicWP\Roundtable\`, PHPCS Oblak, PHPStan L6, PHPUnit 9.6 + Brain Monkey). Front-end: Preact + markdown-it (`html:false`) + highlight.js core, bundled by esbuild; JS unit tests via node's built-in `node:test` + `preact-render-to-string`.

## Global Constraints

- **No runtime composer (PHP) dependencies.** JS build deps are fine — they are bundled into the committed `assets/dist/` bundle; consumers never run npm.
- **camelCase public PHP API** (PSR-1); phpcs already overrides the WP snake_case sniffs. Keep methods/properties camelCase.
- **REST contract is fixed:** `POST /roundtable/v1/message` body `{ "message": string }`, header `X-WP-Nonce`; success `200 {"events":[{"type":string,"data":object}]}`; error `{"error":{"kind":string}}` with status 403 (BLOCKED) / 429 (OVER_QUOTA) / 502 (default). Do not change it.
- **Event types** (mirror `src/Event.php`): `assistant_text` (`data.text`), `thinking`, `tool_step`, `tool_result`, `progress`, `result`, `error`.
- **Markdown is rendered XSS-safe:** markdown-it constructed with `html:false` (raw HTML in input is escaped, not emitted) and default link validation (blocks `javascript:`). Never use `innerHTML` with unsanitized input anywhere else.
- **User-facing PHP strings** use `__( '…', 'wp-roundtable' )` (phpcs `WordPress.WP.I18n`, text domain `wp-roundtable`).
- **Gate stays fail-closed:** every REST route requires a valid `wp_rest` nonce AND the `read` capability AND `Consumer::isUserAllowed()`.
- **PHP gate (must pass):** `composer cs` (PHPCS Oblak) + `composer stan` (PHPStan L6) + `composer test` (PHPUnit). **JS gate:** `npm run build` succeeds and emits `assets/dist/roundtable.js` + `assets/dist/roundtable.css`; `npm test` passes.
- **Milestone:** GitHub `epicwp/wp-roundtable` milestone "SDK-M2: Community UI" (issues #5–#8, #11 for this slice).
- **Live verification target:** the local DDEV harness (`rt-harness.ddev.site`) + local hub on `:8799` (memory `roundtable-local-dev-harness`). The harness copies `assets/dist/` into its vendor on `composer install` (path repo, `symlink:false`).

---

## File Structure

**PHP (in `src/`):**
- `src/Rest/Gate.php` — NEW. `static permits(Config, \WP_REST_Request): bool` — the shared nonce+cap+licence gate.
- `src/SessionController.php` — NEW. Registers `POST /roundtable/v1/reset`; `handle()` resets the current user's `Session`.
- `src/Admin/Page.php` — NEW. Registers the "Community" submenu under the host `$menuSlug`, enqueues the bundle + localizes config, renders the root container. Resolves its own asset URL from `__DIR__`.
- `src/MessageController.php` — MODIFY. `permission()` delegates to `Rest\Gate::permits()`.
- `src/Roundtable.php` — MODIFY. `mount()` wires `Admin\Page` (admin_menu + admin_enqueue_scripts) plus `MessageController` and `SessionController` (rest_api_init).

**Front-end (in `assets/`):**
- `assets/package.json`, `assets/esbuild.mjs`, `assets/.gitignore` — build tooling.
- `assets/src/markdown.js` — `renderMarkdown(md): string` (safe HTML).
- `assets/src/events.js` — `eventsToTurn(events): {reply, steps, outcome, error}`.
- `assets/src/api.js` — `sendMessage(text)`, `resetChat()` over the REST proxy.
- `assets/src/components.jsx` — Preact `ChatPanel`, `Thread`, `Composer`.
- `assets/src/index.js` — mounts `ChatPanel` into `#roundtable-app`; imports `styles.css`.
- `assets/src/styles.css` — chat panel styles (from the mockups).
- `assets/dist/roundtable.js` + `assets/dist/roundtable.css` — BUILT, COMMITTED.
- `assets/test/markdown.test.mjs`, `assets/test/events.test.mjs`, `assets/test/components.test.mjs` — `node:test`.

**Tests (PHP, in `tests/`):** `tests/Rest/GateTest.php`, `tests/SessionControllerTest.php`, `tests/Admin/PageTest.php`, `tests/RoundtableMountTest.php`.

**CI:** `.github/workflows/ci.yml` — MODIFY to add a Node build+test job.

---

## Task 1: `Rest\Gate` shared permission + refactor `MessageController`

**Files:**
- Create: `src/Rest/Gate.php`
- Modify: `src/MessageController.php` (permission body)
- Test: `tests/Rest/GateTest.php`

**Interfaces:**
- Produces: `EpicWP\Roundtable\Rest\Gate::permits(Config $config, \WP_REST_Request $request): bool`

- [ ] **Step 1: Write the failing test**

```php
<?php // tests/Rest/GateTest.php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Rest;

use Brain\Monkey;
use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Consumer;
use EpicWP\Roundtable\Rest\Gate;
use PHPUnit\Framework\TestCase;

final class GateTest extends TestCase {
    protected function setUp(): void { parent::setUp(); Monkey\setUp(); }
    protected function tearDown(): void { Monkey\tearDown(); parent::tearDown(); }

    private function config( bool $allowed ): Config {
        $consumer = new class( $allowed ) implements Consumer {
            public function __construct( private bool $allowed ) {}
            public function isUserAllowed(): bool { return $this->allowed; }
            public function subjectId(): string { return 's'; }
            public function metadata(): ?string { return null; }
            public function clientVersion(): ?string { return null; }
        };
        return new Config( 'pk_secret', $consumer );
    }

    private function request( string $nonce ): \WP_REST_Request {
        $req = \Mockery::mock( \WP_REST_Request::class );
        $req->allows( 'get_header' )->with( 'X-WP-Nonce' )->andReturn( $nonce );
        return $req;
    }

    public function test_passes_when_nonce_cap_and_licence_all_valid(): void {
        Functions\when( 'wp_verify_nonce' )->justReturn( 1 );
        Functions\when( 'current_user_can' )->justReturn( true );
        self::assertTrue( Gate::permits( $this->config( true ), $this->request( 'good' ) ) );
    }

    public function test_fails_on_bad_nonce(): void {
        Functions\when( 'wp_verify_nonce' )->justReturn( false );
        Functions\when( 'current_user_can' )->justReturn( true );
        self::assertFalse( Gate::permits( $this->config( true ), $this->request( 'bad' ) ) );
    }

    public function test_fails_without_read_capability(): void {
        Functions\when( 'wp_verify_nonce' )->justReturn( 1 );
        Functions\when( 'current_user_can' )->justReturn( false );
        self::assertFalse( Gate::permits( $this->config( true ), $this->request( 'good' ) ) );
    }

    public function test_fails_when_consumer_disallows(): void {
        Functions\when( 'wp_verify_nonce' )->justReturn( 1 );
        Functions\when( 'current_user_can' )->justReturn( true );
        self::assertFalse( Gate::permits( $this->config( false ), $this->request( 'good' ) ) );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `composer test -- --filter GateTest`
Expected: FAIL — `Error: Class "EpicWP\Roundtable\Rest\Gate" not found`.

- [ ] **Step 3: Write minimal implementation**

```php
<?php // src/Rest/Gate.php
declare(strict_types=1);

namespace EpicWP\Roundtable\Rest;

use EpicWP\Roundtable\Config;

/** The shared REST permission gate: valid nonce, the `read` capability, and a valid licence. */
final class Gate {
    /**
     * Whether the request may proceed to a hub call.
     *
     * @param Config                                 $config  The SDK configuration (licence gate on `$config->consumer`).
     * @param \WP_REST_Request<array<string, mixed>> $request The incoming request.
     *
     * @return bool True to proceed; false to refuse (403) before any hub call.
     */
    public static function permits( // phpcs:ignore Squiz.Commenting.FunctionComment.IncorrectTypeHint -- `\WP_REST_Request<array<string, mixed>>` is a PHPStan generic; the native param type stays `\WP_REST_Request`.
        Config $config,
        \WP_REST_Request $request,
    ): bool {
        $nonce = (string) $request->get_header( 'X-WP-Nonce' );
        if ( false === \wp_verify_nonce( $nonce, 'wp_rest' ) ) {
            return false;
        }
        if ( ! \current_user_can( 'read' ) ) {
            return false;
        }
        return $config->consumer->isUserAllowed();
    }
}
```

- [ ] **Step 4: Refactor `MessageController::permission()` to delegate**

Replace the body of `MessageController::permission()` (the nonce/cap/licence block) with a single delegation, and remove the now-unused inline logic:

```php
    public function permission( // phpcs:ignore Squiz.Commenting.FunctionComment.IncorrectTypeHint -- `\WP_REST_Request<array<string, mixed>>` is a PHPStan generic; the native param type stays `\WP_REST_Request`.
        \WP_REST_Request $request,
    ): bool {
        return \EpicWP\Roundtable\Rest\Gate::permits( $this->config, $request );
    }
```

- [ ] **Step 5: Run tests to verify pass (Gate + existing MessageController)**

Run: `composer test -- --filter 'GateTest|MessageControllerTest'`
Expected: PASS (all green).

- [ ] **Step 6: Run the full gate**

Run: `composer cs && composer stan && composer test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/Rest/Gate.php src/MessageController.php tests/Rest/GateTest.php
git commit -m "refactor(rest): extract shared nonce+cap+licence Gate (SDK-M2 #7)"
```

---

## Task 2: `SessionController` — `POST /roundtable/v1/reset`

**Files:**
- Create: `src/SessionController.php`
- Test: `tests/SessionControllerTest.php`

**Interfaces:**
- Consumes: `Rest\Gate::permits(Config, \WP_REST_Request): bool`; `Session::reset(): void`.
- Produces: `SessionController::__construct(Config $config)`; `register(): void` (route `POST roundtable/v1/reset`); `handle(\WP_REST_Request): \WP_REST_Response` (200 `{ "ok": true }`); `permission(\WP_REST_Request): bool`.

- [ ] **Step 1: Write the failing test**

```php
<?php // tests/SessionControllerTest.php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey;
use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Consumer;
use EpicWP\Roundtable\SessionController;
use PHPUnit\Framework\TestCase;

final class SessionControllerTest extends TestCase {
    protected function setUp(): void { parent::setUp(); Monkey\setUp(); }
    protected function tearDown(): void { Monkey\tearDown(); parent::tearDown(); }

    private function controller(): SessionController {
        $consumer = new class implements Consumer {
            public function isUserAllowed(): bool { return true; }
            public function subjectId(): string { return 's'; }
            public function metadata(): ?string { return null; }
            public function clientVersion(): ?string { return null; }
        };
        return new SessionController( new Config( 'pk_secret', $consumer ) );
    }

    public function test_register_adds_the_reset_route(): void {
        Functions\expect( 'register_rest_route' )->once()->with(
            'roundtable/v1',
            '/reset',
            \Mockery::on( static fn( $args ) => 'POST' === $args['methods'] ),
        );
        $this->controller()->register();
    }

    public function test_handle_resets_the_current_users_session_and_returns_ok(): void {
        $user = (object) array( 'ID' => 7 );
        Functions\when( 'wp_get_current_user' )->justReturn( $user );
        Functions\expect( 'delete_user_meta' )->twice(); // chat_id + primed
        $response = $this->controller()->handle( \Mockery::mock( \WP_REST_Request::class ) );
        self::assertSame( 200, $response->get_status() );
        self::assertSame( array( 'ok' => true ), $response->get_data() );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `composer test -- --filter SessionControllerTest`
Expected: FAIL — `Class "EpicWP\Roundtable\SessionController" not found`.

- [ ] **Step 3: Write minimal implementation**

```php
<?php // src/SessionController.php
declare(strict_types=1);

namespace EpicWP\Roundtable;

use EpicWP\Roundtable\Rest\Gate;

/** REST route that starts a fresh chat: `POST /roundtable/v1/reset` clears the user's session. */
final class SessionController {
    /** The REST route namespace. */
    public const ROUTE_NAMESPACE = 'roundtable/v1';
    /** The REST route path (under the namespace). */
    public const ROUTE = '/reset';

    /**
     * Creates the controller.
     *
     * @param Config $config The SDK configuration (licence gate lives on `$config->consumer`).
     */
    public function __construct( private Config $config ) {
    }

    /** Register the REST route. Call on the `rest_api_init` action. */
    public function register(): void {
        \register_rest_route(
            self::ROUTE_NAMESPACE,
            self::ROUTE,
            array(
                'callback'            => array( $this, 'handle' ),
                'methods'             => 'POST',
                'permission_callback' => array( $this, 'permission' ),
            ),
        );
    }

    /**
     * Gate the request with the shared nonce+cap+licence gate.
     *
     * @param \WP_REST_Request<array<string, mixed>> $request The incoming request.
     *
     * @return bool True to proceed; false to refuse (403).
     */
    public function permission( // phpcs:ignore Squiz.Commenting.FunctionComment.IncorrectTypeHint -- `\WP_REST_Request<array<string, mixed>>` is a PHPStan generic; the native param type stays `\WP_REST_Request`.
        \WP_REST_Request $request,
    ): bool {
        return Gate::permits( $this->config, $request );
    }

    /**
     * Reset the current user's chat session.
     *
     * @param \WP_REST_Request<array<string, mixed>> $request The incoming request (unused).
     *
     * @return \WP_REST_Response A `{ "ok": true }` acknowledgement.
     */
    public function handle( // phpcs:ignore Squiz.Commenting.FunctionComment.IncorrectTypeHint -- `\WP_REST_Request<array<string, mixed>>` is a PHPStan generic; the native param type stays `\WP_REST_Request`.
        \WP_REST_Request $request,
    ): \WP_REST_Response {
        unset( $request );
        ( new Session( (int) \wp_get_current_user()->ID ) )->reset();
        return new \WP_REST_Response( array( 'ok' => true ), 200 );
    }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `composer test -- --filter SessionControllerTest`
Expected: PASS.

- [ ] **Step 5: Run the full gate**

Run: `composer cs && composer stan && composer test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/SessionController.php tests/SessionControllerTest.php
git commit -m "feat(rest): add POST /roundtable/v1/reset new-conversation route (SDK-M2 #8)"
```

---

## Task 3: `Admin\Page` — submenu, asset enqueue, root container

**Files:**
- Create: `src/Admin/Page.php`
- Test: `tests/Admin/PageTest.php`

**Interfaces:**
- Consumes: `Config` (reads `$config->agentName`).
- Produces: `Admin\Page::__construct(Config $config, string $menuSlug)`; constants `PAGE_SLUG='roundtable-community'`, `HANDLE='roundtable'`; `registerMenu(): void`; `enqueue(string $hookSuffix): void`; `render(): void`.

**Notes:** `enqueue()` must only load on our page — WordPress calls `admin_enqueue_scripts` with a `$hookSuffix`; a submenu page's hook suffix ends with `_page_roundtable-community`. Asset URLs are resolved from `__DIR__` (`src/Admin`) up to the package root, then mapped to a URL via `content_url()` relative to `WP_CONTENT_DIR`.

- [ ] **Step 1: Write the failing test**

```php
<?php // tests/Admin/PageTest.php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Admin;

use Brain\Monkey;
use Brain\Monkey\Functions;
use EpicWP\Roundtable\Admin\Page;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Consumer;
use PHPUnit\Framework\TestCase;

final class PageTest extends TestCase {
    protected function setUp(): void { parent::setUp(); Monkey\setUp(); }
    protected function tearDown(): void { Monkey\tearDown(); parent::tearDown(); }

    private function page(): Page {
        $consumer = new class implements Consumer {
            public function isUserAllowed(): bool { return true; }
            public function subjectId(): string { return 's'; }
            public function metadata(): ?string { return null; }
            public function clientVersion(): ?string { return null; }
        };
        return new Page( new Config( 'pk_secret', $consumer, 'Sage' ), 'tools.php' );
    }

    public function test_register_menu_adds_a_community_submenu(): void {
        Functions\when( '__' )->returnArg();
        Functions\expect( 'add_submenu_page' )->once()->with(
            'tools.php', 'Community', 'Community', 'read', 'roundtable-community', \Mockery::type( 'array' ),
        );
        $this->page()->registerMenu();
    }

    public function test_enqueue_skips_other_screens(): void {
        Functions\expect( 'wp_enqueue_script' )->never();
        $this->page()->enqueue( 'edit.php' );
    }

    public function test_enqueue_loads_bundle_and_localizes_config_on_our_screen(): void {
        Functions\when( 'wp_enqueue_style' )->justReturn( true );
        Functions\when( 'rest_url' )->justReturn( 'http://x/wp-json/roundtable/v1' );
        Functions\when( 'wp_create_nonce' )->justReturn( 'nonce123' );
        Functions\expect( 'wp_enqueue_script' )->once();
        Functions\expect( 'wp_localize_script' )->once()->with(
            'roundtable',
            'RoundtableConfig',
            \Mockery::on( static fn( $d ) => 'nonce123' === $d['nonce'] && 'Sage' === $d['agentName'] ),
        );
        $this->page()->enqueue( 'tools_page_roundtable-community' );
    }

    public function test_render_outputs_the_app_container(): void {
        Functions\when( 'esc_html__' )->returnArg();
        \ob_start();
        $this->page()->render();
        $html = (string) \ob_get_clean();
        self::assertStringContainsString( 'id="roundtable-app"', $html );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `composer test -- --filter PageTest`
Expected: FAIL — `Class "EpicWP\Roundtable\Admin\Page" not found`.

- [ ] **Step 3: Write minimal implementation**

```php
<?php // src/Admin/Page.php
declare(strict_types=1);

namespace EpicWP\Roundtable\Admin;

use EpicWP\Roundtable\Config;

/** The "Community" admin page: registers the submenu, enqueues the bundle, renders the root container. */
final class Page {
    /** The admin page slug. */
    public const PAGE_SLUG = 'roundtable-community';
    /** The shared script/style handle. */
    public const HANDLE = 'roundtable';

    /**
     * Creates the page.
     *
     * @param Config $config   The SDK configuration.
     * @param string $menuSlug The parent menu slug the host already registered (submenu parent).
     */
    public function __construct(
        private Config $config,
        private string $menuSlug,
    ) {
    }

    /** Register the "Community" submenu. Call on the `admin_menu` action. */
    public function registerMenu(): void {
        \add_submenu_page(
            $this->menuSlug,
            \__( 'Community', 'wp-roundtable' ),
            \__( 'Community', 'wp-roundtable' ),
            'read',
            self::PAGE_SLUG,
            array( $this, 'render' ),
        );
    }

    /**
     * Enqueue the bundle + localize config, only on our page.
     *
     * @param string $hookSuffix The current admin screen's hook suffix.
     */
    public function enqueue( string $hookSuffix ): void {
        if ( ! \str_ends_with( $hookSuffix, '_page_' . self::PAGE_SLUG ) ) {
            return;
        }
        \wp_enqueue_style( self::HANDLE, $this->assetUrl( 'roundtable.css' ), array(), $this->version() );
        \wp_enqueue_script( self::HANDLE, $this->assetUrl( 'roundtable.js' ), array(), $this->version(), true );
        \wp_localize_script(
            self::HANDLE,
            'RoundtableConfig',
            array(
                'restUrl'   => \rest_url( 'roundtable/v1' ),
                'nonce'     => \wp_create_nonce( 'wp_rest' ),
                'agentName' => $this->config->agentName,
            ),
        );
    }

    /** Render the admin page: a wrapper and the Preact root container. */
    public function render(): void {
        echo '<div class="wrap"><div id="roundtable-app" data-loading="'
            . \esc_attr__( 'Loading…', 'wp-roundtable' ) . '"></div></div>';
    }

    /**
     * Resolve a built asset's URL from this file's location.
     *
     * @param string $file The dist filename (e.g. `roundtable.js`).
     *
     * @return string The public URL, or an empty string if it cannot be resolved.
     */
    private function assetUrl( string $file ): string {
        $path = \dirname( __DIR__, 2 ) . '/assets/dist/' . $file; // package-root/assets/dist/<file>
        if ( \defined( 'WP_CONTENT_DIR' ) && \str_starts_with( $path, (string) \WP_CONTENT_DIR ) ) {
            return \content_url( \substr( $path, \strlen( (string) \WP_CONTENT_DIR ) ) );
        }
        return \plugins_url( 'assets/dist/' . $file, \dirname( __DIR__, 1 ) );
    }

    /**
     * A cache-busting version derived from the built file's mtime.
     *
     * @return string The version string (falls back to `'1'`).
     */
    private function version(): string {
        $js = \dirname( __DIR__, 2 ) . '/assets/dist/roundtable.js';
        $mtime = \is_file( $js ) ? (string) \filemtime( $js ) : '';
        return '' !== $mtime ? $mtime : '1';
    }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `composer test -- --filter PageTest`
Expected: PASS.

- [ ] **Step 5: Run the full gate**

Run: `composer cs && composer stan && composer test`
Expected: PASS. (If PHPStan flags `content_url`/`plugins_url`/`add_submenu_page` as undefined, they are covered by `php-stubs/wordpress-stubs`; ensure `phpstan-wordpress` is active — it already is via `extension-installer`.)

- [ ] **Step 6: Commit**

```bash
git add src/Admin/Page.php tests/Admin/PageTest.php
git commit -m "feat(admin): add Community admin Page (submenu + asset enqueue + root container) (SDK-M2 #5)"
```

---

## Task 4: Wire everything in `Roundtable::mount()`

**Files:**
- Modify: `src/Roundtable.php`
- Test: `tests/RoundtableMountTest.php`

**Interfaces:**
- Consumes: `Admin\Page`, `MessageController`, `SessionController`, `HubClient`, `WpHttpTransport`.
- Produces: `Roundtable::mount(Config $config, string $menuSlug): void` registers `admin_menu`, `admin_enqueue_scripts`, and `rest_api_init` actions.

- [ ] **Step 1: Write the failing test**

```php
<?php // tests/RoundtableMountTest.php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey;
use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Consumer;
use EpicWP\Roundtable\Roundtable;
use PHPUnit\Framework\TestCase;

final class RoundtableMountTest extends TestCase {
    protected function setUp(): void { parent::setUp(); Monkey\setUp(); }
    protected function tearDown(): void { Monkey\tearDown(); parent::tearDown(); }

    public function test_mount_registers_admin_and_rest_hooks(): void {
        $consumer = new class implements Consumer {
            public function isUserAllowed(): bool { return true; }
            public function subjectId(): string { return 's'; }
            public function metadata(): ?string { return null; }
            public function clientVersion(): ?string { return null; }
        };
        $added = array();
        Functions\when( 'add_action' )->alias(
            static function ( string $hook ) use ( &$added ): void { $added[] = $hook; },
        );
        Roundtable::mount( new Config( 'pk_secret', $consumer ), 'tools.php' );
        self::assertContains( 'admin_menu', $added );
        self::assertContains( 'admin_enqueue_scripts', $added );
        self::assertContains( 'rest_api_init', $added );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `composer test -- --filter RoundtableMountTest`
Expected: FAIL — only `rest_api_init` is registered today (missing `admin_menu`, `admin_enqueue_scripts`).

- [ ] **Step 3: Replace `Roundtable::mount()`**

```php
    public static function mount( Config $config, string $menuSlug ): void {
        $page = new Admin\Page( $config, $menuSlug );
        \add_action( 'admin_menu', array( $page, 'registerMenu' ) );
        \add_action( 'admin_enqueue_scripts', array( $page, 'enqueue' ) );

        $message = new MessageController( $config, new HubClient( $config, new WpHttpTransport() ) );
        $session = new SessionController( $config );
        \add_action( 'rest_api_init', array( $message, 'register' ) );
        \add_action( 'rest_api_init', array( $session, 'register' ) );
    }
```

Remove the now-obsolete `unset( $menuSlug );` line and the single-controller wiring.

- [ ] **Step 4: Run tests to verify pass**

Run: `composer test -- --filter RoundtableMountTest`
Expected: PASS.

- [ ] **Step 5: Run the full gate**

Run: `composer cs && composer stan && composer test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/Roundtable.php tests/RoundtableMountTest.php
git commit -m "feat(sdk): mount() wires admin page + message + reset routes (SDK-M2 #5)"
```

---

## Task 5: esbuild build pipeline + Preact "hello" bundle

**Files:**
- Create: `assets/package.json`, `assets/esbuild.mjs`, `assets/.gitignore`, `assets/src/index.js`, `assets/src/styles.css`
- Create (built, committed): `assets/dist/roundtable.js`, `assets/dist/roundtable.css`

**Interfaces:**
- Produces: `npm --prefix assets run build` → `assets/dist/roundtable.js` + `assets/dist/roundtable.css`. Global `window.RoundtableConfig` = `{ restUrl, nonce, agentName }` is the runtime input.

- [ ] **Step 1: Create `assets/.gitignore`**

```
node_modules/
```

(`assets/dist/` is intentionally NOT ignored — the built bundle is committed for composer consumers.)

- [ ] **Step 2: Create `assets/package.json`**

```json
{
  "name": "@epicwp/wp-roundtable-ui",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node esbuild.mjs",
    "test": "node --test test/"
  },
  "dependencies": {
    "highlight.js": "^11.9.0",
    "markdown-it": "^14.0.0",
    "preact": "^10.19.0"
  },
  "devDependencies": {
    "esbuild": "^0.20.0",
    "preact-render-to-string": "^6.3.0"
  }
}
```

- [ ] **Step 3: Create `assets/esbuild.mjs`**

```js
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  target: 'es2019',
  jsx: 'transform',
  jsxFactory: 'h',
  jsxFragment: 'Fragment',
  loader: { '.js': 'jsx' },
  outfile: 'dist/roundtable.js',
  minify: true,
  sourcemap: false,
});

console.log('built dist/roundtable.js + dist/roundtable.css');
```

- [ ] **Step 4: Create `assets/src/styles.css` (minimal chat styling; expanded in Task 8)**

```css
#roundtable-app { --rt-accent:#3858e9; --rt-line:#e5e7eb; --rt-ink:#1c2430; --rt-ink-soft:#54617a; font-size:14px; color:var(--rt-ink); }
#roundtable-app .rt-panel { max-width:760px; background:#fff; border:1px solid var(--rt-line); border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,.04); overflow:hidden; display:flex; flex-direction:column; }
```

- [ ] **Step 5: Create `assets/src/index.js` (temporary hello mount; replaced in Task 8)**

```js
import { h, render } from 'preact';
import './styles.css';

const root = document.getElementById('roundtable-app');
if (root) {
  render(h('div', { class: 'rt-panel', style: 'padding:20px' }, 'Roundtable UI loaded.'), root);
}
```

- [ ] **Step 6: Install and build**

Run:
```bash
cd assets && npm install && npm run build && ls dist
```
Expected: `dist/roundtable.js` and `dist/roundtable.css` exist.

- [ ] **Step 7: Commit (including the built bundle and lockfile)**

```bash
git add assets/.gitignore assets/package.json assets/package-lock.json assets/esbuild.mjs assets/src/index.js assets/src/styles.css assets/dist/roundtable.js assets/dist/roundtable.css
git commit -m "build(ui): add esbuild + Preact pipeline; commit built bundle (SDK-M2 #6)"
```

---

## Task 6: `markdown.js` — XSS-safe markdown renderer

**Files:**
- Create: `assets/src/markdown.js`
- Test: `assets/test/markdown.test.mjs`

**Interfaces:**
- Produces: `renderMarkdown(md: string): string` — safe HTML string (no raw HTML passthrough).

- [ ] **Step 1: Write the failing test**

```js
// assets/test/markdown.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../src/markdown.js';

test('renders basic markdown', () => {
  const html = renderMarkdown('**bold** and `code`');
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
});

test('escapes raw HTML in input (no live script)', () => {
  const html = renderMarkdown('<script>alert(1)</script>');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});

test('highlights fenced code', () => {
  const html = renderMarkdown('```js\nconst x = 1;\n```');
  assert.match(html, /<pre/);
  assert.match(html, /hljs/);
});

test('neutralizes javascript: links', () => {
  const html = renderMarkdown('[x](javascript:alert(1))');
  assert.doesNotMatch(html, /href="javascript:/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd assets && npm test`
Expected: FAIL — cannot import `../src/markdown.js` (missing).

- [ ] **Step 3: Write minimal implementation**

```js
// assets/src/markdown.js
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import php from 'highlight.js/lib/languages/php';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';

hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('js', javascript);
hljs.registerLanguage('php', php);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);
hljs.registerLanguage('css', css);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('xml', xml);

const md = new MarkdownIt({
  html: false, // raw HTML in input is escaped, never emitted
  linkify: true,
  breaks: false,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return '<pre class="rt-code"><code class="hljs">' +
          hljs.highlight(code, { language: lang }).value + '</code></pre>';
      } catch {
        /* fall through */
      }
    }
    return '<pre class="rt-code"><code class="hljs">' + md.utils.escapeHtml(code) + '</code></pre>';
  },
});

/**
 * Render markdown to an XSS-safe HTML string.
 * @param {string} src markdown source
 * @returns {string} sanitized HTML
 */
export function renderMarkdown(src) {
  return md.render(typeof src === 'string' ? src : '');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd assets && npm test`
Expected: PASS (markdown tests green).

- [ ] **Step 5: Commit**

```bash
git add assets/src/markdown.js assets/test/markdown.test.mjs
git commit -m "feat(ui): XSS-safe markdown renderer with fenced-code highlighting (SDK-M2 #11)"
```

---

## Task 7: `events.js` + `api.js` — response mapping + REST client

**Files:**
- Create: `assets/src/events.js`, `assets/src/api.js`
- Test: `assets/test/events.test.mjs`

**Interfaces:**
- Produces: `eventsToTurn(events: Array<{type,data}>): { reply: string, steps: Array<{type,data}>, outcome: object|null, error: boolean }`.
- Produces: `sendMessage(text: string): Promise<Result>`, `resetChat(): Promise<void>` where `Result = { events } | { error: { kind } }` — thin wrappers over `window.RoundtableConfig`.

- [ ] **Step 1: Write the failing test**

```js
// assets/test/events.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventsToTurn } from '../src/events.js';

test('concatenates assistant_text into reply', () => {
  const turn = eventsToTurn([
    { type: 'assistant_text', data: { text: 'Hello ' } },
    { type: 'assistant_text', data: { text: 'world' } },
    { type: 'result', data: { subtype: 'success' } },
  ]);
  assert.equal(turn.reply, 'Hello world');
  assert.equal(turn.error, false);
});

test('collects step events and outcome', () => {
  const turn = eventsToTurn([
    { type: 'thinking', data: { text: 'hmm' } },
    { type: 'tool_step', data: { name: 'read' } },
    { type: 'assistant_text', data: { text: 'done' } },
  ]);
  assert.equal(turn.steps.length, 2);
  assert.equal(turn.reply, 'done');
});

test('flags an error turn', () => {
  const turn = eventsToTurn([{ type: 'error', data: { message: 'boom' } }]);
  assert.equal(turn.error, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd assets && npm test`
Expected: FAIL — cannot import `../src/events.js`.

- [ ] **Step 3: Write `assets/src/events.js`**

```js
// assets/src/events.js
const STEP_TYPES = new Set(['thinking', 'tool_step', 'tool_result', 'progress']);

/**
 * Fold a turn's ordered events into a view model.
 * @param {Array<{type:string,data:Object}>} events
 * @returns {{reply:string, steps:Array, outcome:Object|null, error:boolean}}
 */
export function eventsToTurn(events) {
  const turn = { reply: '', steps: [], outcome: null, error: false };
  for (const ev of Array.isArray(events) ? events : []) {
    if (ev.type === 'assistant_text' && typeof ev.data?.text === 'string') turn.reply += ev.data.text;
    else if (ev.type === 'error') turn.error = true;
    else if (ev.type === 'result') turn.outcome = ev.data || null;
    else if (STEP_TYPES.has(ev.type)) turn.steps.push(ev);
  }
  return turn;
}
```

- [ ] **Step 4: Write `assets/src/api.js`**

```js
// assets/src/api.js
function cfg() {
  return window.RoundtableConfig || { restUrl: '', nonce: '' };
}

async function post(path, body) {
  const { restUrl, nonce } = cfg();
  const res = await fetch(restUrl.replace(/\/$/, '') + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': nonce },
    body: JSON.stringify(body || {}),
  });
  const json = await res.json().catch(() => ({ error: { kind: 'bad_response' } }));
  if (!res.ok && !json.error) return { error: { kind: 'http_' + res.status } };
  return json;
}

/**
 * Send one chat message.
 * @param {string} text
 * @returns {Promise<{events:Array}|{error:{kind:string}}>}
 */
export function sendMessage(text) {
  return post('/message', { message: text });
}

/** Start a fresh chat (clears server-side session). */
export function resetChat() {
  return post('/reset', {});
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd assets && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add assets/src/events.js assets/src/api.js assets/test/events.test.mjs
git commit -m "feat(ui): event→turn mapping + REST client (message/reset) (SDK-M2 #7)"
```

---

## Task 8: Preact chat panel — render events, send, "+ New topic"

**Files:**
- Create: `assets/src/components.jsx`
- Modify: `assets/src/index.js` (mount `ChatPanel`), `assets/src/styles.css` (full chat styles)
- Test: `assets/test/components.test.mjs`
- Rebuild: `assets/dist/*`

**Interfaces:**
- Consumes: `renderMarkdown`, `eventsToTurn`, `sendMessage`, `resetChat`.
- Produces: `ChatPanel()` Preact component; a `Thread({ turns })` component that renders each turn's reply as sanitized markdown.

- [ ] **Step 1: Write the failing test (render a turn to string)**

```js
// assets/test/components.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { h } from 'preact';
import { renderToString } from 'preact-render-to-string';
import { Thread } from '../src/components.jsx';

test('Thread renders an agent reply as markdown', () => {
  const turns = [{ role: 'agent', reply: '**hi** there', steps: [], error: false }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /<strong>hi<\/strong>/);
});

test('Thread renders a user message as text', () => {
  const turns = [{ role: 'user', reply: 'hello', steps: [], error: false }];
  const html = renderToString(h(Thread, { turns }));
  assert.match(html, /hello/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd assets && npm test`
Expected: FAIL — cannot import `../src/components.jsx`.

- [ ] **Step 3: Write `assets/src/components.jsx`**

```jsx
/** @jsx h */
import { h, Fragment } from 'preact';
import { useState } from 'preact/hooks';
import { renderMarkdown } from './markdown.js';
import { eventsToTurn } from './events.js';
import { sendMessage, resetChat } from './api.js';

function Bubble({ turn }) {
  if (turn.role === 'user') return <div class="rt-user">{turn.reply}</div>;
  return (
    <div class="rt-turn">
      <span class="rt-name">{window.RoundtableConfig?.agentName || 'Sage'}</span>
      <div class={'rt-ab' + (turn.error ? ' rt-ab-error' : '')}
           // eslint-disable-next-line react/no-danger
           dangerouslySetInnerHTML={{ __html: turn.error ? 'Something went wrong. Please try again.' : renderMarkdown(turn.reply) }} />
    </div>
  );
}

export function Thread({ turns }) {
  return <div class="rt-thread">{turns.map((t, i) => <Bubble key={i} turn={t} />)}</div>;
}

export function ChatPanel() {
  const [turns, setTurns] = useState([{
    role: 'agent', reply: "Hi — I'm here to help. Ask a question, report something off, or suggest an improvement.", steps: [], error: false,
  }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setTurns((t) => [...t, { role: 'user', reply: text, steps: [], error: false }]);
    setBusy(true);
    const res = await sendMessage(text);
    setBusy(false);
    if (res.error) {
      setTurns((t) => [...t, { role: 'agent', reply: '', steps: [], error: true }]);
      return;
    }
    setTurns((t) => [...t, { role: 'agent', ...eventsToTurn(res.events) }]);
  }

  async function newTopic() {
    if (busy) return;
    await resetChat();
    setTurns([{ role: 'agent', reply: "Let's start a new topic. What's going on?", steps: [], error: false }]);
  }

  return (
    <div class="rt-panel">
      <div class="rt-head">
        <div class="rt-avatar">S</div>
        <b>{window.RoundtableConfig?.agentName || 'Sage'}</b>
        <button class="rt-newtopic" type="button" onClick={newTopic}>+ New topic</button>
      </div>
      <Thread turns={turns} />
      {busy && <div class="rt-working"><span class="rt-dots" /> Working…</div>}
      <div class="rt-composer">
        <textarea rows="2" placeholder="Message…" value={draft}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button class="rt-send" type="button" disabled={busy} onClick={send}>Send</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Replace `assets/src/index.js` to mount `ChatPanel`**

```js
/** @jsx h */
import { h, render } from 'preact';
import { ChatPanel } from './components.jsx';
import './styles.css';

const root = document.getElementById('roundtable-app');
if (root) render(h(ChatPanel, {}), root);
```

- [ ] **Step 5: Expand `assets/src/styles.css` (append the chat styles)**

```css
#roundtable-app .rt-head { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid var(--rt-line); background:#fafbfd; }
#roundtable-app .rt-avatar { width:30px; height:30px; border-radius:9px; background:var(--rt-accent); color:#fff; display:grid; place-items:center; font-weight:700; }
#roundtable-app .rt-newtopic { margin-left:auto; font:inherit; font-size:13px; font-weight:600; color:#fff; background:var(--rt-accent); border:none; border-radius:8px; padding:7px 12px; cursor:pointer; }
#roundtable-app .rt-thread { display:flex; flex-direction:column; gap:14px; padding:16px; }
#roundtable-app .rt-user { align-self:flex-end; background:var(--rt-accent); color:#fff; border-radius:12px 12px 3px 12px; padding:9px 12px; max-width:80%; }
#roundtable-app .rt-name { font-size:11.5px; color:var(--rt-ink-soft); font-weight:600; }
#roundtable-app .rt-ab { background:#f2f3fd; border:1px solid #eef1f5; border-radius:3px 12px 12px 12px; padding:11px 13px; line-height:1.55; }
#roundtable-app .rt-ab-error { background:#fbeee9; border-color:#f3d9cf; }
#roundtable-app .rt-ab p:first-child { margin-top:0; } #roundtable-app .rt-ab p:last-child { margin-bottom:0; }
#roundtable-app .rt-code { background:#1b2130; color:#d8def0; border-radius:8px; padding:12px 14px; overflow-x:auto; font-family:ui-monospace,Menlo,Consolas,monospace; font-size:12.8px; }
#roundtable-app .rt-working { padding:0 16px 8px; color:var(--rt-ink-soft); font-size:12.5px; }
#roundtable-app .rt-composer { display:flex; gap:8px; border-top:1px solid var(--rt-line); padding:10px 12px; }
#roundtable-app .rt-composer textarea { flex:1; resize:vertical; border:1px solid var(--rt-line); border-radius:8px; padding:8px 10px; font:inherit; }
#roundtable-app .rt-send { font:inherit; font-weight:600; color:#fff; background:var(--rt-accent); border:none; border-radius:8px; padding:8px 16px; cursor:pointer; }
#roundtable-app .rt-send[disabled] { opacity:.6; cursor:default; }
```

- [ ] **Step 6: Run tests + build**

Run: `cd assets && npm test && npm run build`
Expected: tests PASS; `dist/roundtable.js` + `dist/roundtable.css` rebuilt.

- [ ] **Step 7: Commit (source + rebuilt bundle)**

```bash
git add assets/src/components.jsx assets/src/index.js assets/src/styles.css assets/test/components.test.mjs assets/dist/roundtable.js assets/dist/roundtable.css
git commit -m "feat(ui): Preact Sage chat panel — render events, send, new topic (SDK-M2 #11)"
```

---

## Task 9: CI — build & test the front-end

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add a `ui` job to `ci.yml`** (append after the existing `quality` job, same `jobs:` map)

```yaml
  ui:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: assets
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm ci
      - run: npm test
      - run: npm run build
      - name: Fail if the committed bundle is stale
        run: git diff --exit-code -- dist
```

- [ ] **Step 2: Verify locally that the committed bundle is current**

Run: `cd assets && npm ci && npm run build && git -C .. diff --exit-code -- assets/dist`
Expected: no diff (clean). If there is a diff, commit the rebuilt `assets/dist`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(ui): build + test the front-end bundle and check dist freshness"
```

---

## Task 10: Live smoke on the DDEV harness

**Goal:** Prove the mounted page renders and a real message round-trips in a browser. Not a unit test — a manual/scripted verification against the running harness + hub (`:8799`).

**Files:**
- Modify (harness, outside this repo): `~/dev/rt-harness/wp-content/plugins/roundtable-harness/roundtable-harness.php` — register a top-level menu so the "Community" submenu has a parent.

- [ ] **Step 1: Give the harness a parent menu**

In the harness plugin, before `Roundtable::mount( config(), 'roundtable-harness' )`, register a top-level page and mount under it:

```php
\add_action( 'admin_menu', static function (): void {
    \add_menu_page( 'Roundtable', 'Roundtable', 'read', 'roundtable-harness', '__return_null', 'dashicons-format-chat', 58 );
}, 9 );
Roundtable::mount( config(), 'roundtable-harness' );
```

- [ ] **Step 2: Rebuild the SDK bundle and refresh the harness vendor copy**

Run:
```bash
cd ~/dev/wp-roundtable/assets && npm run build
cd ~/dev/rt-harness/wp-content/plugins/roundtable-harness && composer update epicwp/wp-roundtable --no-interaction
```
Expected: the harness `vendor/epicwp/wp-roundtable/assets/dist/roundtable.js` exists (copied from the freshly built dist).

- [ ] **Step 3: Confirm the page renders**

Run: `cd ~/dev/rt-harness && ddev wp eval 'do_action("admin_menu"); global $submenu; echo isset($submenu["roundtable-harness"]) ? "SUBMENU OK" : "MISSING";'`
Expected: `SUBMENU OK`.

- [ ] **Step 4: Manual browser check**

Log into `https://rt-harness.ddev.site/wp-admin/` (admin/admin), open **Roundtable → Community**, confirm the Sage chat panel renders, type a message, and confirm a real reply appears (markdown rendered, no console errors). Confirm "+ New topic" clears the thread. (Hub must be running on `:8799` with the Anthropic key — see memory `roundtable-local-dev-harness`.)

- [ ] **Step 5: Note the result** in the SDD ledger (no commit in this repo unless the harness lives here — it does not).

---

## Self-Review

- **Spec coverage (slice 1 scope):** #5 admin page/enqueue → Tasks 3–4; #6 build pipeline → Task 5; #7 REST client + event mapping → Tasks 1, 7; #8 reset route → Task 2; #11 chat panel + markdown + new topic → Tasks 6, 8. Deferred items (list/tabs, topic detail, roadmap, drafts, responsive) are explicitly out of slice 1.
- **Placeholder scan:** every code step contains complete code; no TBD/TODO.
- **Type consistency:** `Rest\Gate::permits(Config, WP_REST_Request): bool` used identically in Tasks 1–2; `eventsToTurn`/`renderMarkdown`/`sendMessage`/`resetChat` signatures consistent across Tasks 6–8; `RoundtableConfig` shape `{restUrl, nonce, agentName}` set in Task 3 (PHP) and read in Tasks 3/7/8 (JS); `Admin\Page` constants (`PAGE_SLUG`, `HANDLE`) consistent.
- **Gate:** PHP tasks end with `composer cs && composer stan && composer test`; JS tasks with `npm test` / `npm run build`; CI covers both (Task 9).
