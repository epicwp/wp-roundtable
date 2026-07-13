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

final class HubClientListCommentsTest extends PHPUnitTestCase
{
    private function config(): Config
    {
        return new Config('pk_secret', new FakeConsumer());
    }

    public function test_gets_comments_for_case(): void
    {
        $body      = '[{"id":"cm1","case_id":"c1","author_handle":"h","body":"Hi","status":"active","created_at":"2026-07-01T00:00:00","updated_at":"2026-07-01T00:00:00"}]';
        $transport = new FakeTransport(200, $body);
        $client    = new HubClient($this->config(), $transport);

        $comments = $client->listComments('c1');

        self::assertSame('GET', $transport->lastMethod);
        self::assertSame(HubClient::HUB_URL . '/cases/c1/comments', $transport->lastUrl);
        self::assertSame('Bearer pk_secret', $transport->lastHeaders['Authorization']);
        self::assertSame('cm1', $comments[0]['id']);
    }

    public function test_uses_hub_base_url_override(): void
    {
        $transport = new FakeTransport(200, '[]');
        $config    = new Config('pk', new FakeConsumer(), hubBaseUrl: 'http://hub.test');
        $client    = new HubClient($config, $transport);

        $client->listComments('case-99');

        self::assertSame('http://hub.test/cases/case-99/comments', $transport->lastUrl);
    }

    public function test_maps_forbidden_to_blocked(): void
    {
        $client = new HubClient($this->config(), new FakeTransport(403, ''));

        $this->expectException(HubException::class);
        try {
            $client->listComments('c1');
        } catch (HubException $e) {
            self::assertSame(HubException::BLOCKED, $e->kind());
            throw $e;
        }
    }

    public function test_maps_non_array_json_to_bad_response(): void
    {
        $client = new HubClient($this->config(), new FakeTransport(200, 'null'));

        $this->expectException(HubException::class);
        try {
            $client->listComments('c1');
        } catch (HubException $e) {
            self::assertSame(HubException::BAD_RESPONSE, $e->kind());
            throw $e;
        }
    }

    public function test_maps_transport_failure_to_network(): void
    {
        $transport = new FakeTransport(throw: new TransportException('timeout'));
        $client    = new HubClient($this->config(), $transport);

        $this->expectException(HubException::class);
        try {
            $client->listComments('c1');
        } catch (HubException $e) {
            self::assertSame(HubException::NETWORK, $e->kind());
            throw $e;
        }
    }
}