<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class HubClientVoteTest extends PHPUnitTestCase
{
    private function config(): Config
    {
        return new Config( 'pk_secret', new FakeConsumer() );
    }

    public function test_cast_vote_posts_subject_and_value(): void
    {
        $body      = '{"up":1,"down":0,"net":1,"my_vote":1}';
        $transport = new FakeTransport( 200, $body );
        $client    = new HubClient( $this->config(), $transport );

        $tally = $client->castVote( 'c1', 1 );

        self::assertSame( 'POST', $transport->lastMethod );
        self::assertSame( HubClient::HUB_URL . '/cases/c1/votes', $transport->lastUrl );
        $payload = \json_decode( (string) $transport->lastBody, true );
        self::assertSame( 'subject-1', $payload['subject_id'] );
        self::assertSame( 1, $payload['value'] );
        self::assertSame( 1, $tally['net'] );
    }

    public function test_get_vote_tally_gets_with_subject_query(): void
    {
        $body      = '{"up":1,"down":0,"net":1,"my_vote":1}';
        $transport = new FakeTransport( 200, $body );
        $client    = new HubClient( $this->config(), $transport );

        $tally = $client->getVoteTally( 'c1' );

        self::assertSame( 'GET', $transport->lastMethod );
        self::assertSame( HubClient::HUB_URL . '/cases/c1/votes?subject_id=subject-1', $transport->lastUrl );
        self::assertSame( 1, $tally['my_vote'] );
    }

    public function test_get_vote_tally_accepts_an_empty_json_object_body(): void
    {
        $transport = new FakeTransport( 200, '{}' );
        $client    = new HubClient( $this->config(), $transport );

        $tally = $client->getVoteTally( 'c1' );

        self::assertSame( [], $tally );
    }

    public function test_get_vote_tally_rejects_an_empty_json_array_body(): void
    {
        $client = new HubClient( $this->config(), new FakeTransport( 200, '[]' ) );

        $this->expectException( HubException::class );
        try {
            $client->getVoteTally( 'c1' );
        } catch ( HubException $e ) {
            self::assertSame( HubException::BAD_RESPONSE, $e->kind() );
            throw $e;
        }
    }

    public function test_retract_vote_deletes_with_subject_query(): void
    {
        $body      = '{"up":0,"down":0,"net":0,"my_vote":null}';
        $transport = new FakeTransport( 200, $body );
        $client    = new HubClient( $this->config(), $transport );

        $tally = $client->retractVote( 'c1' );

        self::assertSame( 'DELETE', $transport->lastMethod );
        self::assertSame( HubClient::HUB_URL . '/cases/c1/votes?subject_id=subject-1', $transport->lastUrl );
        self::assertSame( 0, $tally['net'] );
    }

    public function test_maps_forbidden_to_blocked(): void
    {
        $client = new HubClient( $this->config(), new FakeTransport( 403, '' ) );

        $this->expectException( HubException::class );
        try {
            $client->castVote( 'c1', 1 );
        } catch ( HubException $e ) {
            self::assertSame( HubException::BLOCKED, $e->kind() );
            throw $e;
        }
    }
}