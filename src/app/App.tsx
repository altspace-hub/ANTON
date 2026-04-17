/**
 * App.tsx — Companion app with tab-based navigation.
 * Flow: welcome → join → connections → [tabbed org workspace]
 * Tabs: Home, Chat, Schedule, Tasks, More (Search, Markets, Radar, Docs, Profile, Settings)
 */

import { useState, useEffect } from 'react';
import { getIdentity } from './services/identity';
import { getSessionToken } from './services/api';
import { onActiveInstanceChange, getActiveInstance } from './services/instances';
import { registerPush, setNotificationRouter, startNativeNotificationListener } from './services/push';
import { listPendingCheckpoints } from './services/checkpoints';

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
import SessionHistoryPage from './pages/SessionHistoryPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import WalletScreen from './pages/WalletScreen';
import ApprovalsScreen from './pages/ApprovalsScreen';
import CapturePage from './pages/CapturePage';
import TabBar from './components/TabBar';
import BottomSheet from './components/BottomSheet';
import QuickActionsFab from './components/QuickActionsFab';
import { fetchWithAuth } from './services/api';

type AuthScreen = 'welcome' | 'join' | 'connections';
type OrgTab = 'home' | 'chat' | 'schedule' | 'tasks' | 'approvals' | 'capture' | 'search' | 'markets' | 'radar' | 'wallet' | 'history' | 'profile' | 'settings';

// Spec §9.2 — primary tabs ≤ 5. Approvals promoted out of More because
// it is the enterprise-wedge surface (spec §4.2 + §8.6); Schedule +
// Tasks move into More so the bottom row stays at 5.
const MAIN_TABS = [
  { id: 'home',      label: 'Home',      icon: 'home' },
  { id: 'chat',      label: 'Chat',      icon: 'chat' },
  { id: 'approvals', label: 'Approvals', icon: 'tasks' },
  { id: 'capture',   label: 'Capture',   icon: 'schedule' },
  { id: 'more',      label: 'More',      icon: 'more' },
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
  // Pending approvals badge — refreshed every 60s and on tab change
  const [pendingApprovals, setPendingApprovals] = useState(0);
  // Set when a push deep-link routes to a specific approval id
  const [openApprovalId, setOpenApprovalId] = useState<string | null>(null);

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

  // Push registration + notification deep-link router (best-effort)
  useEffect(() => {
    const inst = getActiveInstance();
    if (!inst?.device_id) return;          // legacy pair has no device_id; skip
    void registerPush().catch(() => { /* swallow — silent by default per spec §8.7 */ });
    setNotificationRouter((deepLink, raw) => {
      // /approvals/:id deep links land us on the approvals tab with the detail open
      const m = deepLink.match(/^\/approvals\/([^/?]+)/);
      if (m) {
        setOpenApprovalId(m[1]);
        setActiveTab('approvals');
        setShowMore(false);
      } else if (raw.event_id) {
        setOpenApprovalId(raw.event_id);
        setActiveTab('approvals');
      }
    });
    let off: (() => void) | null = null;
    void startNativeNotificationListener().then(fn => { off = fn; });
    return () => { off?.(); };
  }, [instanceVersion]);

  // Pending approvals badge — refresh now + every 60s
  useEffect(() => {
    if (!getActiveInstance()) { setPendingApprovals(0); return; }
    let cancelled = false;
    async function refresh() {
      try {
        const list = await listPendingCheckpoints({ limit: 100 });
        if (!cancelled) setPendingApprovals(list.length);
      } catch { /* silent */ }
    }
    void refresh();
    const id = window.setInterval(refresh, 60_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [instanceVersion, activeTab]);

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
      {activeTab === 'approvals' && (
        <ApprovalsScreen
          key={`approvals-${instanceVersion}-${openApprovalId ?? 'list'}`}
          initialCheckpointId={openApprovalId}
        />
      )}
      {activeTab === 'capture' && (
        <CapturePage
          key={`capture-${instanceVersion}`}
          orgId={selectedOrgId}
          onSent={(sid) => { if (sid) setSessionId(sid); setActiveTab('chat'); }}
          onBack={() => setActiveTab('home')}
        />
      )}
      {activeTab === 'profile' && <ProfilePage onBack={() => setActiveTab('home')} />}
      {activeTab === 'settings' && <SettingsPage onBack={() => setActiveTab('home')} />}

      {/* More menu — bottom sheet (Phase I fix UX-H1, spec §9.3) */}
      <BottomSheet open={showMore} onClose={() => setShowMore(false)} title="More" maxHeight="60dvh">
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'schedule', icon: '📅', label: 'Schedule' },
            { id: 'tasks',    icon: '☑️', label: 'Tasks' },
            { id: 'search',   icon: '🔍', label: 'Research' },
            { id: 'markets',  icon: '📊', label: 'Markets' },
            { id: 'radar',    icon: '📡', label: 'Radar' },
            { id: 'wallet',   icon: '💰', label: 'Wallet' },
            { id: 'history',  icon: '💬', label: 'History' },
            { id: 'profile',  icon: '👤', label: 'Profile' },
            { id: 'settings', icon: '⚙️', label: 'Settings' },
            { id: 'back',     icon: '🔙', label: 'Switch Org' },
          ].map(item => (
            <button
              key={item.id}
              onClick={() => {
                setShowMore(false);
                if (item.id === 'back') { setSelectedOrgId(null); setAuthScreen('connections'); }
                else setActiveTab(item.id as OrgTab);
              }}
              className="flex flex-col items-center gap-1 rounded-xl border border-border bg-adv-card py-4 text-adv-gray transition hover:border-adv-teal/40 hover:text-adv-teal active:scale-[0.98]"
            >
              <span className="text-2xl">{item.icon}</span>
              <span className="text-[10px]">{item.label}</span>
            </button>
          ))}
        </div>
      </BottomSheet>

      {/* Quick actions FAB (spec §8.8) */}
      <QuickActionsFab
        pendingApprovals={pendingApprovals}
        onAsk={() => { setActiveTab('chat'); setShowMore(false); }}
        onCapture={() => { setActiveTab('capture'); setShowMore(false); }}
        onApprovals={() => { setActiveTab('approvals'); setShowMore(false); }}
        onSwitchInstance={() => { /* InstanceTopBar already exposes the switcher; nothing else to do here */ }}
        onVoiceSubmit={async (transcript: string) => {
          if (!selectedOrgId) return null;
          try {
            const res = await fetchWithAuth(`/org/${selectedOrgId}/query-sync`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: transcript }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
            const reply = typeof data.assistant === 'string' ? data.assistant
                       : typeof data.reply === 'string' ? data.reply
                       : typeof data.text === 'string' ? data.text
                       : (data.message?.content ?? '');
            return { reply: String(reply || '(no reply)') };
          } catch (e) {
            return { reply: e instanceof Error ? e.message : 'Voice request failed' };
          }
        }}
      />

      {/* Tab bar — Approvals tab carries the live pending-count badge */}
      <TabBar
        tabs={MAIN_TABS.map(t => t.id === 'approvals' ? { ...t, badge: pendingApprovals } : t)}
        activeTab={showMore ? 'more' : activeTab}
        onTabChange={handleTabChange}
      />
    </div>
  );
}
