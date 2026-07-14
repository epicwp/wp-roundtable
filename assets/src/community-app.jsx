/** @jsx h */
import { h } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { ChatPanel } from './components.jsx';
import { AgentAvatar } from './avatars.jsx';
import { TopicList } from './topic-list.jsx';
import { StartedList } from './started-list.jsx';
import { RoadmapList } from './roadmap-list.jsx';
import { ParticipatingList } from './participating-list.jsx';
import { TopicDetail } from './topic-detail.jsx';
import { PublishDialog } from './publish-dialog.jsx';
import { publishCase } from './api.js';
import { fetchTabCounts } from './tab-counts.js';
import { agentDisplayName } from './config.js';

const TABS = [
  { id: 'all', label: 'All', enabled: true },
  { id: 'participating', label: 'Participating', enabled: true },
  { id: 'started', label: 'Started', enabled: true },
  { id: 'roadmap', label: 'Roadmap', enabled: true },
];

export function CommunityApp() {
  const [resetNonce, setResetNonce] = useState(0);
  const [listRefresh, setListRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState('all');
  const [view, setView] = useState('list');
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [publishDraft, setPublishDraft] = useState(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [tabCounts, setTabCounts] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const agentName = agentDisplayName();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const counts = await fetchTabCounts();
      if (!cancelled) setTabCounts(counts);
    })();
    return () => { cancelled = true; };
  }, [listRefresh]);

  const requestNewTopic = () => {
    setResetNonce((n) => n + 1);
    setChatOpen(true);
  };
  const openTopic = (topic) => {
    setSelectedTopic(topic);
    setView('detail');
  };
  const backToList = () => {
    setView('list');
    setSelectedTopic(null);
  };
  const bumpLists = () => setListRefresh((n) => n + 1);
  const refreshTabCountsOnly = useCallback(async () => {
    const counts = await fetchTabCounts();
    setTabCounts(counts);
  }, []);

  async function confirmPublish({ title, summary }) {
    if (!publishDraft?.id || publishBusy) return;
    setPublishBusy(true);
    const res = await publishCase({ case_id: publishDraft.id, title, summary });
    setPublishBusy(false);
    if (res.error) return;
    setPublishDraft(null);
    bumpLists();
    if (activeTab !== 'started') setActiveTab('started');
  }

  const subCopy = activeTab === 'started'
    ? `Your drafts and published topics — or ask ${agentName} on the right.`
    : activeTab === 'participating'
      ? `Topics you have commented on or voted on — or ask ${agentName} on the right.`
      : activeTab === 'roadmap'
        ? `Follow what is planned, in progress, and shipped — or ask ${agentName} on the right.`
        : `Browse public topics — or ask ${agentName} on the right.`;

  return (
    <div class={'rt-layout' + (chatOpen ? ' rt-chat-open' : '')}>
      <main class="rt-main">
        {view === 'detail' && selectedTopic ? (
          <TopicDetail topic={selectedTopic} onBack={backToList} onVoteChange={refreshTabCountsOnly} />
        ) : (
          <div class="rt-list-shell">
            <div class="rt-pagehead">
              <div>
                <h1 class="rt-title">Community</h1>
                <p class="rt-sub">{subCopy}</p>
              </div>
              <button class="rt-newtopic-head" type="button" onClick={requestNewTopic}>+ New topic</button>
            </div>
            <nav class="rt-tabs" aria-label="Community views">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  class={tab.id === activeTab ? 'on' : ''}
                  disabled={!tab.enabled}
                  title={tab.hint || undefined}
                  aria-disabled={!tab.enabled}
                  onClick={() => tab.enabled && setActiveTab(tab.id)}
                >
                  {tab.label}
                  {tabCounts && tabCounts[tab.id] != null && (
                    <span class="rt-tab-n">{tabCounts[tab.id]}</span>
                  )}
                </button>
              ))}
            </nav>
            {activeTab === 'all' && (
              <div class="rt-banner">
                <b>Public &amp; anonymous.</b> Only community handles are shown, never real names.
              </div>
            )}
            {activeTab === 'all' && (
              <TopicList refreshNonce={listRefresh} onSelectTopic={openTopic} onVoteChange={refreshTabCountsOnly} />
            )}
            {activeTab === 'participating' && (
              <ParticipatingList refreshNonce={listRefresh} onSelectTopic={openTopic} onVoteChange={refreshTabCountsOnly} />
            )}
            {activeTab === 'started' && (
              <StartedList
                refreshNonce={listRefresh}
                onSelectTopic={openTopic}
                onReviewDraft={(topic) => setPublishDraft(topic)}
                onVoteChange={refreshTabCountsOnly}
              />
            )}
            {activeTab === 'roadmap' && (
              <RoadmapList refreshNonce={listRefresh} onSelectTopic={openTopic} onVoteChange={refreshTabCountsOnly} />
            )}
          </div>
        )}
      </main>
      {!chatOpen && (
        <button
          type="button"
          class="rt-chat-launch"
          aria-label={`Open ${agentName} chat`}
          onClick={() => setChatOpen(true)}
        >
          <AgentAvatar size="sm" />
        </button>
      )}
      {chatOpen && (
        <button
          type="button"
          class="rt-chat-backdrop"
          aria-label="Close chat"
          onClick={() => setChatOpen(false)}
        />
      )}
      <aside class={'rt-aside' + (chatOpen ? ' is-open' : '')}>
        <button
          type="button"
          class="rt-chat-close"
          aria-label="Close chat"
          onClick={() => setChatOpen(false)}
        >×</button>
        <ChatPanel resetNonce={resetNonce} onTopicPublished={bumpLists} />
      </aside>
      {publishDraft && (
        <PublishDialog
          draft={publishDraft}
          busy={publishBusy}
          onCancel={() => setPublishDraft(null)}
          onPublish={confirmPublish}
        />
      )}
    </div>
  );
}