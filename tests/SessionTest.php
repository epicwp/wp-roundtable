<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Session;

final class SessionTest extends TestCase
{
    public function test_chat_id_mints_and_persists_when_absent(): void
    {
        Functions\when('get_user_meta')->justReturn('');
        Functions\when('wp_generate_uuid4')->justReturn('uuid-123');
        Functions\expect('update_user_meta')->once()->with(7, 'roundtable_chat_id', 'uuid-123');

        self::assertSame('uuid-123', (new Session(7))->chatId());
    }

    public function test_chat_id_returns_existing_without_reminting(): void
    {
        Functions\when('get_user_meta')->justReturn('existing-uuid');
        Functions\expect('update_user_meta')->never();

        self::assertSame('existing-uuid', (new Session(7))->chatId());
    }

    public function test_is_primed_reflects_the_flag(): void
    {
        Functions\when('get_user_meta')->justReturn('1');
        self::assertTrue((new Session(7))->isPrimed());
    }

    public function test_mark_primed_sets_the_flag(): void
    {
        $this->expectNotToPerformAssertions();
        Functions\expect('update_user_meta')->once()->with(7, 'roundtable_chat_primed', '1');
        (new Session(7))->markPrimed();
    }

    public function test_reset_clears_id_and_flag(): void
    {
        $this->expectNotToPerformAssertions();
        Functions\expect('delete_user_meta')->once()->with(7, 'roundtable_chat_id');
        Functions\expect('delete_user_meta')->once()->with(7, 'roundtable_chat_primed');
        (new Session(7))->reset();
    }
}
