<?php
declare(strict_types=1);

namespace EpicWP\Roundtable;

/**
 * One contract event from a chat turn (mirrors the hub's `agent/events.py`).
 *
 * `$data` is the decoded frame payload, verbatim. The event `type` is one of the
 * constants below; unknown types are preserved as-is.
 */
final class Event {
    public const ASSISTANT_TEXT = 'assistant_text';
    public const THINKING       = 'thinking';
    public const TOOL_STEP      = 'tool_step';
    public const TOOL_RESULT    = 'tool_result';
    public const PROGRESS       = 'progress';
    public const RESULT         = 'result';
    public const ERROR          = 'error';

    /**
     * Creates the event.
     *
     * @param string               $type The event type (one of the class constants).
     * @param array<string, mixed> $data The decoded frame payload.
     */
    public function __construct(
        public readonly string $type,
        public readonly array $data,
    ) {
    }
}
