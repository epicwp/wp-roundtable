<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Event;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeStreamingTransport;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class HubClientStreamTest extends PHPUnitTestCase
{
    public function test_stream_message_decodes_frames_and_invokes_callback(): void
    {
        $frames = [
            'data: {"type":"guarded_text_delta","text":"hel"}',
            'data: {"type":"guarded_text_delta","text":"lo"}',
            'data: {"type":"result","subtype":"ok","is_error":false,"num_turns":1}',
        ];
        $client = new HubClient(new Config('pk', new FakeConsumer()), new FakeTransport(/* buffered unused */));
        $seen = [];
        $client->streamMessage('chat-1', 'hi', false, new FakeStreamingTransport(200, $frames),
            function (Event $e) use (&$seen) { $seen[] = $e->type; });
        self::assertSame(['guarded_text_delta', 'guarded_text_delta', 'result'], $seen);
    }

    public function test_stream_message_maps_403_to_blocked_before_events(): void
    {
        $client = new HubClient(new Config('pk', new FakeConsumer()), new FakeTransport());
        $this->expectException(HubException::class);
        $client->streamMessage('c', 'hi', false, new FakeStreamingTransport(403, []),
            function (Event $e) { /* never called */ });
    }

    public function test_stream_message_maps_a_403_chat_disabled_body_to_chat_disabled(): void
    {
        $client = new HubClient(new Config('pk', new FakeConsumer()), new FakeTransport());
        try {
            $client->streamMessage('c', 'hi', false, new FakeStreamingTransport(403, ['{"detail":{"code":"chat_disabled"}}']),
                function (Event $e) { /* never called */ });
            self::fail('expected HubException');
        } catch (HubException $e) {
            self::assertSame(HubException::CHAT_DISABLED, $e->kind());
        }
    }

    public function test_stream_message_includes_trigger_in_body_when_given(): void
    {
        $client    = new HubClient(new Config('pk', new FakeConsumer()), new FakeTransport());
        $transport = new FakeStreamingTransport(200, []);

        $client->streamMessage('chat-1', 'ignored', false, $transport, static function (Event $e): void {}, 'create_topic');

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertSame('create_topic', $body['trigger']);
    }
}
