<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\HubException;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class HubExceptionTest extends PHPUnitTestCase
{
    public function test_factories_carry_their_kind(): void
    {
        self::assertSame(HubException::BLOCKED, HubException::blocked()->kind());
        self::assertSame(HubException::CHAT_DISABLED, HubException::chatDisabled()->kind());
        self::assertSame(HubException::OVER_QUOTA, HubException::overQuota()->kind());
        self::assertSame(HubException::NETWORK, HubException::network('dns')->kind());
        self::assertSame(HubException::SERVER, HubException::server(503)->kind());
        self::assertSame(HubException::BAD_RESPONSE, HubException::badResponse('bad json')->kind());
    }

    public function test_is_a_runtime_exception(): void
    {
        self::assertInstanceOf(\RuntimeException::class, HubException::blocked());
    }
}
