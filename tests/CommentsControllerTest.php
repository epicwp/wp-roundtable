<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\CommentsController;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use Mockery;

final class CommentsControllerTest extends TestCase
{
    public function test_permission_denies_when_gate_fails(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(false);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(new FakeTransport());
        self::assertFalse($controller->permission($this->request('c1')));
    }

    public function test_handle_returns_comments_on_success(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $body = '[{"id":"cm1","case_id":"c1","author_handle":"h","body":"Hi","status":"active","created_at":"2026-07-01T00:00:00","updated_at":"2026-07-01T00:00:00"}]';
        $controller = $this->controller(new FakeTransport(200, $body));

        $response = $controller->handle($this->request('c1'));

        self::assertSame(200, $response->get_status());
        self::assertSame('cm1', $response->get_data()['comments'][0]['id']);
    }

    public function test_handle_maps_hub_error(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(new FakeTransport(403, ''));
        $response   = $controller->handle($this->request('c1'));

        self::assertSame(403, $response->get_status());
        self::assertSame(['kind' => HubException::BLOCKED], $response->get_data()['error']);
    }

    private function controller(FakeTransport $transport): CommentsController
    {
        $config = new Config('pk', new FakeConsumer());
        return new CommentsController($config, new HubClient($config, $transport));
    }

    private function request(string $caseId): \WP_REST_Request
    {
        $req = Mockery::mock(\WP_REST_Request::class);
        $req->allows('get_header')->with('X-WP-Nonce')->andReturn('nonce');
        $req->allows('get_param')->with('case_id')->andReturn($caseId);
        return $req;
    }
}