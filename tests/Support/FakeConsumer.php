<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Support;

use EpicWP\Roundtable\Consumer;

/** A configurable Consumer test double. */
final class FakeConsumer implements Consumer
{
    /** @param array{key: string, activation_id: string}|null $licence */
    public function __construct(
        private bool $allowed = true,
        private string $subjectId = 'subject-1',
        private ?string $metadata = null,
        private ?string $clientVersion = null,
        private ?array $licence = null,
        private ?string $email = null,
    ) {}

    public function isUserAllowed(): bool { return $this->allowed; }
    public function subjectId(): string { return $this->subjectId; }
    public function metadata(): ?string { return $this->metadata; }
    public function clientVersion(): ?string { return $this->clientVersion; }
    /** @return array{key: string, activation_id: string}|null */
    public function licence(): ?array { return $this->licence; }
    public function email(): ?string { return $this->email; }
}
