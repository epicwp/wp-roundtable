<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests\Chat;

use EpicWP\Roundtable\Chat\SseParser;
use EpicWP\Roundtable\Event;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class SseParserTest extends PHPUnitTestCase
{
    public function test_parses_multiple_data_frames_in_order(): void
    {
        $body = "data: {\"type\":\"assistant_text\",\"text\":\"Hi\"}\n\n"
              . "data: {\"type\":\"result\",\"subtype\":\"ok\",\"is_error\":false}\n\n";

        $events = SseParser::parse($body);

        self::assertCount(2, $events);
        self::assertSame(Event::ASSISTANT_TEXT, $events[0]->type);
        self::assertSame('Hi', $events[0]->data['text']);
        self::assertSame(Event::RESULT, $events[1]->type);
    }

    public function test_skips_unparseable_frames_without_failing(): void
    {
        $body = "data: not json\n\n"
              . "data: {\"type\":\"assistant_text\",\"text\":\"ok\"}\n\n";

        $events = SseParser::parse($body);

        self::assertCount(1, $events);
        self::assertSame('ok', $events[0]->data['text']);
    }

    public function test_ignores_non_data_lines_and_blank_bodies(): void
    {
        self::assertSame([], SseParser::parse(''));
        self::assertSame([], SseParser::parse(": keep-alive comment\n\n"));
    }

    public function test_frame_missing_type_is_skipped(): void
    {
        $events = SseParser::parse("data: {\"text\":\"no type\"}\n\n");
        self::assertSame([], $events);
    }
}
