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
            public function licence(): ?array { return null; }
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
