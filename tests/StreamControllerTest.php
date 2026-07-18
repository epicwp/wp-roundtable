<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\Session;
use EpicWP\Roundtable\StreamController;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeStreamingTransport;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use Mockery;

final class StreamControllerTest extends TestCase
{
    public function test_permission_denies_when_the_gate_refuses(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(false);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(200, []);

        self::assertFalse($controller->permission($this->request()));
    }

    public function test_permission_allows_when_the_gate_passes(): void
    {
        Functions\when('wp_verify_nonce')->justReturn(1);
        Functions\when('current_user_can')->justReturn(true);

        $controller = $this->controller(200, []);

        self::assertTrue($controller->permission($this->request()));
    }

    public function test_register_registers_the_post_stream_route(): void
    {
        $this->expectNotToPerformAssertions();
        $controller = $this->controller(200, []);

        Functions\expect('register_rest_route')
            ->once()
            ->with(
                'roundtable/v1',
                '/message/stream',
                Mockery::on(static function (array $args) use ($controller): bool {
                    return 'POST' === $args['methods']
                        && [$controller, 'handle'] === $args['callback']
                        && [$controller, 'permission'] === $args['permission_callback'];
                }),
            );

        $controller->register();
    }

    public function test_stream_turn_writes_one_payload_per_event_in_order(): void
    {
        $controller = $this->controller(200, [
            'data: {"type":"guarded_text_delta","text":"hel"}',
            'data: {"type":"guarded_text_delta","text":"lo"}',
            'data: {"type":"result","subtype":"ok","is_error":false,"num_turns":1}',
        ]);

        $written = [];
        $this->streamTurn($controller, new Session(7), 'chat-1', 'hi', false, static function (array $payload) use (&$written): void {
            $written[] = $payload;
        });

        self::assertSame(
            [
                ['type' => 'guarded_text_delta', 'text' => 'hel'],
                ['type' => 'guarded_text_delta', 'text' => 'lo'],
                ['type' => 'result', 'subtype' => 'ok', 'is_error' => false, 'num_turns' => 1],
            ],
            $written,
        );
    }

    public function test_stream_turn_marks_primed_once_only_after_the_events_on_a_first_turn(): void
    {
        $controller = $this->controller(200, [
            'data: {"type":"guarded_text_delta","text":"hi"}',
            'data: {"type":"result","subtype":"ok","is_error":false,"num_turns":1}',
        ]);

        $log = [];
        Functions\expect('update_user_meta')
            ->once()
            ->with(7, 'roundtable_chat_primed', '1')
            ->andReturnUsing(static function () use (&$log): bool {
                $log[] = 'primed';
                return true;
            });

        $this->streamTurn($controller, new Session(7), 'chat-1', 'hi', true, static function (array $payload) use (&$log): void {
            $log[] = $payload['type'];
        });

        self::assertSame(['guarded_text_delta', 'result', 'primed'], $log);
    }

    public function test_stream_turn_does_not_mark_primed_on_a_later_turn(): void
    {
        $this->expectNotToPerformAssertions();
        $controller = $this->controller(200, ['data: {"type":"result","subtype":"ok"}']);

        Functions\expect('update_user_meta')->never();

        $this->streamTurn($controller, new Session(7), 'chat-1', 'hi', false, static function (array $payload): void {
        });
    }

    public function test_stream_turn_first_turn_hub_exception_never_marks_primed_and_writes_error(): void
    {
        // A 403 status makes HubClient::streamMessage throw HubException::blocked() before any event.
        $controller = $this->controller(403, []);

        Functions\expect('update_user_meta')->never();

        $written = [];
        $this->streamTurn($controller, new Session(7), 'chat-1', 'hi', true, static function (array $payload) use (&$written): void {
            $written[] = $payload;
        });

        self::assertSame([['type' => 'error', 'message' => HubException::BLOCKED]], $written);
    }

    public function test_stream_turn_forwards_trigger_to_hub_client(): void
    {
        [$controller, $transport] = $this->controllerWithFakeStreamingTransport(200, []);

        $this->streamTurn($controller, new Session(7), 'chat-1', 'hi', false, static function (array $payload): void {
        }, 'create_topic');

        $body = json_decode((string) $transport->lastBody, true);
        self::assertSame('create_topic', $body['trigger']);
    }

    public function test_stream_turn_omits_trigger_when_not_provided(): void
    {
        [$controller, $transport] = $this->controllerWithFakeStreamingTransport(200, []);

        $this->streamTurn($controller, new Session(7), 'chat-1', 'hi', false, static function (array $payload): void {
        });

        $body = json_decode((string) $transport->lastBody, true);
        self::assertArrayNotHasKey('trigger', $body);
    }

    /**
     * Invoke the private security-critical core with a recording writer (no output buffering).
     *
     * @param callable(array<string, mixed>): void $write
     */
    private function streamTurn(
        StreamController $controller,
        Session $session,
        string $chatId,
        string $message,
        bool $isFirstTurn,
        callable $write,
        ?string $trigger = null,
    ): void {
        $method = new \ReflectionMethod($controller, 'streamTurn');
        $method->setAccessible(true);
        $method->invoke($controller, $session, $chatId, $message, $isFirstTurn, $write, $trigger);
    }

    private function request(string $nonce = 'valid-nonce'): \WP_REST_Request
    {
        $request = new \WP_REST_Request();
        $request->set_header('X-WP-Nonce', $nonce);
        $request->set_param('message', 'hi');

        return $request;
    }

    /**
     * @param list<string> $frames
     */
    private function controller(int $status, array $frames): StreamController
    {
        $config    = new Config('pk_secret', new FakeConsumer());
        $hubClient = new HubClient($config, new FakeTransport());

        return new StreamController($config, $hubClient, new FakeStreamingTransport($status, $frames));
    }

    /**
     * Like {@see self::controller()}, but also returns the streaming transport so tests can
     * assert on the last request body sent to it.
     *
     * @param list<string> $frames
     *
     * @return array{0: StreamController, 1: FakeStreamingTransport}
     */
    private function controllerWithFakeStreamingTransport(int $status, array $frames): array
    {
        $config    = new Config('pk_secret', new FakeConsumer());
        $hubClient = new HubClient($config, new FakeTransport());
        $transport = new FakeStreamingTransport($status, $frames);

        return [new StreamController($config, $hubClient, $transport), $transport];
    }
}
