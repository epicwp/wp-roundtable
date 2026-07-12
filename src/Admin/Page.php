<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Admin;

use EpicWP\Roundtable\Config;

/** The "Community" admin page: registers the submenu, enqueues the bundle, renders the root container. */
final class Page {
    /** The admin page slug. */
    public const PAGE_SLUG = 'roundtable-community';
    /** The shared script/style handle. */
    public const HANDLE = 'roundtable';

    /**
     * Creates the page.
     *
     * @param Config $config   The SDK configuration.
     * @param string $menuSlug The parent menu slug the host already registered (submenu parent).
     */
    public function __construct(
        private Config $config,
        private string $menuSlug,
    ) {
    }

    /** Register the "Community" submenu. Call on the `admin_menu` action. */
    public function registerMenu(): void {
        \add_submenu_page(
            $this->menuSlug,
            \__( 'Community', 'wp-roundtable' ),
            \__( 'Community', 'wp-roundtable' ),
            'read',
            self::PAGE_SLUG,
            array( $this, 'render' ),
        );
    }

    /**
     * Enqueue the bundle + localize config, only on our page.
     *
     * @param string $hookSuffix The current admin screen's hook suffix.
     */
    public function enqueue( string $hookSuffix ): void {
        if ( ! \str_ends_with( $hookSuffix, '_page_' . self::PAGE_SLUG ) ) {
            return;
        }
        \wp_enqueue_style( self::HANDLE, $this->assetUrl( 'roundtable.css' ), array(), $this->version() );
        \wp_enqueue_script( self::HANDLE, $this->assetUrl( 'roundtable.js' ), array(), $this->version(), true );
        \wp_localize_script(
            self::HANDLE,
            'RoundtableConfig',
            array(
                'agentName' => $this->config->agentName,
                'nonce'     => \wp_create_nonce( 'wp_rest' ),
                'restUrl'   => \rest_url( 'roundtable/v1' ),
            ),
        );
    }

    /** Render the admin page: a wrapper and the Preact root container. */
    public function render(): void {
        echo '<div class="wrap"><div id="roundtable-app" data-loading="'
            . \esc_attr__( 'Loading…', 'wp-roundtable' ) . '"></div></div>';
    }

    /**
     * Resolve a built asset's URL from this file's location.
     *
     * @param string $file The dist filename (e.g. `roundtable.js`).
     *
     * @return string The public URL, or an empty string if it cannot be resolved.
     */
    private function assetUrl( string $file ): string {
        $path = \dirname( __DIR__, 2 ) . '/assets/dist/' . $file; // package-root/assets/dist/<file>.
        if ( \defined( 'WP_CONTENT_DIR' ) && \str_starts_with( $path, (string) \WP_CONTENT_DIR ) ) {
            return \content_url( \substr( $path, \strlen( (string) \WP_CONTENT_DIR ) ) );
        }
        return \plugins_url( 'assets/dist/' . $file, \dirname( __DIR__, 1 ) );
    }

    /**
     * A cache-busting version derived from the built file's mtime.
     *
     * @return string The version string (falls back to `'1'`).
     */
    private function version(): string {
        $js    = \dirname( __DIR__, 2 ) . '/assets/dist/roundtable.js';
        $mtime = \is_file( $js ) ? (string) \filemtime( $js ) : '';
        return '' !== $mtime ? $mtime : '1';
    }
}
