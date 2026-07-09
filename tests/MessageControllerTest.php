<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\MessageController;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use Mockery;

final class MessageControllerTest extends TestCase
{
    public function test_permission_denies_when_nonce_invalid(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(false);
        Functions\when('current_user_can')->justReturn(true);

        [$controller, $transport] = $this->controllerWithFakeTransport(new FakeConsumer(allowed: true));

        self::assertFalse($controller->permission($this->request()));
        self::assertNull($transport->lastUrl);
    }

    public function test_permission_denies_when_capability_missing(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(false);

        [$controller, $transport] = $this->controllerWithFakeTransport(new FakeConsumer(allowed: true));

        self::assertFalse($controller->permission($this->request()));
        self::assertNull($transport->lastUrl);
    }

    public function test_permission_denies_when_consumer_disallows(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        [$controller, $transport] = $this->controllerWithFakeTransport(new FakeConsumer(allowed: false));

        self::assertFalse($controller->permission($this->request()));
        self::assertNull($transport->lastUrl);
    }

    public function test_permission_allows_when_all_gates_pass(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        [$controller, $transport] = $this->controllerWithFakeTransport(new FakeConsumer(allowed: true));

        self::assertTrue($controller->permission($this->request()));
        self::assertNull($transport->lastUrl);
    }

    public function test_handle_returns_events_on_success(): void
    {
        $this->mockCurrentUser(7);
        $this->mockSessionMeta(chatId: 'chat-1', primed: '1');

        [$controller] = $this->controllerWithFakeTransport(
            new FakeConsumer(),
            200,
            "data: {\"type\":\"assistant_text\",\"text\":\"hi\"}\n\n",
        );

        $response = $controller->handle($this->request());

        self::assertSame(200, $response->get_status());
        self::assertSame(
            [['data' => ['text' => 'hi'], 'type' => 'assistant_text']],
            $response->get_data()['events'],
        );
    }

    public function test_handle_marks_primed_on_first_turn(): void
    {
        $this->expectNotToPerformAssertions();
        $this->mockCurrentUser(7);
        $this->mockSessionMeta(chatId: 'chat-1', primed: '');

        Functions\expect('update_user_meta')->once()->with(7, 'roundtable_chat_primed', '1');

        [$controller] = $this->controllerWithFakeTransport(new FakeConsumer());

        $controller->handle($this->request());
    }

    public function test_handle_does_not_remark_and_omits_metadata_on_later_turn(): void
    {
        $this->mockCurrentUser(7);
        $this->mockSessionMeta(chatId: 'chat-1', primed: '1');

        Functions\expect('update_user_meta')->never();

        $consumer = new FakeConsumer(true, 'subj', 'HEALTH', '1.2.3');
        [$controller, $transport] = $this->controllerWithFakeTransport($consumer);

        $controller->handle($this->request());

        $body = json_decode((string) $transport->lastBody, true);
        self::assertArrayNotHasKey('metadata', $body);
        self::assertArrayNotHasKey('client_version', $body);
    }

    public function test_handle_returns_structured_error_without_the_key_on_hub_exception(): void
    {
        $this->mockCurrentUser(7);
        $this->mockSessionMeta(chatId: 'chat-1', primed: '1');

        [$controller] = $this->controllerWithFakeTransport(new FakeConsumer(), 403, '', 'pk_secret_test');

        $response = $controller->handle($this->request());

        self::assertSame(403, $response->get_status());
        self::assertSame(HubException::BLOCKED, $response->get_data()['error']['kind']);
        self::assertStringNotContainsString('pk_secret_test', (string) json_encode($response->get_data()));
    }

    public function test_register_registers_the_rest_route(): void
    {
        $this->expectNotToPerformAssertions();
        [$controller] = $this->controllerWithFakeTransport(new FakeConsumer());

        Functions\expect('register_rest_route')
            ->once()
            ->with(
                'roundtable/v1',
                '/message',
                Mockery::on(static function (array $args) use ($controller): bool {
                    return 'POST' === $args['methods']
                        && [$controller, 'handle'] === $args['callback']
                        && [$controller, 'permission'] === $args['permission_callback'];
                }),
            );

        $controller->register();
    }

    private function request(string $nonce = 'valid-nonce', string $message = 'hi'): \WP_REST_Request
    {
        $request = new \WP_REST_Request();
        $request->set_header('X-WP-Nonce', $nonce);
        $request->set_param('message', $message);

        return $request;
    }

    private function mockCurrentUser(int $userId): void
    {
        Functions\when('wp_get_current_user')->justReturn((object) ['ID' => $userId]);
    }

    private function mockSessionMeta(string $chatId, string $primed): void
    {
        Functions\when('get_user_meta')->alias(static function (int $userId, string $key) use ($chatId, $primed): string {
            return match ($key) {
                'roundtable_chat_id' => $chatId,
                'roundtable_chat_primed' => $primed,
                default => '',
            };
        });
    }

    /**
     * @return array{0: MessageController, 1: FakeTransport}
     */
    private function controllerWithFakeTransport(
        FakeConsumer $consumer,
        int $status = 200,
        string $body = '',
        string $projectApiKey = 'pk_secret',
    ): array {
        $transport  = new FakeTransport($status, $body);
        $config     = new Config($projectApiKey, $consumer);
        $hubClient  = new HubClient($config, $transport);
        $controller = new MessageController($config, $hubClient);

        return [$controller, $transport];
    }
}
