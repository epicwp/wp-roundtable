<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Admin;

use Brain\Monkey\Functions;
use EpicWP\Roundtable\Admin\Page;
use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\Http\TransportException;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use EpicWP\Roundtable\Tests\TestCase;

final class PageTest extends TestCase
{
    private function config(): Config
    {
        return new Config(
            'pk_secret',
            new FakeConsumer(),
            'Sage',
            projectName: 'Polylang AI Automatic Translation',
        );
    }

    private function page(?HubClient $hub = null): Page
    {
        $hub ??= new HubClient($this->config(), new FakeTransport(200, '{}'));
        return new Page($this->config(), 'tools.php', $hub);
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

    public function test_enqueue_enqueues_the_wp_editor(): void
    {
        $this->expectNotToPerformAssertions();
        Functions\when('wp_enqueue_style')->justReturn(true);
        Functions\when('plugins_url')->justReturn('http://x/wp-content/plugins/host/assets/dist/asset');
        Functions\when('rest_url')->justReturn('http://x/wp-json/roundtable/v1');
        Functions\when('wp_create_nonce')->justReturn('nonce123');
        Functions\when('wp_enqueue_script')->justReturn(true);
        Functions\when('wp_localize_script')->justReturn(true);
        Functions\expect('wp_enqueue_editor')->once();
        $this->page()->enqueue('tools_page_roundtable-community');
    }

    public function test_enqueue_uses_hub_display_config_when_available(): void
    {
        $this->expectNotToPerformAssertions();
        $body = '{"agent_name":"HubSage","project_name":"Hub Project","initial_message":"Hi from the hub.","chat_disabled":true}';
        $hub  = new HubClient($this->config(), new FakeTransport(200, $body));
        Functions\when('wp_enqueue_editor')->justReturn(null);
        Functions\when('wp_enqueue_style')->justReturn(true);
        Functions\when('plugins_url')->justReturn('http://x/wp-content/plugins/host/assets/dist/asset');
        Functions\when('rest_url')->justReturn('http://x/wp-json/roundtable/v1');
        Functions\when('wp_create_nonce')->justReturn('nonce123');
        Functions\expect('wp_enqueue_script')->once();
        Functions\expect('wp_localize_script')->once()->with(
            'roundtable',
            'RoundtableConfig',
            \Mockery::on(static fn ($d) => 'nonce123' === $d['nonce']
                && 'HubSage' === $d['agentName']
                && 'Hub Project' === $d['projectName']
                && 'Hi from the hub.' === $d['initialMessage']
                && false === $d['beta']
                && true === $d['chatDisabled']
                && false === $d['chatEnabled']),
        );
        $this->page($hub)->enqueue('tools_page_roundtable-community');
    }

    public function test_enqueue_passes_the_beta_flag_through_when_configured(): void
    {
        $this->expectNotToPerformAssertions();
        $config = new Config('pk_secret', new FakeConsumer(), 'Sage', beta: true);
        $hub    = new HubClient($config, new FakeTransport(200, '{}'));
        Functions\when('wp_enqueue_editor')->justReturn(null);
        Functions\when('wp_enqueue_style')->justReturn(true);
        Functions\when('plugins_url')->justReturn('http://x/wp-content/plugins/host/assets/dist/asset');
        Functions\when('rest_url')->justReturn('http://x/wp-json/roundtable/v1');
        Functions\when('wp_create_nonce')->justReturn('nonce123');
        Functions\expect('wp_enqueue_script')->once();
        Functions\expect('wp_localize_script')->once()->with(
            'roundtable',
            'RoundtableConfig',
            \Mockery::on(static fn ($d) => true === $d['beta']),
        );
        (new Page($config, 'tools.php', $hub))->enqueue('tools_page_roundtable-community');
    }

    public function test_enqueue_passes_the_chat_enabled_flag_through_when_configured(): void
    {
        $this->expectNotToPerformAssertions();
        $config = new Config('pk_secret', new FakeConsumer(), 'Sage', enableChat: true);
        $hub    = new HubClient($config, new FakeTransport(200, '{}'));
        Functions\when('wp_enqueue_editor')->justReturn(null);
        Functions\when('wp_enqueue_style')->justReturn(true);
        Functions\when('plugins_url')->justReturn('http://x/wp-content/plugins/host/assets/dist/asset');
        Functions\when('rest_url')->justReturn('http://x/wp-json/roundtable/v1');
        Functions\when('wp_create_nonce')->justReturn('nonce123');
        Functions\expect('wp_enqueue_script')->once();
        Functions\expect('wp_localize_script')->once()->with(
            'roundtable',
            'RoundtableConfig',
            \Mockery::on(static fn ($d) => true === $d['chatEnabled']),
        );
        (new Page($config, 'tools.php', $hub))->enqueue('tools_page_roundtable-community');
    }

    public function test_enqueue_passes_the_attribution_line_through_when_configured(): void
    {
        $this->expectNotToPerformAssertions();
        $config = new Config('pk_secret', new FakeConsumer(), 'Sage', attribution: 'Community powered by Acme');
        $hub    = new HubClient($config, new FakeTransport(200, '{}'));
        Functions\when('wp_enqueue_editor')->justReturn(null);
        Functions\when('wp_enqueue_style')->justReturn(true);
        Functions\when('plugins_url')->justReturn('http://x/wp-content/plugins/host/assets/dist/asset');
        Functions\when('rest_url')->justReturn('http://x/wp-json/roundtable/v1');
        Functions\when('wp_create_nonce')->justReturn('nonce123');
        Functions\expect('wp_enqueue_script')->once();
        Functions\expect('wp_localize_script')->once()->with(
            'roundtable',
            'RoundtableConfig',
            \Mockery::on(static fn ($d) => 'Community powered by Acme' === $d['attribution']),
        );
        (new Page($config, 'tools.php', $hub))->enqueue('tools_page_roundtable-community');
    }

    public function test_enqueue_omits_attribution_by_default(): void
    {
        $this->expectNotToPerformAssertions();
        Functions\when('wp_enqueue_editor')->justReturn(null);
        Functions\when('wp_enqueue_style')->justReturn(true);
        Functions\when('plugins_url')->justReturn('http://x/wp-content/plugins/host/assets/dist/asset');
        Functions\when('rest_url')->justReturn('http://x/wp-json/roundtable/v1');
        Functions\when('wp_create_nonce')->justReturn('nonce123');
        Functions\expect('wp_enqueue_script')->once();
        Functions\expect('wp_localize_script')->once()->with(
            'roundtable',
            'RoundtableConfig',
            \Mockery::on(static fn ($d) => null === $d['attribution']),
        );
        $this->page()->enqueue('tools_page_roundtable-community');
    }

    public function test_enqueue_falls_back_to_local_config_when_hub_call_fails(): void
    {
        $this->expectNotToPerformAssertions();
        $hub = new HubClient($this->config(), new FakeTransport(throw: new TransportException('timeout')));
        Functions\when('wp_enqueue_editor')->justReturn(null);
        Functions\when('wp_enqueue_style')->justReturn(true);
        Functions\when('plugins_url')->justReturn('http://x/wp-content/plugins/host/assets/dist/asset');
        Functions\when('rest_url')->justReturn('http://x/wp-json/roundtable/v1');
        Functions\when('wp_create_nonce')->justReturn('nonce123');
        Functions\expect('wp_enqueue_script')->once();
        Functions\expect('wp_localize_script')->once()->with(
            'roundtable',
            'RoundtableConfig',
            \Mockery::on(static fn ($d) => 'Sage' === $d['agentName']
                && 'Polylang AI Automatic Translation' === $d['projectName']
                && '' === $d['initialMessage']
                && false === $d['chatDisabled']
                && false === $d['chatEnabled']),
        );
        $this->page($hub)->enqueue('tools_page_roundtable-community');
    }

    public function test_render_outputs_the_app_container(): void
    {
        Functions\when('esc_attr__')->returnArg();
        \ob_start();
        $this->page()->render();
        $html = (string) \ob_get_clean();
        self::assertStringContainsString('id="roundtable-app"', $html);
    }

    public function test_suppress_admin_notices_removes_them_on_our_screen(): void
    {
        $this->expectNotToPerformAssertions();
        Functions\when('get_current_screen')->justReturn((object) ['id' => 'tools_page_roundtable-community']);
        Functions\expect('remove_all_actions')->once()->with('admin_notices');
        Functions\expect('remove_all_actions')->once()->with('all_admin_notices');
        $this->page()->suppressAdminNotices();
    }

    public function test_suppress_admin_notices_leaves_other_screens_untouched(): void
    {
        $this->expectNotToPerformAssertions();
        Functions\when('get_current_screen')->justReturn((object) ['id' => 'edit-post']);
        Functions\expect('remove_all_actions')->never();
        $this->page()->suppressAdminNotices();
    }

    public function test_suppress_admin_notices_does_nothing_without_a_current_screen(): void
    {
        $this->expectNotToPerformAssertions();
        Functions\when('get_current_screen')->justReturn(null);
        Functions\expect('remove_all_actions')->never();
        $this->page()->suppressAdminNotices();
    }
}
