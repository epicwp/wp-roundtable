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

final class HubClientListCasesTest extends PHPUnitTestCase
{
    private function config(): Config
    {
        return new Config('pk_secret', new FakeConsumer());
    }

    public function test_gets_cases_with_query_string(): void
    {
        $body      = '[{"id":"c1","title":"T","type":"bug","status":"open","summary":"s","author_handle":"h","net":3,"created_at":"2026-07-01T00:00:00"}]';
        $transport = new FakeTransport(200, $body);
        $client    = new HubClient($this->config(), $transport);

        $cases = $client->listCases(['sort' => 'top', 'limit' => 10]);

        self::assertSame('GET', $transport->lastMethod);
        self::assertSame(HubClient::HUB_URL . '/cases?sort=top&limit=10', $transport->lastUrl);
        self::assertSame('Bearer pk_secret', $transport->lastHeaders['Authorization']);
        self::assertSame('c1', $cases[0]['id']);
    }

    public function test_uses_hub_base_url_override(): void
    {
        $transport = new FakeTransport(200, '[]');
        $config    = new Config('pk', new FakeConsumer(), hubBaseUrl: 'http://hub.test');
        $client    = new HubClient($config, $transport);

        $client->listCases();

        self::assertSame('http://hub.test/cases', $transport->lastUrl);
    }

    public function test_maps_forbidden_to_blocked(): void
    {
        $client = new HubClient($this->config(), new FakeTransport(403, ''));

        $this->expectException(HubException::class);
        $this->expectExceptionCode(0);
        try {
            $client->listCases();
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
            $client->listCases();
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
            $client->listCases();
        } catch (HubException $e) {
            self::assertSame(HubException::NETWORK, $e->kind());
            throw $e;
        }
    }
}