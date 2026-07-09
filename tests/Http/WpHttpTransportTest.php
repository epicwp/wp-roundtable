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
