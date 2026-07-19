<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\Http\TransportException;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class HubClientHistoryTest extends PHPUnitTestCase
{
    private function config(): Config
    {
        return new Config('pk_secret', new FakeConsumer());
    }

    public function test_gets_the_chat_history(): void
    {
        $body      = '{"events":[{"type":"user_text","data":{"text":"hi"}}]}';
        $transport = new FakeTransport(200, $body);
        $client    = new HubClient($this->config(), $transport);

        $events = $client->getHistory('c1');

        self::assertSame('GET', $transport->lastMethod);
        self::assertSame(HubClient::HUB_URL . '/chats/c1/messages', $transport->lastUrl);
        self::assertSame('Bearer pk_secret', $transport->lastHeaders['Authorization']);
        self::assertSame(
            [['type' => 'user_text', 'data' => ['text' => 'hi']]],
            $events,
        );
    }

    public function test_uses_hub_base_url_override(): void
    {
        $transport = new FakeTransport(200, '{"events":[]}');
        $config    = new Config('pk', new FakeConsumer(), hubBaseUrl: 'http://hub.test');
        $client    = new HubClient($config, $transport);

        $client->getHistory('c-99');

        self::assertSame('http://hub.test/chats/c-99/messages', $transport->lastUrl);
    }

    public function test_maps_forbidden_to_blocked(): void
    {
        $client = new HubClient($this->config(), new FakeTransport(403, ''));

        $this->expectException(HubException::class);
        try {
            $client->getHistory('c1');
        } catch (HubException $e) {
            self::assertSame(HubException::BLOCKED, $e->kind());
            throw $e;
        }
    }

    public function test_maps_transport_failure_to_network(): void
    {
        $transport = new FakeTransport(throw: new TransportException('timeout'));
        $client    = new HubClient($this->config(), $transport);

        $this->expectException(HubException::class);
        try {
            $client->getHistory('c1');
        } catch (HubException $e) {
            self::assertSame(HubException::NETWORK, $e->kind());
            throw $e;
        }
    }
}
