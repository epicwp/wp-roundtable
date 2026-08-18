<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Event;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\Http\TransportException;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class HubClientTest extends PHPUnitTestCase
{
    private function config(FakeConsumer $consumer): Config
    {
        return new Config('pk_secret', $consumer);
    }

    public function test_posts_to_the_hub_and_parses_the_reply(): void
    {
        $transport = new FakeTransport(200, "data: {\"type\":\"assistant_text\",\"text\":\"Hi\"}\n\n");
        $client    = new HubClient($this->config(new FakeConsumer()), $transport);

        $result = $client->postMessage('chat-1', 'hello', false);

        self::assertSame('Hi', $result->assistantText());
        self::assertSame(HubClient::HUB_URL . '/chats/chat-1/messages', $transport->lastUrl);
        self::assertSame('Bearer pk_secret', $transport->lastHeaders['Authorization']);
    }

    public function test_first_turn_body_carries_metadata_and_client_version(): void
    {
        $transport = new FakeTransport(200, '');
        $client    = new HubClient($this->config(new FakeConsumer(true, 'subj', 'HEALTH', '1.2.3')), $transport);

        $client->postMessage('chat-1', 'hello', true);

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertSame('subj', $body['subject_id']);
        self::assertSame('hello', $body['message']);
        self::assertSame('HEALTH', $body['metadata']);
        self::assertSame('1.2.3', $body['client_version']);
    }

    public function test_body_carries_licence_on_every_turn_when_consumer_provides_one(): void
    {
        $transport = new FakeTransport(200, '');
        $licence   = array('key' => 'lic-1', 'activation_id' => 'act-1');
        $client    = new HubClient($this->config(new FakeConsumer(true, 'subj', null, null, $licence)), $transport);

        $client->postMessage('chat-1', 'hello', false);

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertSame($licence, $body['licence']);
    }

    public function test_body_omits_licence_when_consumer_has_none(): void
    {
        $transport = new FakeTransport(200, '');
        $client    = new HubClient($this->config(new FakeConsumer()), $transport);

        $client->postMessage('chat-1', 'hello', false);

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertArrayNotHasKey('licence', $body);
    }

    public function test_later_turn_body_omits_metadata_and_client_version(): void
    {
        $transport = new FakeTransport(200, '');
        $client    = new HubClient($this->config(new FakeConsumer(true, 'subj', 'HEALTH', '1.2.3')), $transport);

        $client->postMessage('chat-1', 'hello', false);

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertArrayNotHasKey('metadata', $body);
        self::assertArrayNotHasKey('client_version', $body);
    }

    public function test_uses_the_hub_base_url_override_when_set(): void
    {
        $transport = new FakeTransport(200, '');
        $config    = new Config('pk', new FakeConsumer(), 'Roundtable', null, 30, 'https://staging');
        (new HubClient($config, $transport))->postMessage('c', 'm', false);
        self::assertSame('https://staging/chats/c/messages', $transport->lastUrl);
    }

    /**
     * @return array<string, array{int, string}>
     */
    public static function errorStatuses(): array
    {
        return [
            'licence'    => [402, HubException::LICENCE_INVALID],
            'blocked'    => [403, HubException::BLOCKED],
            'over quota' => [429, HubException::OVER_QUOTA],
            'server'     => [503, HubException::SERVER],
        ];
    }

    /** @dataProvider errorStatuses */
    public function test_maps_http_error_statuses_to_hub_error(int $status, string $kind): void
    {
        $client = new HubClient($this->config(new FakeConsumer()), new FakeTransport($status, ''));
        try {
            $client->postMessage('c', 'm', false);
            self::fail('expected HubException');
        } catch (HubException $e) {
            self::assertSame($kind, $e->kind());
            self::assertStringNotContainsString('pk_secret', $e->getMessage());
        }
    }

    public function test_maps_transport_exception_to_network_hub_error(): void
    {
        $client = new HubClient(
            $this->config(new FakeConsumer()),
            new FakeTransport(0, '', new TransportException('cURL error 6')),
        );
        $this->expectException(HubException::class);
        try {
            $client->postMessage('c', 'm', false);
        } catch (HubException $e) {
            self::assertSame(HubException::NETWORK, $e->kind());
            self::assertStringNotContainsString('pk_secret', $e->getMessage());
            throw $e;
        }
    }

    public function test_first_turn_with_null_context_omits_metadata_and_client_version(): void
    {
        $transport = new FakeTransport(200, '');
        $client    = new HubClient($this->config(new FakeConsumer(true, 'subj', null, null)), $transport);

        $client->postMessage('chat-1', 'hello', true);

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertSame('subj', $body['subject_id']);
        self::assertSame('hello', $body['message']);
        self::assertArrayNotHasKey('metadata', $body);
        self::assertArrayNotHasKey('client_version', $body);
    }

    public function test_post_message_includes_trigger_in_body_when_given(): void
    {
        $transport = new FakeTransport(200, '');
        $client    = new HubClient($this->config(new FakeConsumer()), $transport);

        $client->postMessage('chat-1', 'ignored', false, 'create_topic');

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertSame('create_topic', $body['trigger']);
    }

    public function test_post_message_omits_trigger_when_null(): void
    {
        $transport = new FakeTransport(200, '');
        $client    = new HubClient($this->config(new FakeConsumer()), $transport);

        $client->postMessage('chat-1', 'hi', false);

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertArrayNotHasKey('trigger', $body);
    }
}
