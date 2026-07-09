<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Roundtable;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;

final class RoundtableTest extends TestCase
{
    public function test_mount_registers_the_rest_route_hook(): void
    {
        $this->expectNotToPerformAssertions();
        Functions\expect('add_action')->once()->with('rest_api_init', \Mockery::type('callable'));

        Roundtable::mount(new Config('pk', new FakeConsumer()), 'my-plugin-discussions');
    }
}
