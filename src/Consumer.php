<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

/**
 * The consuming plugin's licensing/identity boundary.
 *
 * The SDK calls these per request to decide whether a request may be made and to supply
 * per-user context; it never hardcodes any of it. All methods run server-side.
 */
interface Consumer {
    /**
     * Whether the current user may use Roundtable (e.g. holds a valid licence).
     *
     * The SDK makes NO hub request when this returns false.
     *
     * @return bool True to allow the request; false to refuse before any hub call.
     */
    public function isUserAllowed(): bool;

    /**
     * A stable, opaque per-user handle (e.g. derived from the licence).
     *
     * Never a real name; the hub mints its pseudonymous handle from this value.
     *
     * @return string The opaque subject id.
     */
    public function subjectId(): string;

    /**
     * Opaque ambient context sent silently on the first turn (the WP site health report).
     *
     * The agent uses it without announcing it. Return null to send none.
     *
     * @return string|null The metadata string, or null.
     */
    public function metadata(): ?string;

    /**
     * The consuming plugin's version, sent as the top-level `client_version` field.
     *
     * @return string|null The version string, or null.
     */
    public function clientVersion(): ?string;
}
