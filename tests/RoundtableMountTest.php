<?php // tests/RoundtableMountTest.php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey;
use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Consumer;
use EpicWP\Roundtable\Roundtable;
use EpicWP\Roundtable\StreamController;
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
            static function ( string $hook, $callback = null ) use ( &$added ): void {
                $added[] = array( 'hook' => $hook, 'callback' => $callback );
            },
        );
        Roundtable::mount( new Config( 'pk_secret', $consumer ), 'tools.php' );
        $hooks = \array_column( $added, 'hook' );
        self::assertContains( 'admin_menu', $hooks );
        self::assertContains( 'admin_enqueue_scripts', $hooks );
        self::assertContains( 'rest_api_init', $hooks );

        $streamRegisters = \array_filter(
            $added,
            static fn ( array $entry ): bool => 'rest_api_init' === $entry['hook']
                && \is_array( $entry['callback'] )
                && $entry['callback'][0] instanceof StreamController
                && 'register' === $entry['callback'][1],
        );
        self::assertCount( 1, $streamRegisters );
    }
}
