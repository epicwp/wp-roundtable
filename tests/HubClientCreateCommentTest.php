<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\Http\TransportException;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class HubClientCreateCommentTest extends PHPUnitTestCase
{
    private function config(?FakeConsumer $consumer = null): Config
    {
        return new Config('pk_secret', $consumer ?? new FakeConsumer());
    }

    public function test_posts_comment_with_subject_id(): void
    {
        $responseBody = '{"id":"cm1","case_id":"c1","author_handle":"h","body":"Hello","status":"active","created_at":"2026-07-01T00:00:00","updated_at":"2026-07-01T00:00:00"}';
        $transport    = new FakeTransport(200, $responseBody);
        $client       = new HubClient($this->config(), $transport);

        $comment = $client->createComment('c1', 'Hello');

        self::assertSame('POST', $transport->lastMethod);
        self::assertSame(HubClient::HUB_URL . '/cases/c1/comments', $transport->lastUrl);
        self::assertSame('Bearer pk_secret', $transport->lastHeaders['Authorization']);
        $body = \json_decode((string) $transport->lastBody, true);
        self::assertSame('subject-1', $body['subject_id']);
        self::assertSame('Hello', $body['body']);
        self::assertSame('cm1', $comment['id']);
    }

    public function test_includes_email_and_licence_when_the_consumer_provides_them(): void
    {
        $transport = new FakeTransport(200, '{}');
        $licence   = array('key' => 'lic-1', 'activation_id' => 'act-1');
        $consumer  = new FakeConsumer(true, 'subj-1', null, null, $licence, 'user@example.com');
        $client    = new HubClient($this->config($consumer), $transport);

        $client->createComment('c1', 'Hello');

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertSame('user@example.com', $body['email']);
        self::assertSame($licence, $body['licence']);
    }

    public function test_omits_email_and_licence_when_the_consumer_has_none(): void
    {
        $transport = new FakeTransport(200, '{}');
        $client    = new HubClient($this->config(), $transport);

        $client->createComment('c1', 'Hello');

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertArrayNotHasKey('email', $body);
        self::assertArrayNotHasKey('licence', $body);
    }

    public function test_maps_forbidden_to_blocked(): void
    {
        $client = new HubClient($this->config(), new FakeTransport(403, ''));

        $this->expectException(HubException::class);
        try {
            $client->createComment('c1', 'Hi');
        } catch (HubException $e) {
            self::assertSame(HubException::BLOCKED, $e->kind());
            throw $e;
        }
    }

    public function test_maps_a_402_to_licence_invalid(): void
    {
        $client = new HubClient($this->config(), new FakeTransport(402, ''));

        $this->expectException(HubException::class);
        try {
            $client->createComment('c1', 'Hi');
        } catch (HubException $e) {
            self::assertSame(HubException::LICENCE_INVALID, $e->kind());
            throw $e;
        }
    }

    public function test_maps_transport_failure_to_network(): void
    {
        $transport = new FakeTransport(throw: new TransportException('timeout'));
        $client    = new HubClient($this->config(), $transport);

        $this->expectException(HubException::class);
        try {
            $client->createComment('c1', 'Hi');
        } catch (HubException $e) {
            self::assertSame(HubException::NETWORK, $e->kind());
            throw $e;
        }
    }
}