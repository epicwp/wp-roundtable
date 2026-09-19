<?php // tests/RoundtableMountTest.php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey;
use Brain\Monkey\Functions;
use EpicWP\Roundtable\CaseDraftController;
use EpicWP\Roundtable\CasesController;
use EpicWP\Roundtable\CommentsController;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Consumer;
use EpicWP\Roundtable\HistoryController;
use EpicWP\Roundtable\MessageController;
use EpicWP\Roundtable\MyCasesController;
use EpicWP\Roundtable\ParticipatingCasesController;
use EpicWP\Roundtable\PublishController;
use EpicWP\Roundtable\Roundtable;
use EpicWP\Roundtable\SessionController;
use EpicWP\Roundtable\StreamController;
use EpicWP\Roundtable\TopicController;
use EpicWP\Roundtable\VotesController;
use PHPUnit\Framework\TestCase;

final class RoundtableMountTest extends TestCase {
    protected function setUp(): void { parent::setUp(); Monkey\setUp(); }
    protected function tearDown(): void { Monkey\tearDown(); parent::tearDown(); }

    public function test_mount_registers_admin_and_rest_hooks_when_chat_is_enabled(): void {
        $added = $this->mountAndCaptureHooks( enableChat: true );
        $hooks = \array_column( $added, 'hook' );
        self::assertContains( 'admin_menu', $hooks );
        self::assertContains( 'admin_enqueue_scripts', $hooks );
        self::assertContains( 'rest_api_init', $hooks );

        $registered = $this->registeredControllerClasses( $added );
        self::assertContains( StreamController::class, $registered );
        self::assertContains( MessageController::class, $registered );
        self::assertContains( HistoryController::class, $registered );
        self::assertContains( SessionController::class, $registered );
        self::assertContains( CaseDraftController::class, $registered );
        self::assertContains( CasesController::class, $registered );
        self::assertContains( TopicController::class, $registered );
        self::assertContains( PublishController::class, $registered );
    }

    public function test_mount_omits_chat_routes_by_default(): void {
        $added      = $this->mountAndCaptureHooks();
        $registered = $this->registeredControllerClasses( $added );

        self::assertNotContains( MessageController::class, $registered );
        self::assertNotContains( HistoryController::class, $registered );
        self::assertNotContains( StreamController::class, $registered );
        self::assertNotContains( SessionController::class, $registered );
        self::assertNotContains( CaseDraftController::class, $registered );

        self::assertContains( CasesController::class, $registered );
        self::assertContains( MyCasesController::class, $registered );
        self::assertContains( ParticipatingCasesController::class, $registered );
        self::assertContains( CommentsController::class, $registered );
        self::assertContains( VotesController::class, $registered );
        self::assertContains( PublishController::class, $registered );
        self::assertContains( TopicController::class, $registered );
    }

    /**
     * @return list<array{hook: string, callback: mixed}>
     */
    private function mountAndCaptureHooks( bool $enableChat = false ): array {
        $consumer = new class implements Consumer {
            public function isUserAllowed(): bool { return true; }
            public function subjectId(): string { return 's'; }
            public function metadata(): ?string { return null; }
            public function clientVersion(): ?string { return null; }
            public function licence(): ?array { return null; }
            public function email(): ?string { return null; }
        };
        $added = array();
        Functions\when( 'add_action' )->alias(
            static function ( string $hook, $callback = null ) use ( &$added ): void {
                $added[] = array( 'hook' => $hook, 'callback' => $callback );
            },
        );
        Roundtable::mount( new Config( 'pk_secret', $consumer, enableChat: $enableChat ), 'tools.php' );

        return $added;
    }

    /**
     * @param list<array{hook: string, callback: mixed}> $added
     *
     * @return list<class-string>
     */
    private function registeredControllerClasses( array $added ): array {
        $restRegisters = \array_filter(
            $added,
            static fn ( array $entry ): bool => 'rest_api_init' === $entry['hook']
                && \is_array( $entry['callback'] )
                && 'register' === $entry['callback'][1],
        );

        return \array_values(
            \array_map( static fn ( array $entry ): string => \get_class( $entry['callback'][0] ), $restRegisters ),
        );
    }
}
