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

final class HubClientProjectConfigTest extends PHPUnitTestCase
{
    private function config(): Config
    {
        return new Config('pk_secret', new FakeConsumer());
    }

    public function test_gets_the_project_display_config(): void
    {
        $body      = '{"agent_name":"Sage","project_name":"Widget Corp","initial_message":"Hi!"}';
        $transport = new FakeTransport(200, $body);
        $client    = new HubClient($this->config(), $transport);

        $config = $client->getProjectConfig();

        self::assertSame('GET', $transport->lastMethod);
        self::assertSame(HubClient::HUB_URL . '/project/config', $transport->lastUrl);
        self::assertSame('Bearer pk_secret', $transport->lastHeaders['Authorization']);
        self::assertSame('Sage', $config['agent_name']);
        self::assertSame('Widget Corp', $config['project_name']);
        self::assertSame('Hi!', $config['initial_message']);
    }

    public function test_uses_hub_base_url_override(): void
    {
        $transport = new FakeTransport(200, '{}');
        $config    = new Config('pk', new FakeConsumer(), hubBaseUrl: 'http://hub.test');
        $client    = new HubClient($config, $transport);

        $client->getProjectConfig();

        self::assertSame('http://hub.test/project/config', $transport->lastUrl);
    }

    public function test_maps_forbidden_to_blocked(): void
    {
        $client = new HubClient($this->config(), new FakeTransport(403, ''));

        $this->expectException(HubException::class);
        try {
            $client->getProjectConfig();
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
            $client->getProjectConfig();
        } catch (HubException $e) {
            self::assertSame(HubException::NETWORK, $e->kind());
            throw $e;
        }
    }
}
