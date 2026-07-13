<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\MyCasesController;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use Mockery;

final class MyCasesControllerTest extends TestCase
{
    public function test_handle_returns_cases_on_success(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $body = '[{"id":"c1","title":"Draft","type":"bug","status":"open","visibility":"private","summary":"s","author_handle":"h","net":0,"created_at":"2026-07-01T00:00:00"}]';
        $controller = $this->controller(new FakeTransport(200, $body));

        $response = $controller->handle($this->request());

        self::assertSame(200, $response->get_status());
        self::assertSame('c1', $response->get_data()['cases'][0]['id']);
    }

    public function test_handle_maps_hub_error(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(new FakeTransport(403, ''));
        $response   = $controller->handle($this->request());

        self::assertSame(403, $response->get_status());
        self::assertSame(['kind' => HubException::BLOCKED], $response->get_data()['error']);
    }

    private function controller(FakeTransport $transport): MyCasesController
    {
        $config = new Config('pk', new FakeConsumer());
        return new MyCasesController($config, new HubClient($config, $transport));
    }

    private function request(): \WP_REST_Request
    {
        $req = Mockery::mock(\WP_REST_Request::class);
        $req->allows('get_header')->with('X-WP-Nonce')->andReturn('nonce');
        return $req;
    }
}