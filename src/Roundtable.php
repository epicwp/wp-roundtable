<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

use EpicWP\Roundtable\Http\WpHttpTransport;

/**
 * The SDK's single entry point.
 *
 * A consuming plugin calls {@see Roundtable::mount()} once with its {@see Config} and the
 * admin menu slug the discussions screen lives under. This wires the REST proxy; the
 * visual chat UI (page render + assets) is a later SDK phase.
 */
final class Roundtable {
    /**
     * Bootstrap the SDK.
     *
     * @param Config $config   The SDK configuration.
     * @param string $menuSlug The admin page slug the discussions UI mounts on (used by the
     *                         later UI phase to enqueue assets on the right screen).
     */
    public static function mount( Config $config, string $menuSlug ): void {
        unset( $menuSlug ); // Reserved for the UI phase (asset enqueue on this screen).
        $controller = new MessageController( $config, new HubClient( $config, new WpHttpTransport() ) );
        \add_action( 'rest_api_init', array( $controller, 'register' ) );
    }
}
