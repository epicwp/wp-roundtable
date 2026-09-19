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
            public function licence(): ?array { return null; }
            public function email(): ?string { return null; }
        };
        return new SessionController( new Config( 'pk_secret', $consumer ) );
    }

    public function test_register_adds_the_reset_route(): void {
        $this->expectNotToPerformAssertions();
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
