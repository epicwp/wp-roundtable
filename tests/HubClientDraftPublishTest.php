<?php
declare(strict_types=1);

namespace EpicWP\Roundtable\Tests;

use EpicWP\Roundtable\Config;
use EpicWP\Roundtable\HubClient;
use EpicWP\Roundtable\Tests\Support\FakeConsumer;
use EpicWP\Roundtable\Tests\Support\FakeTransport;
use PHPUnit\Framework\TestCase as PHPUnitTestCase;

final class HubClientDraftPublishTest extends PHPUnitTestCase
{
    private function client(FakeTransport $transport): HubClient
    {
        return new HubClient(new Config('pk_secret', new FakeConsumer()), $transport);
    }

    public function test_create_case_posts_conversation(): void
    {
        $transport = new FakeTransport(200, '{"id":"c1","title":"T","visibility":"private"}');
        $case      = $this->client($transport)->createCase('chat-9', "User: hi\nSage: hello");

        self::assertSame('c1', $case['id']);
        self::assertSame(HubClient::HUB_URL . '/chats/chat-9/case', $transport->lastUrl);
        $body = \json_decode((string) $transport->lastBody, true);
        self::assertSame('subject-1', $body['subject_id']);
        self::assertFalse($body['make_public']);
    }

    public function test_publish_case_posts_case_id_path(): void
    {
        $transport = new FakeTransport(200, '{"id":"c1","visibility":"public"}');
        $case      = $this->client($transport)->publishCase('c1', ['title' => 'Edited']);

        self::assertSame('public', $case['visibility']);
        self::assertSame(HubClient::HUB_URL . '/cases/c1/publish', $transport->lastUrl);
        $body = \json_decode((string) $transport->lastBody, true);
        self::assertSame('Edited', $body['title']);
    }
}