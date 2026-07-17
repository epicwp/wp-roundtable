<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Support;

use EpicWP\Roundtable\Http\StreamingTransport;

/** A StreamingTransport double that replays a preset list of frames and returns a preset status. */
final class FakeStreamingTransport implements StreamingTransport
{
    /** @param list<string> $frames */
    public function __construct(
        private int $status,
        private array $frames,
    ) {}

    public function stream(string $url, array $headers, string $body, int $timeoutSeconds, callable $onFrame): int
    {
        foreach ($this->frames as $frame) {
            $onFrame($frame);
        }
        return $this->status;
    }
}
