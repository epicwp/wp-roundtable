<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

use EpicWP\Roundtable\Http\WpHttpTransport;

/**
 * The SDK's single entry point.
 *
 * A consuming plugin calls {@see Roundtable::mount()} once with its {@see Config} and the
 * parent admin menu slug the "Community" submenu attaches to. This wires the admin page
 * and both REST routes.
 */
final class Roundtable {
    /**
     * Bootstrap the SDK.
     *
     * @param Config $config   The SDK configuration.
     * @param string $menuSlug The parent admin menu slug the "Community" submenu attaches to.
     */
    public static function mount( Config $config, string $menuSlug ): void {
        $page = new Admin\Page( $config, $menuSlug );
        \add_action( 'admin_menu', array( $page, 'registerMenu' ) );
        \add_action( 'admin_enqueue_scripts', array( $page, 'enqueue' ) );

        $message = new MessageController( $config, new HubClient( $config, new WpHttpTransport() ) );
        $session = new SessionController( $config );
        \add_action( 'rest_api_init', array( $message, 'register' ) );
        \add_action( 'rest_api_init', array( $session, 'register' ) );
    }
}
