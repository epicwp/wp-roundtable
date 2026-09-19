<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use EpicWP\Roundtable\TopicController;
use Mockery;

final class TopicControllerTest extends TestCase
{
    public function test_handle_rejects_an_invalid_type(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(new FakeTransport());
        $response   = $controller->handle($this->request(['type' => 'nope', 'title' => 'T', 'body' => 'B']));

        self::assertSame(400, $response->get_status());
    }

    public function test_handle_rejects_a_missing_title(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(new FakeTransport());
        $response   = $controller->handle($this->request(['type' => 'bug', 'title' => '', 'body' => 'B']));

        self::assertSame(400, $response->get_status());
    }

    public function test_handle_rejects_a_missing_body(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(new FakeTransport());
        $response   = $controller->handle($this->request(['type' => 'bug', 'title' => 'T', 'body' => '']));

        self::assertSame(400, $response->get_status());
    }

    public function test_handle_returns_the_created_case_on_success(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $body       = '{"id":"c1","visibility":"pending","title":"Broken thing"}';
        $controller = $this->controller(new FakeTransport(200, $body));
        $response   = $controller->handle($this->request([
            'type'  => 'bug',
            'title' => 'Broken thing',
            'body'  => 'It is broken.',
        ]));

        self::assertSame(200, $response->get_status());
        self::assertSame('pending', $response->get_data()['case']['visibility']);
    }

    public function test_handle_maps_a_licence_refusal_to_402(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(new FakeTransport(402, ''));
        $response   = $controller->handle($this->request(['type' => 'bug', 'title' => 'T', 'body' => 'B']));

        self::assertSame(402, $response->get_status());
        self::assertSame(HubException::LICENCE_INVALID, $response->get_data()['error']['kind']);
    }

    public function test_handle_maps_a_blocked_refusal_to_403(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(new FakeTransport(403, ''));
        $response   = $controller->handle($this->request(['type' => 'bug', 'title' => 'T', 'body' => 'B']));

        self::assertSame(403, $response->get_status());
        self::assertSame(HubException::BLOCKED, $response->get_data()['error']['kind']);
    }

    public function test_register_registers_the_rest_route(): void
    {
        $this->expectNotToPerformAssertions();
        $controller = $this->controller(new FakeTransport());

        Functions\expect('register_rest_route')
            ->once()
            ->with(
                'roundtable/v1',
                '/topics',
                Mockery::on(static function (array $args) use ($controller): bool {
                    return 'POST' === $args['methods']
                        && [$controller, 'handle'] === $args['callback']
                        && [$controller, 'permission'] === $args['permission_callback'];
                }),
            );

        $controller->register();
    }

    private function controller(FakeTransport $transport): TopicController
    {
        $config = new Config('pk', new FakeConsumer());
        return new TopicController($config, new HubClient($config, $transport));
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
