<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class HubClientListParticipatingTest extends PHPUnitTestCase
{
    public function test_gets_participating_cases(): void
    {
        $body      = '[{"id":"c1","title":"Joined topic","type":"bug","status":"open","summary":"s","author_handle":"h","net":2,"created_at":"2026-07-01T00:00:00"}]';
        $transport = new FakeTransport(200, $body);
        $config    = new Config('pk_secret', new FakeConsumer(subjectId: 'subject-1'));
        $client    = new HubClient($config, $transport);

        $cases = $client->listParticipatingCases();

        self::assertSame('GET', $transport->lastMethod);
        self::assertSame(HubClient::HUB_URL . '/subjects/subject-1/participating', $transport->lastUrl);
        self::assertSame('c1', $cases[0]['id']);
    }

    public function test_maps_forbidden_to_blocked(): void
    {
        $config = new Config('pk', new FakeConsumer());
        $client = new HubClient($config, new FakeTransport(403, ''));

        $this->expectException(HubException::class);
        try {
            $client->listParticipatingCases();
        } catch (HubException $e) {
            self::assertSame(HubException::BLOCKED, $e->kind());
            throw $e;
        }
    }
}