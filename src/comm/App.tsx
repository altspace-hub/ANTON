import { useState } from 'react';
import ChatListScreen from './pages/ChatListScreen';
import EventsScreen from './pages/EventsScreen';
import PortalsBrowseScreen from './pages/PortalsBrowseScreen';
import WalletScreen from './pages/WalletScreen';
import TabBar, { type TabId } from './components/TabBar';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('chat');

  return (
    <div className="flex flex-col min-h-dvh bg-[var(--color-bg)] text-[var(--color-text)]">
      <main className="flex-1 overflow-y-auto safe-top">
        {activeTab === 'chat' && <ChatListScreen />}
        {activeTab === 'events' && <EventsScreen />}
        {activeTab === 'portals' && <PortalsBrowseScreen />}
        {activeTab === 'wallet' && <WalletScreen />}
      </main>
      <TabBar active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
