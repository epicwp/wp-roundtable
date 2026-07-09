<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Support;

use EpicWP\Roundtable\Http\Transport;
use EpicWP\Roundtable\Http\TransportException;
use EpicWP\Roundtable\Http\TransportResponse;

/** A Transport double that records the last call and returns a canned response (or throws). */
final class FakeTransport implements Transport
{
    public ?string $lastUrl = null;
    /** @var array<string, string>|null */
    public ?array $lastHeaders = null;
    public ?string $lastBody = null;

    public function __construct(
        private int $status = 200,
        private string $responseBody = '',
        private ?TransportException $throw = null,
    ) {}

    public function post(string $url, array $headers, string $body, int $timeoutSeconds): TransportResponse
    {
        $this->lastUrl = $url;
        $this->lastHeaders = $headers;
        $this->lastBody = $body;
        if ($this->throw !== null) {
            throw $this->throw;
        }
        return new TransportResponse($this->status, $this->responseBody);
    }
}
