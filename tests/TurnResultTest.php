<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\Event;
use EpicWP\Roundtable\TurnResult;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class TurnResultTest extends PHPUnitTestCase
{
    public function test_assistant_text_concatenates_assistant_events(): void
    {
        $result = new TurnResult([
            new Event(Event::TOOL_STEP, ['tool' => 'grep']),
            new Event(Event::ASSISTANT_TEXT, ['text' => 'Hello ']),
            new Event(Event::ASSISTANT_TEXT, ['text' => 'world.']),
        ]);
        self::assertSame('Hello world.', $result->assistantText());
    }

    public function test_outcome_returns_the_result_event(): void
    {
        $outcome = new Event(Event::RESULT, ['subtype' => 'case_drafted', 'is_error' => false]);
        $result  = new TurnResult([new Event(Event::ASSISTANT_TEXT, ['text' => 'ok']), $outcome]);
        self::assertSame($outcome, $result->outcome());
        self::assertFalse($result->isError());
    }

    public function test_is_error_when_error_event_present(): void
    {
        $result = new TurnResult([new Event(Event::ERROR, ['message' => 'boom'])]);
        self::assertTrue($result->isError());
    }

    public function test_is_error_when_result_flags_error(): void
    {
        $result = new TurnResult([new Event(Event::RESULT, ['subtype' => 'x', 'is_error' => true])]);
        self::assertTrue($result->isError());
    }

    public function test_steps_returns_tool_and_progress_events(): void
    {
        $step     = new Event(Event::TOOL_STEP, ['tool' => 'grep']);
        $progress = new Event(Event::PROGRESS, ['summary' => 'searching']);
        $result   = new TurnResult([$step, new Event(Event::ASSISTANT_TEXT, ['text' => 'x']), $progress]);
        self::assertSame([$step, $progress], $result->steps());
    }
}
