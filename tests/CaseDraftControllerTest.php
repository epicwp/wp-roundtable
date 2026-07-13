<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\CaseDraftController;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use Mockery;

final class CaseDraftControllerTest extends TestCase
{
    public function test_handle_rejects_empty_conversation(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(new FakeTransport());
        $response   = $controller->handle($this->request(['conversation' => '']));

        self::assertSame(400, $response->get_status());
    }

    public function test_handle_returns_case_on_success(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);
        $this->mockCurrentUser(7);
        $this->mockSessionMeta(chatId: 'chat-1', primed: '1');

        $body = '{"id":"c1","title":"Bug","visibility":"private"}';
        $controller = $this->controller(new FakeTransport(200, $body));
        $response   = $controller->handle($this->request(['conversation' => "User: x\nSage: y"]));

        self::assertSame(200, $response->get_status());
        self::assertSame('c1', $response->get_data()['case']['id']);
    }

    private function controller(FakeTransport $transport): CaseDraftController
    {
        $config = new Config('pk', new FakeConsumer());
        return new CaseDraftController($config, new HubClient($config, $transport));
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

    private function mockCurrentUser(int $userId): void
    {
        $user = \Mockery::mock(\WP_User::class);
        $user->ID = $userId;
        Functions\when('wp_get_current_user')->justReturn($user);
        Functions\when('get_user_meta')->justReturn('');
        Functions\when('update_user_meta')->justReturn(true);
        Functions\when('wp_generate_uuid4')->justReturn('chat-1');
    }

    private function mockSessionMeta(string $chatId, string $primed): void
    {
        Functions\when('get_user_meta')->alias(
            static function (int $uid, string $key, bool $single) use ($chatId, $primed): string {
                unset($uid, $single);
                return match ($key) {
                    'roundtable_chat_id' => $chatId,
                    'roundtable_chat_primed' => $primed,
                    default => '',
                };
            },
        );
    }
}