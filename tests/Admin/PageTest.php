<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Admin;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Admin\Page;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\TestCase;

final class PageTest extends TestCase
{
    private function page(): Page
    {
        return new Page(new Config('pk_secret', new FakeConsumer(), 'Sage'), 'tools.php');
    }

    public function test_register_menu_adds_a_community_submenu(): void
    {
        $this->expectNotToPerformAssertions();
        Functions\when('__')->returnArg();
        Functions\expect('add_submenu_page')->once()->with(
            'tools.php', 'Community', 'Community', 'read', 'roundtable-community', \Mockery::type('array'),
        );
        $this->page()->registerMenu();
    }

    public function test_enqueue_skips_other_screens(): void
    {
        $this->expectNotToPerformAssertions();
        Functions\expect('wp_enqueue_script')->never();
        $this->page()->enqueue('edit.php');
    }

    public function test_enqueue_loads_bundle_and_localizes_config_on_our_screen(): void
    {
        $this->expectNotToPerformAssertions();
        Functions\when('wp_enqueue_style')->justReturn(true);
        Functions\when('plugins_url')->justReturn('http://x/wp-content/plugins/host/assets/dist/asset');
        Functions\when('rest_url')->justReturn('http://x/wp-json/roundtable/v1');
        Functions\when('wp_create_nonce')->justReturn('nonce123');
        Functions\expect('wp_enqueue_script')->once();
        Functions\expect('wp_localize_script')->once()->with(
            'roundtable',
            'RoundtableConfig',
            \Mockery::on(static fn ($d) => 'nonce123' === $d['nonce'] && 'Sage' === $d['agentName']),
        );
        $this->page()->enqueue('tools_page_roundtable-community');
    }

    public function test_render_outputs_the_app_container(): void
    {
        Functions\when('esc_attr__')->returnArg();
        \ob_start();
        $this->page()->render();
        $html = (string) \ob_get_clean();
        self::assertStringContainsString('id="roundtable-app"', $html);
    }
}
