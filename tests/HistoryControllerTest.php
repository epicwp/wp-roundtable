<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HistoryController;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use Mockery;

final class HistoryControllerTest extends TestCase
{
    public function test_permission_denies_when_gate_fails(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(false);
        Functions\when('current_user_can')->justReturn(true);

        [$controller] = $this->controllerWithFakeTransport(new FakeConsumer(allowed: true));

        self::assertFalse($controller->permission($this->request()));
    }

    public function test_handle_returns_the_hubs_events_for_a_primed_session(): void
    {
        $this->mockCurrentUser(7);
        $this->mockSessionMeta(chatId: 'chat-1', primed: '1');

        [$controller, $transport] = $this->controllerWithFakeTransport(
            new FakeConsumer(),
            200,
            '{"events":[{"type":"user_text","data":{"text":"hi"}}]}',
        );

        $response = $controller->handle($this->request());

        self::assertSame(200, $response->get_status());
        self::assertSame(
            [['type' => 'user_text', 'data' => ['text' => 'hi']]],
            $response->get_data()['events'],
        );
        self::assertSame(HubClient::HUB_URL . '/chats/chat-1/messages', $transport->lastUrl);
        self::assertSame('GET', $transport->lastMethod);
    }

    public function test_handle_returns_empty_events_without_calling_the_hub_when_unprimed(): void
    {
        $this->mockCurrentUser(7);
        $this->mockSessionMeta(chatId: 'chat-1', primed: '');

        [$controller, $transport] = $this->controllerWithFakeTransport(new FakeConsumer());

        $response = $controller->handle($this->request());

        self::assertSame(200, $response->get_status());
        self::assertSame([], $response->get_data()['events']);
        self::assertNull($transport->lastUrl);
        self::assertNull($transport->lastMethod);
    }

    public function test_handle_maps_hub_exception_to_its_status(): void
    {
        $this->mockCurrentUser(7);
        $this->mockSessionMeta(chatId: 'chat-1', primed: '1');

        [$controller] = $this->controllerWithFakeTransport(new FakeConsumer(), 403, '');

        $response = $controller->handle($this->request());

        self::assertSame(403, $response->get_status());
        self::assertSame(HubException::BLOCKED, $response->get_data()['error']['kind']);
    }

    public function test_register_registers_the_rest_route(): void
    {
        $this->expectNotToPerformAssertions();
        [$controller] = $this->controllerWithFakeTransport(new FakeConsumer());

        Functions\expect('register_rest_route')
            ->once()
            ->with(
                'roundtable/v1',
                '/history',
                Mockery::on(static function (array $args) use ($controller): bool {
                    return 'GET' === $args['methods']
                        && [$controller, 'handle'] === $args['callback']
                        && [$controller, 'permission'] === $args['permission_callback'];
                }),
            );

        $controller->register();
    }

    private function request(string $nonce = 'valid-nonce'): \WP_REST_Request
    {
        $request = new \WP_REST_Request();
        $request->set_header('X-WP-Nonce', $nonce);

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
     * @return array{0: HistoryController, 1: FakeTransport}
     */
    private function controllerWithFakeTransport(
        FakeConsumer $consumer,
        int $status = 200,
        string $body = '{"events":[]}',
        string $projectApiKey = 'pk_secret',
    ): array {
        $transport  = new FakeTransport($status, $body);
        $config     = new Config($projectApiKey, $consumer);
        $hubClient  = new HubClient($config, $transport);
        $controller = new HistoryController($config, $hubClient);

        return [$controller, $transport];
    }
}
