/** @jsx h */
import { h } from 'preact';
import { useState } from 'preact/hooks';
import { ChatPanel } from './components.jsx';
import { TopicList } from './topic-list.jsx';

const TABS = [
  { id: 'all', label: 'All', enabled: true },
  { id: 'participating', label: 'Participating', enabled: false, hint: 'Coming in a later update' },
  { id: 'started', label: 'Started', enabled: false, hint: 'Coming in a later update' },
  { id: 'roadmap', label: 'Roadmap', enabled: false, hint: 'Coming in a later update' },
];

export function CommunityApp() {
  const [resetNonce, setResetNonce] = useState(0);
  const [listRefresh, setListRefresh] = useState(0);
  const requestNewTopic = () => setResetNonce((n) => n + 1);

  return (
    <div class="rt-layout">
      <main class="rt-main">
        <div class="rt-pagehead">
          <div>
            <h1 class="rt-title">Community</h1>
            <p class="rt-sub">Browse public topics — or ask Sage on the right.</p>
          </div>
          <button class="rt-newtopic-head" type="button" onClick={requestNewTopic}>+ New topic</button>
        </div>
        <nav class="rt-tabs" aria-label="Community views">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              class={tab.id === 'all' ? 'on' : ''}
              disabled={!tab.enabled}
              title={tab.hint || undefined}
              aria-disabled={!tab.enabled}
            >{tab.label}</button>
          ))}
        </nav>
        <div class="rt-banner">
          <b>Public &amp; anonymous.</b> Only community handles are shown, never real names.
        </div>
        <TopicList refreshNonce={listRefresh} />
      </main>
      <aside class="rt-aside">
        <ChatPanel resetNonce={resetNonce} onTopicPublished={() => setListRefresh((n) => n + 1)} />
      </aside>
    </div>
  );
}