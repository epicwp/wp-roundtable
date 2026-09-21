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

    public function test_handle_list_returns_comments_on_success(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $body = '[{"id":"cm1","case_id":"c1","author_handle":"h","body":"Hi","status":"active","created_at":"2026-07-01T00:00:00","updated_at":"2026-07-01T00:00:00"}]';
        $controller = $this->controller(new FakeTransport(200, $body));

        $response = $controller->handleList($this->request('c1'));

        self::assertSame(200, $response->get_status());
        self::assertSame('cm1', $response->get_data()['comments'][0]['id']);
    }

    public function test_handle_list_maps_hub_error(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(new FakeTransport(403, ''));
        $response   = $controller->handleList($this->request('c1'));

        self::assertSame(403, $response->get_status());
        self::assertSame(['kind' => HubException::BLOCKED], $response->get_data()['error']);
    }

    public function test_handle_create_returns_comment_on_success(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $body = '{"id":"cm2","case_id":"c1","author_handle":"h","body":"Reply","status":"active","created_at":"2026-07-01T00:00:00","updated_at":"2026-07-01T00:00:00"}';
        $controller = $this->controller(new FakeTransport(200, $body));

        $req = $this->request('c1');
        $req->allows('get_param')->with('body')->andReturn('Reply');

        $response = $controller->handleCreate($req);

        self::assertSame(200, $response->get_status());
        self::assertSame('cm2', $response->get_data()['comment']['id']);
    }

    public function test_handle_create_converts_the_body_html_to_markdown_before_calling_the_hub(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $transport  = new FakeTransport(200, '{"id":"cm1"}');
        $config     = new Config('pk', new FakeConsumer());
        $controller = new CommentsController($config, new HubClient($config, $transport));

        $req = $this->request('c1');
        $req->allows('get_param')->with('body')->andReturn('<p>Reply with <em>emphasis</em>.</p>');

        $controller->handleCreate($req);

        $payload = \json_decode((string) $transport->lastBody, true);
        self::assertSame('Reply with *emphasis*.', $payload['body']);
    }

    public function test_handle_create_validates_the_original_html_non_emptiness_not_the_converted_markdown(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $transport  = new FakeTransport(200, '{"id":"cm1"}');
        $config     = new Config('pk', new FakeConsumer());
        $controller = new CommentsController($config, new HubClient($config, $transport));

        $req = $this->request('c1');
        // Non-empty raw HTML that converts to an empty markdown string (an empty <p>).
        $req->allows('get_param')->with('body')->andReturn('<p></p>');

        $response = $controller->handleCreate($req);

        self::assertSame(200, $response->get_status());
        $payload = \json_decode((string) $transport->lastBody, true);
        self::assertSame('', $payload['body']);
    }

    public function test_handle_create_maps_a_licence_refusal_to_402(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(new FakeTransport(402, ''));
        $req        = $this->request('c1');
        $req->allows('get_param')->with('body')->andReturn('Reply');

        $response = $controller->handleCreate($req);

        self::assertSame(402, $response->get_status());
        self::assertSame(['kind' => HubException::LICENCE_INVALID], $response->get_data()['error']);
    }

    public function test_handle_create_rejects_empty_body(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(new FakeTransport());
        $req        = $this->request('c1');
        $req->allows('get_param')->with('body')->andReturn('   ');

        $response = $controller->handleCreate($req);

        self::assertSame(400, $response->get_status());
        self::assertSame(['kind' => 'invalid_request'], $response->get_data()['error']);
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