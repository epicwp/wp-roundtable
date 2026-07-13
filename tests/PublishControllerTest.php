<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\PublishController;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use Mockery;

final class PublishControllerTest extends TestCase
{
    public function test_handle_rejects_missing_case_id(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(new FakeTransport());
        $response   = $controller->handle($this->request(['case_id' => '']));

        self::assertSame(400, $response->get_status());
    }

    public function test_handle_returns_published_case(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $body = '{"id":"c1","visibility":"public","title":"Shipped"}';
        $controller = $this->controller(new FakeTransport(200, $body));
        $response   = $controller->handle($this->request(['case_id' => 'c1', 'title' => 'Shipped']));

        self::assertSame(200, $response->get_status());
        self::assertSame('public', $response->get_data()['case']['visibility']);
    }

    private function controller(FakeTransport $transport): PublishController
    {
        $config = new Config('pk', new FakeConsumer());
        return new PublishController($config, new HubClient($config, $transport));
    }

    /** @param array<string, string> $params */
    private function request(array $params): \WP_REST_Request
    {
        $req = Mockery::mock(\WP_REST_Request::class);
        $req->allows('get_header')->with('X-WP-Nonce')->andReturn('nonce');
        foreach ($params as $key => $value) {
            $req->allows('get_param')->with($key)->andReturn($value);
        }
        $req->allows('get_param')->andReturn('');
        return $req;
    }
}