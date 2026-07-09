<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

/**
 * The nonce-, capability- and licence-gated REST proxy the (later) chat UI calls.
 *
 * Registers `POST /roundtable/v1/message`. Its permission callback enforces the three
 * gates before any hub call; `handle` resolves the user's session, runs one turn through
 * {@see HubClient}, and returns the events as JSON (or a structured error).
 */
final class MessageController {
    public const ROUTE_NAMESPACE = 'roundtable/v1';
    public const ROUTE           = '/message';

    /**
     * Creates the controller.
     *
     * @param Config    $config    The SDK configuration (licence gate lives on `$config->consumer`).
     * @param HubClient $hubClient The client used to run a chat turn.
     */
    public function __construct(
        private Config $config,
        private HubClient $hubClient,
    ) {
    }

    /** Register the REST route. Call on the `rest_api_init` action. */
    public function register(): void {
        \register_rest_route(
            self::ROUTE_NAMESPACE,
            self::ROUTE,
            array(
                'callback'            => array( $this, 'handle' ),
                'methods'             => 'POST',
                'permission_callback' => array( $this, 'permission' ),
            ),
        );
    }

    /**
     * Gate a request: valid REST nonce, the required capability, and a valid licence.
     *
     * @param \WP_REST_Request<array<string, mixed>> $request The incoming request.
     *
     * @return bool True to proceed; false to refuse (403) before any hub call.
     */
    public function permission( // phpcs:ignore Squiz.Commenting.FunctionComment.IncorrectTypeHint -- `\WP_REST_Request<array<string, mixed>>` is a PHPStan generic; the native param type stays `\WP_REST_Request`.
        \WP_REST_Request $request,
    ): bool {
        $nonce = (string) $request->get_header( 'X-WP-Nonce' );
        if ( false === \wp_verify_nonce( $nonce, 'wp_rest' ) ) {
            return false;
        }
        if ( ! \current_user_can( 'read' ) ) {
            return false;
        }
        return $this->config->consumer->isUserAllowed();
    }

    /**
     * Run one chat turn and return its events.
     *
     * @param \WP_REST_Request<array<string, mixed>> $request The incoming request.
     *
     * @return \WP_REST_Response The events payload, or a structured error.
     */
    public function handle( // phpcs:ignore Squiz.Commenting.FunctionComment.IncorrectTypeHint -- `\WP_REST_Request<array<string, mixed>>` is a PHPStan generic; the native param type stays `\WP_REST_Request`.
        \WP_REST_Request $request,
    ): \WP_REST_Response {
        $message = (string) $request->get_param( 'message' );
        $session = new Session( (int) \wp_get_current_user()->ID );

        try {
            $isFirstTurn = ! $session->isPrimed();
            $result      = $this->hubClient->postMessage( $session->chatId(), $message, $isFirstTurn );
            if ( $isFirstTurn ) {
                $session->markPrimed();
            }
        } catch ( \EpicWP\Roundtable\HubException $e ) {
            return new \WP_REST_Response(
                array( 'error' => array( 'kind' => $e->kind() ) ),
                $this->statusFor( $e ),
            );
        }

        return new \WP_REST_Response( array( 'events' => $this->serialize( $result ) ), 200 );
    }

    /**
     * Serializes a turn's events into the REST response shape.
     *
     * @param TurnResult $result The turn's parsed events.
     *
     * @return list<array{type: string, data: array<string, mixed>}>
     */
    private function serialize( TurnResult $result ): array {
        return \array_map(
            static fn( Event $e ): array => array(
                'data' => $e->data,
                'type' => $e->type,
            ),
            $result->events,
        );
    }

    /**
     * Maps a hub exception's kind to the HTTP status the response should carry.
     *
     * @param \EpicWP\Roundtable\HubException $error The caught exception.
     *
     * @return int The HTTP status code.
     */
    private function statusFor( \EpicWP\Roundtable\HubException $error ): int {
        return match ( $error->kind() ) {
            \EpicWP\Roundtable\HubException::BLOCKED => 403,
            \EpicWP\Roundtable\HubException::OVER_QUOTA => 429,
            default => 502,
        };
    }
}
