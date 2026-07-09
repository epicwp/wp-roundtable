<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Support;

use EpicWP\Roundtable\Consumer;

/** A configurable Consumer test double. */
final class FakeConsumer implements Consumer
{
    public function __construct(
        private bool $allowed = true,
        private string $subjectId = 'subject-1',
        private ?string $metadata = null,
        private ?string $clientVersion = null,
    ) {}

    public function isUserAllowed(): bool { return $this->allowed; }
    public function subjectId(): string { return $this->subjectId; }
    public function metadata(): ?string { return $this->metadata; }
    public function clientVersion(): ?string { return $this->clientVersion; }
}
