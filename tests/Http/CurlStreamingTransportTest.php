<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Http;

use EpicWP\Roundtable\Http\CurlStreamingTransport;
use EpicWP\Roundtable\Http\StreamingTransport;
use EpicWP\Roundtable\Tests\Support\FakeStreamingTransport;
use EpicWP\Roundtable\Tests\TestCase;

final class CurlStreamingTransportTest extends TestCase
{
    public function test_fake_streaming_transport_replays_frames_and_returns_status(): void
    {
        $fake = new FakeStreamingTransport(200, ["data: {\"type\":\"a\"}", "data: {\"type\":\"b\"}"]);
        $seen = [];
        $status = $fake->stream('u', [], 'body', 30, function (string $f) use (&$seen) { $seen[] = $f; });
        self::assertSame(200, $status);
        self::assertSame(["data: {\"type\":\"a\"}", "data: {\"type\":\"b\"}"], $seen);
    }

    public function test_curl_streaming_transport_implements_the_interface(): void
    {
        self::assertInstanceOf(StreamingTransport::class, new CurlStreamingTransport());
    }
}
