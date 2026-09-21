<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class ConfigTest extends PHPUnitTestCase
{
    public function test_exposes_its_values_with_defaults(): void
    {
        $consumer = new FakeConsumer();
        $config   = new Config('pk_live_123', $consumer);

        self::assertSame('pk_live_123', $config->projectApiKey);
        self::assertSame($consumer, $config->consumer);
        self::assertSame('Clara', $config->agentName);
        self::assertNull($config->agentAvatarUrl);
        self::assertSame(30, $config->timeoutSeconds);
        self::assertNull($config->hubBaseUrl);
        self::assertSame('', $config->projectName);
        self::assertFalse($config->beta);
        self::assertFalse($config->enableChat);
        self::assertNull($config->attribution);
    }

    public function test_accepts_overrides(): void
    {
        $config = new Config('pk', new FakeConsumer(), 'Sage', 'https://x/a.png', 45, 'https://staging');
        self::assertSame('Sage', $config->agentName);
        self::assertSame('https://x/a.png', $config->agentAvatarUrl);
        self::assertSame(45, $config->timeoutSeconds);
        self::assertSame('https://staging', $config->hubBaseUrl);
    }

    public function test_accepts_a_project_name(): void
    {
        $config = new Config('pk', new FakeConsumer(), 'Sage', projectName: 'Polylang AI Automatic Translation');

        self::assertSame('Sage', $config->agentName);
        self::assertSame('Polylang AI Automatic Translation', $config->projectName);
    }

    public function test_accepts_a_beta_flag(): void
    {
        $config = new Config('pk', new FakeConsumer(), beta: true);

        self::assertTrue($config->beta);
    }

    public function test_accepts_an_enable_chat_flag(): void
    {
        $config = new Config('pk', new FakeConsumer(), enableChat: true);

        self::assertTrue($config->enableChat);
    }

    public function test_accepts_an_attribution_line(): void
    {
        $config = new Config('pk', new FakeConsumer(), attribution: 'Community powered by Acme');

        self::assertSame('Community powered by Acme', $config->attribution);
    }
}
