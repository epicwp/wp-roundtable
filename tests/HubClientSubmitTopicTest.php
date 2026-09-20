<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\HubException;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class HubClientSubmitTopicTest extends PHPUnitTestCase
{
    private function client(FakeTransport $transport, FakeConsumer $consumer): HubClient
    {
        return new HubClient(new Config('pk_secret', $consumer), $transport);
    }

    public function test_submit_topic_posts_to_cases_direct(): void
    {
        $transport = new FakeTransport(200, '{"id":"c1","title":"T","visibility":"pending"}');
        $case      = $this->client($transport, new FakeConsumer())->submitTopic('bug', 'Broken thing', 'It is broken.');

        self::assertSame('c1', $case['id']);
        self::assertSame(HubClient::HUB_URL . '/cases/direct', $transport->lastUrl);
        self::assertSame('Bearer pk_secret', $transport->lastHeaders['Authorization']);
    }

    public function test_submit_topic_sends_type_title_body_and_subject_id(): void
    {
        $transport = new FakeTransport(200, '{}');
        $this->client($transport, new FakeConsumer(true, 'subj-1'))->submitTopic('question', 'A title', 'A body');

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertSame('question', $body['type']);
        self::assertSame('A title', $body['title']);
        self::assertSame('A body', $body['body']);
        self::assertSame('subj-1', $body['subject_id']);
    }

    public function test_submit_topic_includes_email_metadata_and_client_version_when_the_consumer_provides_them(): void
    {
        $transport = new FakeTransport(200, '{}');
        $consumer  = new FakeConsumer(true, 'subj-1', 'HEALTH', '1.2.3', null, 'user@example.com');
        $this->client($transport, $consumer)->submitTopic('bug', 'T', 'B');

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertSame('user@example.com', $body['email']);
        self::assertSame('HEALTH', $body['metadata']);
        self::assertSame('1.2.3', $body['client_version']);
    }

    public function test_submit_topic_omits_email_metadata_and_client_version_when_the_consumer_has_none(): void
    {
        $transport = new FakeTransport(200, '{}');
        $this->client($transport, new FakeConsumer())->submitTopic('bug', 'T', 'B');

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertArrayNotHasKey('email', $body);
        self::assertArrayNotHasKey('metadata', $body);
        self::assertArrayNotHasKey('client_version', $body);
    }

    public function test_submit_topic_includes_the_licence_payload_when_the_consumer_provides_one(): void
    {
        $transport = new FakeTransport(200, '{}');
        $licence   = array('key' => 'lic-1', 'activation_id' => 'act-1');
        $consumer  = new FakeConsumer(true, 'subj-1', null, null, $licence);
        $this->client($transport, $consumer)->submitTopic('bug', 'T', 'B');

        $body = \json_decode((string) $transport->lastBody, true);
        self::assertSame($licence, $body['licence']);
    }

    public function test_submit_topic_maps_a_402_to_licence_invalid(): void
    {
        $client = $this->client(new FakeTransport(402, ''), new FakeConsumer());
        try {
            $client->submitTopic('bug', 'T', 'B');
            self::fail('expected HubException');
        } catch (HubException $e) {
            self::assertSame(HubException::LICENCE_INVALID, $e->kind());
        }
    }
}
