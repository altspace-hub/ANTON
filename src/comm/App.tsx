import { useEffect, useState } from 'react';
import OnboardingScreen from './pages/OnboardingScreen';
import ProfileScreen from './pages/ProfileScreen';
import ChatListScreen from './pages/ChatListScreen';
import ChatThreadScreen from './pages/ChatThreadScreen';
import AddContactScreen from './pages/AddContactScreen';
import EventsScreen from './pages/EventsScreen';
import PortalsBrowseScreen from './pages/PortalsBrowseScreen';
import WalletScreen from './pages/WalletScreen';
import TabBar, { type TabId } from './components/TabBar';
import TopBar from './components/TopBar';
import { hasIdentity } from './services/identity';

type View = 'onboarding' | 'tabs' | 'profile' | 'add-contact' | 'chat-thread';

export default function App() {
  const [view, setView] = useState<View>(hasIdentity() ? 'tabs' : 'onboarding');
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [identityVersion, setIdentityVersion] = useState(0);
  const [contactsVersion, setContactsVersion] = useState(0);
  const [openChatHash, setOpenChatHash] = useState<string | null>(null);

  useEffect(() => {
    if (view === 'tabs' && !hasIdentity()) setView('onboarding');
  }, [view]);

  if (view === 'onboarding') {
    return (
      <OnboardingScreen
        onComplete={() => {
          setIdentityVersion((v) => v + 1);
          setView('tabs');
        }}
      />
    );
  }

  if (view === 'profile') {
    return (
      <ProfileScreen
        onBack={() => setView('tabs')}
        onSignedOut={() => {
          setIdentityVersion((v) => v + 1);
          setView('onboarding');
          setActiveTab('chat');
        }}
      />
    );
  }

  if (view === 'add-contact') {
    return (
      <AddContactScreen
        onBack={() => setView('tabs')}
        onAdded={() => {
          setContactsVersion((v) => v + 1);
          setView('tabs');
          setActiveTab('chat');
        }}
      />
    );
  }

  if (view === 'chat-thread' && openChatHash) {
    return (
      <ChatThreadScreen
        peerContactHash={openChatHash}
        onBack={() => { setOpenChatHash(null); setView('tabs'); }}
      />
    );
  }

  return (
    <div className="flex flex-col min-h-dvh bg-[var(--color-bg)] text-[var(--color-text)]">
      <TopBar onProfile={() => setView('profile')} />
      <main key={identityVersion} className="flex-1 overflow-y-auto">
        {activeTab === 'chat' && (
          <ChatListScreen
            refreshKey={contactsVersion}
            onAddContact={() => setView('add-contact')}
            onOpenChat={(hash) => { setOpenChatHash(hash); setView('chat-thread'); }}
          />
        )}
        {activeTab === 'events' && <EventsScreen />}
        {activeTab === 'portals' && <PortalsBrowseScreen />}
        {activeTab === 'wallet' && <WalletScreen />}
      </main>
      <TabBar active={activeTab} onChange={setActiveTab} />
    </div>
  );
}

