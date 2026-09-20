<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use EpicWP\Roundtable\VotesController;
use Mockery;

final class VotesControllerTest extends TestCase
{
    public function test_handle_get_returns_tally_on_success(): void
    {
        Functions\when( 'wp_verify_nonce' )->justReturn( 1 );
        Functions\when( 'current_user_can' )->justReturn( true );

        $body       = '{"up":0,"down":0,"net":0,"my_vote":null}';
        $controller = $this->controller( new FakeTransport( 200, $body ) );
        $request    = $this->request( array( 'case_id' => 'c1' ) );

        $response = $controller->handleGet( $request );

        self::assertSame( 200, $response->get_status() );
        self::assertNull( $response->get_data()['tally']['my_vote'] );
    }

    public function test_handle_cast_returns_tally_on_success(): void
    {
        Functions\when( 'wp_verify_nonce' )->justReturn( 1 );
        Functions\when( 'current_user_can' )->justReturn( true );

        $body       = '{"up":2,"down":0,"net":2,"my_vote":1}';
        $controller = $this->controller( new FakeTransport( 200, $body ) );
        $request    = $this->request( array( 'case_id' => 'c1', 'value' => 1 ) );

        $response = $controller->handleCast( $request );

        self::assertSame( 200, $response->get_status() );
        self::assertSame( 2, $response->get_data()['tally']['net'] );
    }

    public function test_handle_cast_rejects_invalid_value(): void
    {
        Functions\when( 'wp_verify_nonce' )->justReturn( 1 );
        Functions\when( 'current_user_can' )->justReturn( true );

        $controller = $this->controller( new FakeTransport( 200, '{}' ) );
        $request    = $this->request( array( 'case_id' => 'c1', 'value' => 0 ) );

        $response = $controller->handleCast( $request );

        self::assertSame( 400, $response->get_status() );
    }

    public function test_handle_cast_maps_a_licence_refusal_to_402(): void
    {
        Functions\when( 'wp_verify_nonce' )->justReturn( 1 );
        Functions\when( 'current_user_can' )->justReturn( true );

        $controller = $this->controller( new FakeTransport( 402, '' ) );
        $request    = $this->request( array( 'case_id' => 'c1', 'value' => 1 ) );

        $response = $controller->handleCast( $request );

        self::assertSame( 402, $response->get_status() );
        self::assertSame( array( 'kind' => HubException::LICENCE_INVALID ), $response->get_data()['error'] );
    }

    public function test_handle_retract_returns_tally_on_success(): void
    {
        Functions\when( 'wp_verify_nonce' )->justReturn( 1 );
        Functions\when( 'current_user_can' )->justReturn( true );

        $body       = '{"up":0,"down":0,"net":0,"my_vote":null}';
        $controller = $this->controller( new FakeTransport( 200, $body ) );
        $request    = $this->request( array( 'case_id' => 'c1' ) );

        $response = $controller->handleRetract( $request );

        self::assertSame( 200, $response->get_status() );
        self::assertSame( 0, $response->get_data()['tally']['net'] );
    }

    public function test_handle_cast_maps_hub_error(): void
    {
        Functions\when( 'wp_verify_nonce' )->justReturn( 1 );
        Functions\when( 'current_user_can' )->justReturn( true );

        $controller = $this->controller( new FakeTransport( 403, '' ) );
        $request    = $this->request( array( 'case_id' => 'c1', 'value' => 1 ) );

        $response = $controller->handleCast( $request );

        self::assertSame( 403, $response->get_status() );
        self::assertSame( array( 'kind' => HubException::BLOCKED ), $response->get_data()['error'] );
    }

    private function controller( FakeTransport $transport ): VotesController
    {
        $config = new Config( 'pk', new FakeConsumer() );
        return new VotesController( $config, new HubClient( $config, $transport ) );
    }

    /**
     * @param array<string, mixed> $params
     */
    private function request( array $params ): \WP_REST_Request
    {
        $req = Mockery::mock( \WP_REST_Request::class );
        $req->allows( 'get_header' )->with( 'X-WP-Nonce' )->andReturn( 'nonce' );
        foreach ( $params as $key => $value ) {
            $req->allows( 'get_param' )->with( $key )->andReturn( $value );
        }
        return $req;
    }
}