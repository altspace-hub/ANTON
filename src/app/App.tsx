/**
 * App.tsx — Companion app with tab-based navigation.
 * Flow: welcome → join → connections → [tabbed org workspace]
 * Tabs: Home, Chat, Schedule, Tasks, More (Search, Markets, Radar, Docs, Profile, Settings)
 */

import { useState, useEffect } from 'react';
import { getIdentity } from './services/identity';
import { getSessionToken } from './services/api';
import { onActiveInstanceChange } from './services/instances';

// Auth screens
import WelcomePage from './pages/WelcomePage';
import JoinPage from './pages/JoinPage';
import ConnectionsPage from './pages/ConnectionsPage';
import InstanceTopBar from './components/InstanceTopBar';

// Tabbed screens
import HomeScreen from './pages/HomeScreen';
import ChatPage from './pages/ChatPage';
import ScheduleScreen from './pages/ScheduleScreen';
import TaskScreen from './pages/TaskScreen';
import SearchScreen from './pages/SearchScreen';
import MarketsScreen from './pages/MarketsScreen';
import RadarScreen from './pages/RadarScreen';
import OrgHomePage from './pages/OrgHomePage';
import SessionHistoryPage from './pages/SessionHistoryPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import WalletScreen from './pages/WalletScreen';
import TabBar from './components/TabBar';

type AuthScreen = 'welcome' | 'join' | 'connections';
type OrgTab = 'home' | 'chat' | 'schedule' | 'tasks' | 'search' | 'markets' | 'radar' | 'wallet' | 'history' | 'profile' | 'settings';

const MAIN_TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'chat', label: 'Chat', icon: 'chat' },
  { id: 'schedule', label: 'Schedule', icon: 'schedule' },
  { id: 'tasks', label: 'Tasks', icon: 'tasks' },
  { id: 'more', label: 'More', icon: 'more' },
];

export default function App() {
  const [authScreen, setAuthScreen] = useState<AuthScreen | null>(null);
  const [activeTab, setActiveTab] = useState<OrgTab>('home');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [selectedOrgName, setSelectedOrgName] = useState('');
  const [selectedOrgType, setSelectedOrgType] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  // Bumped each time the user switches instance, forces tab content to re-mount + re-fetch
  const [instanceVersion, setInstanceVersion] = useState(0);

  useEffect(() => {
    const identity = getIdentity();
    const token = getSessionToken();
    if (identity && token) {
      setAuthScreen('connections');
    } else {
      setAuthScreen('welcome');
    }
  }, []);

  // Switch instance → bump key → tab content remounts with the new server base
  useEffect(() => onActiveInstanceChange(() => {
    setInstanceVersion(v => v + 1);
    // After switching instance, the user's prior org selection no longer
    // makes sense — bounce them back to the connections list.
    setSelectedOrgId(null);
    setAuthScreen('connections');
  }), []);

  function selectOrg(orgId: string, orgName?: string, orgType?: string) {
    setSelectedOrgId(orgId);
    setSelectedOrgName(orgName || '');
    setSelectedOrgType(orgType || '');
    setActiveTab('home');
    setAuthScreen(null);
  }

  function handleTabChange(tabId: string) {
    if (tabId === 'more') {
      setShowMore(!showMore);
      return;
    }
    setShowMore(false);
    setActiveTab(tabId as OrgTab);
  }

  // ── Auth screens ──────────────────────────────────────────────
  if (authScreen === 'welcome') {
    return <WelcomePage onComplete={() => setAuthScreen('join')} />;
  }
  if (authScreen === 'join') {
    return <JoinPage onJoined={() => setAuthScreen('connections')} onBack={() => setAuthScreen('welcome')} />;
  }
  if (authScreen === 'connections' || !selectedOrgId) {
    return (
      <ConnectionsPage
        onSelectOrg={(id, name) => selectOrg(id, name)}
        onJoinNew={() => setAuthScreen('join')}
        onProfile={() => { setAuthScreen(null); setActiveTab('profile'); }}
      />
    );
  }

  // ── Tabbed org workspace ──────────────────────────────────────
  return (
    <div className="flex min-h-dvh flex-col bg-adv-dark safe-top">
      {/* Multi-instance top bar (spec §4.2 + §8.9) */}
      <InstanceTopBar onAddInstance={() => setAuthScreen('join')} />

      {/* Active tab content */}
      {activeTab === 'home' && (
        <HomeScreen
          orgId={selectedOrgId}
          orgName={selectedOrgName}
          orgType={selectedOrgType}
          onNavigate={(tab) => setActiveTab(tab as OrgTab)}
        />
      )}
      {activeTab === 'chat' && (
        <ChatPage
          orgId={selectedOrgId}
          sessionId={sessionId}
          onSessionCreated={setSessionId}
          onBack={() => setActiveTab('home')}
        />
      )}
      {activeTab === 'schedule' && <ScheduleScreen orgId={selectedOrgId} />}
      {activeTab === 'tasks' && <TaskScreen orgId={selectedOrgId} />}
      {activeTab === 'search' && <SearchScreen orgId={selectedOrgId} />}
      {activeTab === 'markets' && <MarketsScreen orgId={selectedOrgId} />}
      {activeTab === 'radar' && <RadarScreen orgId={selectedOrgId} />}
      {activeTab === 'wallet' && <WalletScreen orgId={selectedOrgId} />}
      {activeTab === 'history' && (
        <SessionHistoryPage
          orgId={selectedOrgId}
          orgName={selectedOrgName}
          onSelectSession={(sid) => { setSessionId(sid); setActiveTab('chat'); }}
          onBack={() => setActiveTab('home')}
        />
      )}
      {activeTab === 'profile' && <ProfilePage onBack={() => setActiveTab('home')} />}
      {activeTab === 'settings' && <SettingsPage onBack={() => setActiveTab('home')} />}

      {/* More menu overlay */}
      {showMore && (
        <div className="absolute bottom-16 left-0 right-0 z-40 border-t border-border bg-adv-dark-2 safe-bottom">
          <div className="mx-auto max-w-2xl grid grid-cols-3 gap-1 p-3">
            {[
              { id: 'search', icon: '🔍', label: 'Research' },
              { id: 'markets', icon: '📊', label: 'Markets' },
              { id: 'radar', icon: '📡', label: 'Radar' },
              { id: 'wallet', icon: '💰', label: 'Wallet' },
              { id: 'history', icon: '💬', label: 'History' },
              { id: 'profile', icon: '👤', label: 'Profile' },
              { id: 'settings', icon: '⚙️', label: 'Settings' },
              { id: 'back', icon: '🔙', label: 'Switch Org' },
            ].map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setShowMore(false);
                  if (item.id === 'back') { setSelectedOrgId(null); setAuthScreen('connections'); }
                  else setActiveTab(item.id as OrgTab);
                }}
                className="flex flex-col items-center gap-1 rounded-lg py-3 text-adv-gray hover:text-adv-teal hover:bg-adv-card transition"
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-[10px]">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tab bar */}
      <TabBar tabs={MAIN_TABS} activeTab={showMore ? 'more' : activeTab} onTabChange={handleTabChange} />
    </div>
  );
}
