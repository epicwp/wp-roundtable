<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

/** Immutable SDK configuration, built once by the consumer at bootstrap. */
final class Config {
    /**
     * Creates the configuration.
     *
     * @param string      $projectApiKey  Per-project (multi-tenant) bearer key; stays server-side.
     * @param Consumer    $consumer       The plugin's licensing/identity boundary.
     * @param string      $agentName      Display name for the agent (local; no /project/config yet).
     * @param string|null $agentAvatarUrl Optional avatar URL for the agent.
     * @param int         $timeoutSeconds HTTP timeout for a buffered turn.
     * @param string|null $hubBaseUrl     Dev/staging override ONLY; null uses the baked-in SaaS URL.
     * @param string      $projectName    The consuming product's display name; '' hides it in the UI.
     */
    public function __construct(
        public readonly string $projectApiKey,
        public readonly Consumer $consumer,
        public readonly string $agentName = 'Roundtable',
        public readonly ?string $agentAvatarUrl = null,
        public readonly int $timeoutSeconds = 30,
        public readonly ?string $hubBaseUrl = null,
        public readonly string $projectName = '',
    ) {
    }
}
