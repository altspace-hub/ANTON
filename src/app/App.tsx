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
import PersonalizePage from './pages/PersonalizePage';
import ConnectionsPage from './pages/ConnectionsPage';
import InstanceTopBar from './components/InstanceTopBar';

// Tabbed screens
import HomeScreen from './pages/HomeScreen';
import StdHomeScreen from './pages/StdHomeScreen';
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
import UnifiedMailScreen from './pages/UnifiedMailScreen';
import EmailSetupScreen from './pages/EmailSetupScreen';
import WorkModulesScreen from './pages/WorkModulesScreen';
import SchoolFeedScreen from './pages/SchoolFeedScreen';
import CalendarScreen from './pages/CalendarScreen';
import StdMailScreen from './pages/StdMailScreen';
import StdThreadScreen from './pages/StdThreadScreen';
import StdCalendarScreen from './pages/StdCalendarScreen';
import StdWalletScreen from './pages/StdWalletScreen';
import StdVoiceScreen from './pages/StdVoiceScreen';
import StdSettingsScreen from './pages/StdSettingsScreen';
import type { MailMessage } from './services/mail';
import TabBar from './components/TabBar';
import BottomSheet from './components/BottomSheet';
import QuickActionsFab from './components/QuickActionsFab';
import { fetchWithAuth } from './services/api';
import { usePersonalization } from './components/ui/PersonalizationContext';

type AuthScreen = 'welcome' | 'join' | 'personalize' | 'connections';

const PERSONALIZED_KEY = 'anton-companion-personalized';
type OrgTab = 'home' | 'chat' | 'schedule' | 'tasks' | 'approvals' | 'capture' | 'search' | 'markets' | 'radar' | 'wallet' | 'history' | 'profile' | 'settings' | 'ask' | 'you' | 'mail' | 'mail_setup' | 'work' | 'school' | 'calendar'
  // Standard-mode screens (selected when mode === 'standard')
  | 'std_mail' | 'std_thread' | 'std_calendar' | 'std_wallet' | 'std_voice' | 'std_settings';

// Pro mode — spec §9.2, primary tabs ≤ 5. Approvals promoted out of More
// because it's the enterprise-wedge surface (spec §4.2 + §8.6); Schedule +
// Tasks move into More so the bottom row stays at 5.
const PRO_TABS = [
  { id: 'home',      label: 'Home',      icon: 'home' },
  { id: 'chat',      label: 'Chat',      icon: 'chat' },
  { id: 'approvals', label: 'Approvals', icon: 'tasks' },
  { id: 'capture',   label: 'Capture',   icon: 'schedule' },
  { id: 'more',      label: 'More',      icon: 'more' },
];

// Standard mode — 4 tabs, plain language, no technical surfaces.
// 'ask' opens the chat (a single text/voice surface), 'you' is settings.
const STD_TABS = [
  { id: 'home', label: 'Home',     icon: 'home' },
  { id: 'chat', label: 'Messages', icon: 'message' },
  { id: 'ask',  label: 'Ask',      icon: 'sparkles' },
  { id: 'you',  label: 'You',      icon: 'shield' },
];

export default function App() {
  const { mode } = usePersonalization();
  const isStandard = mode === 'standard';
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
  // Standard-mode thread drilldown
  const [selectedMail, setSelectedMail] = useState<MailMessage | null>(null);

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

    // Standard-mode routing: synthetic tabs + Pro-tab redirects to Std* pages
    if (isStandard) {
      if (tabId === 'chat')     { setActiveTab('std_mail');     return; }
      if (tabId === 'ask')      { setActiveTab('std_voice');    return; }
      if (tabId === 'you')      { setActiveTab('std_settings'); return; }
      if (tabId === 'calendar') { setActiveTab('std_calendar'); return; }
      if (tabId === 'wallet')   { setActiveTab('std_wallet');   return; }
    } else {
      // Pro-mode: synthetic Standard tab ids map to the Pro pages.
      if (tabId === 'ask') { setActiveTab('chat');     return; }
      if (tabId === 'you') { setActiveTab('settings'); return; }
    }
    setActiveTab(tabId as OrgTab);
  }

  // ── Auth screens ──────────────────────────────────────────────
  if (authScreen === 'welcome') {
    return <WelcomePage onComplete={() => setAuthScreen('join')} />;
  }
  if (authScreen === 'join') {
    return (
      <JoinPage
        onJoined={() => {
          // First-time pair → invite the user to pick an accent before
          // landing on the org workspace. Returning users skip straight
          // to connections.
          const personalized = (() => { try { return localStorage.getItem(PERSONALIZED_KEY) === '1'; } catch { return false; } })();
          setAuthScreen(personalized ? 'connections' : 'personalize');
        }}
        onBack={() => setAuthScreen('welcome')}
      />
    );
  }
  if (authScreen === 'personalize') {
    return (
      <PersonalizePage
        onContinue={() => {
          try { localStorage.setItem(PERSONALIZED_KEY, '1'); } catch { /* ignore */ }
          setAuthScreen('connections');
        }}
      />
    );
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
  function navFromHome(tab: string) {
    // Home cards can request a tab id that may be a synthetic 'ask'/'you'
    // token from Standard mode — funnel through the same router.
    handleTabChange(tab);
  }

  return (
    <div className="safe-top flex min-h-dvh flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Multi-instance top bar (spec §4.2 + §8.9) — Pro only */}
      {!isStandard && <InstanceTopBar onAddInstance={() => setAuthScreen('join')} />}

      {/* Active tab content */}
      {activeTab === 'home' && (
        isStandard ? (
          <StdHomeScreen
            orgId={selectedOrgId}
            orgName={selectedOrgName}
            onNavigate={navFromHome}
          />
        ) : (
          <HomeScreen
            orgId={selectedOrgId}
            orgName={selectedOrgName}
            orgType={selectedOrgType}
            onNavigate={navFromHome}
          />
        )
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
      {activeTab === 'mail' && (
        <UnifiedMailScreen
          orgId={selectedOrgId}
          onNavigate={(tab) => navFromHome(tab)}
          onOpenSettings={() => setActiveTab('mail_setup')}
        />
      )}
      {activeTab === 'mail_setup' && (
        <EmailSetupScreen
          orgId={selectedOrgId}
          onBack={() => setActiveTab('mail')}
        />
      )}
      {activeTab === 'work' && (
        <WorkModulesScreen
          orgId={selectedOrgId}
          onNavigate={(tab) => navFromHome(tab)}
        />
      )}
      {activeTab === 'school' && (
        <SchoolFeedScreen
          orgId={selectedOrgId}
          onNavigate={(tab) => navFromHome(tab)}
        />
      )}
      {activeTab === 'calendar' && (
        <CalendarScreen
          orgId={selectedOrgId}
          onNavigate={(tab) => navFromHome(tab)}
        />
      )}

      {/* ── Standard-mode screens ───────────────────────────── */}
      {activeTab === 'std_mail' && (
        <StdMailScreen
          orgId={selectedOrgId}
          onOpenThread={(m) => { setSelectedMail(m); setActiveTab('std_thread'); }}
        />
      )}
      {activeTab === 'std_thread' && selectedMail && (
        <StdThreadScreen
          message={selectedMail}
          onBack={() => setActiveTab('std_mail')}
          onOpenInPro={() => {
            // Hand-off to the Pro chat flow when the user wants to reply or
            // when the message is an approval that needs full UI.
            if (selectedMail.deep_link?.startsWith('/approvals')) setActiveTab('approvals');
            else setActiveTab('chat');
          }}
        />
      )}
      {activeTab === 'std_calendar' && (
        <StdCalendarScreen
          orgId={selectedOrgId}
          onBack={() => setActiveTab('home')}
        />
      )}
      {activeTab === 'std_wallet' && (
        <StdWalletScreen
          orgId={selectedOrgId}
          onBack={() => setActiveTab('home')}
        />
      )}
      {activeTab === 'std_voice' && (
        <StdVoiceScreen
          orgId={selectedOrgId}
          onClose={() => setActiveTab('home')}
        />
      )}
      {activeTab === 'std_settings' && (
        <StdSettingsScreen
          onBack={() => setActiveTab('home')}
        />
      )}

      {/* More menu — bottom sheet (Phase I fix UX-H1, spec §9.3) — Pro only */}
      {!isStandard && <BottomSheet open={showMore} onClose={() => setShowMore(false)} title="More" maxHeight="60dvh">
        <div className="grid grid-cols-3 gap-2">
          {[
            { id: 'work',     icon: '💼', label: 'Work' },
            { id: 'mail',     icon: '📧', label: 'Mail' },
            { id: 'calendar', icon: '🗓️', label: 'Calendar' },
            { id: 'school',   icon: '🎓', label: 'School' },
            { id: 'schedule', icon: '📅', label: 'Schedule' },
            { id: 'tasks',    icon: '☑️', label: 'Tasks' },
            { id: 'search',   icon: '🔍', label: 'Pathfinder' },
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
      </BottomSheet>}

      {/* Quick actions FAB (spec §8.8) — Pro only; Standard relies on the Ask tab */}
      {!isStandard && <QuickActionsFab
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
      />}

      {/* Tab bar — mode-aware. Pro carries the Approvals badge; Standard
          shows it on the Ask tab as a more general "things waiting" cue. */}
      <TabBar
        tabs={(isStandard ? STD_TABS : PRO_TABS).map(t => {
          if (!isStandard && t.id === 'approvals') return { ...t, badge: pendingApprovals };
          if (isStandard && t.id === 'ask')        return { ...t, badge: pendingApprovals };
          return t;
        })}
        activeTab={
          showMore ? 'more'
          : isStandard && (activeTab === 'std_mail' || activeTab === 'std_thread' || activeTab === 'chat') ? 'chat'
          : isStandard && activeTab === 'std_voice'    ? 'ask'
          : isStandard && (activeTab === 'std_settings' || activeTab === 'settings') ? 'you'
          : activeTab
        }
        onTabChange={handleTabChange}
      />
    </div>
  );
}
