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
    private function config( ?FakeConsumer $consumer = null ): Config
    {
        return new Config( 'pk_secret', $consumer ?? new FakeConsumer() );
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

    public function test_cast_vote_includes_email_and_licence_when_the_consumer_provides_them(): void
    {
        $transport = new FakeTransport( 200, '{}' );
        $licence   = array( 'key' => 'lic-1', 'activation_id' => 'act-1' );
        $consumer  = new FakeConsumer( true, 'subj-1', null, null, $licence, 'user@example.com' );
        $client    = new HubClient( $this->config( $consumer ), $transport );

        $client->castVote( 'c1', 1 );

        $payload = \json_decode( (string) $transport->lastBody, true );
        self::assertSame( 'user@example.com', $payload['email'] );
        self::assertSame( $licence, $payload['licence'] );
    }

    public function test_cast_vote_omits_email_and_licence_when_the_consumer_has_none(): void
    {
        $transport = new FakeTransport( 200, '{}' );
        $client    = new HubClient( $this->config(), $transport );

        $client->castVote( 'c1', 1 );

        $payload = \json_decode( (string) $transport->lastBody, true );
        self::assertArrayNotHasKey( 'email', $payload );
        self::assertArrayNotHasKey( 'licence', $payload );
    }

    public function test_cast_vote_maps_a_402_to_licence_invalid(): void
    {
        $client = new HubClient( $this->config(), new FakeTransport( 402, '' ) );

        $this->expectException( HubException::class );
        try {
            $client->castVote( 'c1', 1 );
        } catch ( HubException $e ) {
            self::assertSame( HubException::LICENCE_INVALID, $e->kind() );
            throw $e;
        }
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

    public function test_retract_vote_sends_no_licence_or_email(): void
    {
        $consumer  = new FakeConsumer( true, 'subject-1', null, null, array( 'key' => 'k', 'activation_id' => 'a' ), 'user@example.com' );
        $transport = new FakeTransport( 200, '{"up":0,"down":0,"net":0,"my_vote":null}' );
        $client    = new HubClient( $this->config( $consumer ), $transport );

        $client->retractVote( 'c1' );

        self::assertNull( $transport->lastBody );
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