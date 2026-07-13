/** @jsx h */
import { h } from 'preact';
import { useState } from 'preact/hooks';
import { ChatPanel } from './components.jsx';
import { TopicList } from './topic-list.jsx';
import { StartedList } from './started-list.jsx';
import { TopicDetail } from './topic-detail.jsx';
import { PublishDialog } from './publish-dialog.jsx';
import { publishCase } from './api.js';

const TABS = [
  { id: 'all', label: 'All', enabled: true },
  { id: 'participating', label: 'Participating', enabled: false, hint: 'Coming in a later update' },
  { id: 'started', label: 'Started', enabled: true },
  { id: 'roadmap', label: 'Roadmap', enabled: false, hint: 'Coming in a later update' },
];

export function CommunityApp() {
  const [resetNonce, setResetNonce] = useState(0);
  const [listRefresh, setListRefresh] = useState(0);
  const [activeTab, setActiveTab] = useState('all');
  const [view, setView] = useState('list');
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [publishDraft, setPublishDraft] = useState(null);
  const [publishBusy, setPublishBusy] = useState(false);

  const requestNewTopic = () => setResetNonce((n) => n + 1);
  const openTopic = (topic) => {
    setSelectedTopic(topic);
    setView('detail');
  };
  const backToList = () => {
    setView('list');
    setSelectedTopic(null);
  };
  const bumpLists = () => setListRefresh((n) => n + 1);

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
    ? 'Your drafts and published topics — or ask Sage on the right.'
    : 'Browse public topics — or ask Sage on the right.';

  return (
    <div class="rt-layout">
      <main class="rt-main">
        {view === 'detail' && selectedTopic ? (
          <TopicDetail topic={selectedTopic} onBack={backToList} />
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
                >{tab.label}</button>
              ))}
            </nav>
            {activeTab === 'all' && (
              <div class="rt-banner">
                <b>Public &amp; anonymous.</b> Only community handles are shown, never real names.
              </div>
            )}
            {activeTab === 'all' && (
              <TopicList refreshNonce={listRefresh} onSelectTopic={openTopic} />
            )}
            {activeTab === 'started' && (
              <StartedList
                refreshNonce={listRefresh}
                onSelectTopic={openTopic}
                onReviewDraft={(topic) => setPublishDraft(topic)}
              />
            )}
          </div>
        )}
      </main>
      <aside class="rt-aside">
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