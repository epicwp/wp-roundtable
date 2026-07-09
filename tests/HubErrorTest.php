<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\HubError;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class HubErrorTest extends PHPUnitTestCase
{
    public function test_factories_carry_their_kind(): void
    {
        self::assertSame(HubError::BLOCKED, HubError::blocked()->kind());
        self::assertSame(HubError::OVER_QUOTA, HubError::overQuota()->kind());
        self::assertSame(HubError::NETWORK, HubError::network('dns')->kind());
        self::assertSame(HubError::SERVER, HubError::server(503)->kind());
        self::assertSame(HubError::BAD_RESPONSE, HubError::badResponse('bad json')->kind());
    }

    public function test_is_a_runtime_exception(): void
    {
        self::assertInstanceOf(\RuntimeException::class, HubError::blocked());
    }
}
