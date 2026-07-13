<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

use EpicWP\Roundtable\Chat\SseParser;
use EpicWP\Roundtable\Http\Transport;

/**
 * Talks to the Roundtable hub over an injected {@see Transport}.
 *
 * The only unit that performs I/O to the hub. `postMessage` sends one chat turn, reads the
 * buffered SSE response, and returns typed events. HTTP error statuses and transport
 * failures become a typed {@see HubException}; the project key never appears in an error.
 */
final class HubClient {
    /** EpicWP's hosted multi-tenant hub. Overridable per {@see Config::$hubBaseUrl} for dev/staging. */
    public const HUB_URL = 'https://hub.roundtable.epicwp.com';

    /**
     * Creates the client.
     *
     * @param Config    $config    The SDK configuration (project key, consumer, hub URL override).
     * @param Transport $transport The injected transport seam used to reach the hub.
     */
    public function __construct(
        private Config $config,
        private Transport $transport,
    ) {
    }

    /**
     * Post one chat message and return the turn's parsed events.
     *
     * @param string $chatId      The consumer-supplied chat/session id (resumes the hub session).
     * @param string $message     The user's message (markdown; sent verbatim).
     * @param bool   $isFirstTurn Whether this is the first turn of the chat — only then are the
     *                            health-report `metadata` and `client_version` included.
     *
     * @return TurnResult The ordered events.
     *
     * @throws \EpicWP\Roundtable\HubException On a gate refusal (403/429), a server error (5xx), a
     *                  malformed response, or a network failure. The project key is never in the message.
     */
    public function postMessage( string $chatId, string $message, bool $isFirstTurn ): TurnResult {
        $url  = ( $this->config->hubBaseUrl ?? self::HUB_URL ) . '/chats/' . $chatId . '/messages';
        $body = $this->buildBody( $message, $isFirstTurn );

        try {
            $response = $this->transport->post(
                $url,
                array(
                    'Accept'        => 'text/event-stream',
                    'Authorization' => 'Bearer ' . $this->config->projectApiKey,
                    'Content-Type'  => 'application/json',
                ),
                $body,
                $this->config->timeoutSeconds,
            );
        } catch ( \EpicWP\Roundtable\Http\TransportException $e ) {
            // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- internal RuntimeException message (transport error string), never rendered as HTML.
            throw \EpicWP\Roundtable\HubException::network( $e->getMessage() );
        }

        $this->guardStatus( $response->status );

        return new TurnResult( SseParser::parse( $response->body ) );
    }

    /**
     * List public cases from the hub browse API.
     *
     * @param array<string, int|string> $query Optional hub query params: `type`, `q`, `sort`, `limit`, `offset`.
     *
     * @return list<array<string, mixed>> The hub's CaseListItem array.
     *
     * @throws \EpicWP\Roundtable\HubException On a gate refusal (403/429), a server error (5xx), a
     *                  malformed response, or a network failure. The project key is never in the message.
     */
    public function listCases( array $query = array() ): array {
        $url = $this->casesUrl( $query );

        try {
            $response = $this->transport->get(
                $url,
                array( 'Authorization' => 'Bearer ' . $this->config->projectApiKey ),
                $this->config->timeoutSeconds,
            );
        } catch ( \EpicWP\Roundtable\Http\TransportException $e ) {
            // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- internal RuntimeException message (transport error string), never rendered as HTML.
            throw \EpicWP\Roundtable\HubException::network( $e->getMessage() );
        }

        $this->guardStatus( $response->status );

        // phpcs:ignore WordPress.WP.AlternativeFunctions.json_decode_json_decode -- pure-PHP core class, no WordPress dependency by design.
        $decoded = \json_decode( $response->body, true );
        if ( ! \is_array( $decoded ) ) {
            throw \EpicWP\Roundtable\HubException::badResponse( 'cases list was not a JSON array' );
        }

        return $decoded;
    }

    /**
     * Build the hub browse URL for `GET /cases`.
     *
     * @param array<string, int|string> $query Optional hub query params.
     *
     * @return string The absolute URL (with query string when params are present).
     */
    private function casesUrl( array $query ): string {
        $base   = ( $this->config->hubBaseUrl ?? self::HUB_URL ) . '/cases';
        $params = $this->casesQueryParams( $query );
        if ( array() === $params ) {
            return $base;
        }
        return $base . '?' . \http_build_query( $params );
    }

    /**
     * Keep only the hub-allowed, non-empty browse query params.
     *
     * @param array<string, int|string> $query The raw query params.
     *
     * @return array<string, int|string> The filtered params.
     */
    private function casesQueryParams( array $query ): array {
        $params = array();
        foreach ( array( 'type', 'q', 'sort', 'limit', 'offset' ) as $key ) {
            if ( ! isset( $query[ $key ] ) || '' === (string) $query[ $key ] ) {
                continue;
            }
            $params[ $key ] = $query[ $key ];
        }
        return $params;
    }

    /**
     * Guards the response status, throwing on any non-2xx result.
     *
     * @param int $status The HTTP status code returned by the transport.
     *
     * @throws \EpicWP\Roundtable\HubException When the status is not a success.
     */
    private function guardStatus( int $status ): void {
        if ( $status >= 200 && $status < 300 ) {
            return;
        }
        throw match ( $status ) {
            403 => \EpicWP\Roundtable\HubException::blocked(),
            429 => \EpicWP\Roundtable\HubException::overQuota(),
            default => \EpicWP\Roundtable\HubException::server( $status ),
        };
    }

    /**
     * Builds the JSON-encoded request body for a chat turn.
     *
     * @param string $message     The user's message.
     * @param bool   $isFirstTurn Whether to include the first-turn `metadata`/`client_version` context.
     *
     * @return string The JSON-encoded body.
     */
    private function buildBody( string $message, bool $isFirstTurn ): string {
        $payload = array(
            'message'    => $message,
            'subject_id' => $this->config->consumer->subjectId(),
        );
        if ( $isFirstTurn ) {
            $metadata = $this->config->consumer->metadata();
            if ( null !== $metadata ) {
                $payload['metadata'] = $metadata;
            }
            $clientVersion = $this->config->consumer->clientVersion();
            if ( null !== $clientVersion ) {
                $payload['client_version'] = $clientVersion;
            }
        }
        // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- pure-PHP core class, no WordPress dependency by design; wp_json_encode() is unavailable here.
        return (string) \json_encode( $payload );
    }
}
