/**
 * App.tsx — Companion app with tab-based navigation.
 * Flow: welcome → join → connections → [tabbed org workspace]
 * Tabs: Home, Chat, Schedule, Tasks, More (Search, Markets, Radar, Docs, Profile, Settings)
 */

import { useState, useEffect, useCallback } from 'react';
import { getIdentity } from './services/identity';
import { getSessionToken } from './services/api';
import { onActiveInstanceChange, getActiveInstance, getActiveInstanceId, getInstanceSessionToken, refreshInstanceInfo } from './services/instances';
import { registerPush, requestPushPermission, setNotificationRouter, startNativeNotificationListener } from './services/push';
import { listPendingCheckpoints } from './services/checkpoints';
import { useAndroidBackButton, type AppBackResult } from './hooks/useAndroidBackButton';

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
import PortalsScreen from './pages/PortalsScreen';
import CommunityScreen from './pages/CommunityScreen';
import CommunityChatScreen from './pages/CommunityChatScreen';
import MissionsScreen from './pages/MissionsScreen';
import MyWorkScreen from './pages/MyWorkScreen';
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
import { usePersonalization } from './components/ui/PersonalizationContext';
import { Ico } from './components/ui';

type AuthScreen = 'welcome' | 'join' | 'personalize' | 'connections';

const PERSONALIZED_KEY = 'anton-companion-personalized';
type OrgTab = 'home' | 'chat' | 'schedule' | 'tasks' | 'approvals' | 'capture' | 'search' | 'markets' | 'radar' | 'wallet' | 'history' | 'profile' | 'settings' | 'ask' | 'you' | 'mail' | 'mail_setup' | 'work' | 'school' | 'calendar' | 'portals' | 'community' | 'community_chat' | 'missions' | 'mywork'
  // Standard-mode screens (selected when mode === 'standard')
  | 'std_mail' | 'std_thread' | 'std_calendar' | 'std_wallet' | 'std_voice' | 'std_settings';

// Pro mode — spec §9.2, primary tabs ≤ 5. Approvals promoted out of More
// because it's the enterprise-wedge surface (spec §4.2 + §8.6); Schedule +
// Tasks move into More so the bottom row stays at 5.
const PRO_TABS = [
  { id: 'home',      label: 'Home',      icon: 'home' },
  { id: 'chat',      label: 'Chat',      icon: 'chat' },
  // Way Forward §4 — Approve uses shieldCheck (was 'tasks' → inbox glyph,
  // which collided with Capture). Capture uses the camera icon directly.
  { id: 'approvals', label: 'Approvals', icon: 'shieldCheck' },
  { id: 'capture',   label: 'Capture',   icon: 'camera' },
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
  // Community chat drilldown — set when user taps a contact in CommunityScreen
  const [chatContact, setChatContact] = useState<{ hash: string; name: string } | null>(null);
  // Currently selected Work module — when set, ChatPage runs inside that
  // module (system prompt + header label). Cleared on "Switch to free chat".
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Bridge the active instance's session token from secure storage into
      // localStorage on cold start. The bridge is normally set when an
      // instance is added or switched, but if the WebView's localStorage is
      // wiped (Capacitor data clear, OS reclaim, etc.) while the secure
      // store survives, getSessionToken() returns null and the user lands
      // on Welcome despite still being paired. This restores the mirror.
      try {
        const activeId = getActiveInstanceId();
        if (activeId && !getSessionToken()) {
          const tok = await getInstanceSessionToken(activeId);
          if (tok) localStorage.setItem('anton-companion-session', tok);
        }
      } catch { /* swallow — fall through to identity check */ }

      if (cancelled) return;
      const identity = getIdentity();
      const token = getSessionToken();
      if (identity && token) {
        setAuthScreen('connections');
        // Track C Slice 1: refresh canonical relay list now that the
        // session token is bridged. The push-registration effect below
        // also calls this, but its empty-deps + getSessionToken() gate
        // can race the bridge on cold start; calling here too is a
        // belt-and-braces idempotent retry.
        const activeId = getActiveInstanceId();
        if (activeId) {
          void refreshInstanceInfo(activeId).catch(() => { /* non-fatal */ });
        }
      } else {
        setAuthScreen('welcome');
      }
    })();
    return () => { cancelled = true; };
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
    if (!inst) return;
    // Legacy-pair users (no device_id) can't register a token but we still
    // request the OS notification permission — Play Store Data Safety
    // expects a runtime prompt for every declared permission.
    if (!inst.device_id) {
      void requestPushPermission().catch(() => { /* swallow */ });
      return;
    }
    // Modern Ed25519-paired users: gate registration on the session token
    // being bridged into localStorage (App.tsx cold-start bridge can race
    // this effect on first launch).
    if (!getSessionToken()) return;
    void registerPush().catch(() => { /* swallow — silent by default per spec §8.7 */ });
    // Track C Slice 1: refresh instance metadata (incl. relay_endpoints) on
    // each launch / instance switch, so a relay rotation on the operator's
    // side is picked up without re-pairing. relays_changed is set when the
    // server's list differs from ours — a future iteration can drop the
    // current mesh connection here to force reconnect onto the new relay.
    void refreshInstanceInfo(inst.id).catch(() => { /* non-fatal */ });
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

  // ── Android hardware back button (Capacitor) ─────────────────
  // Priority: BottomSheets register themselves and pop first; then this
  // handler runs through More-menu → sub-screen → Home → exit-prompt.
  const handleAndroidBack = useCallback((): AppBackResult => {
    if (showMore)                      { setShowMore(false);      return 'handled'; }
    if (selectedMail && activeTab === 'std_thread') { setActiveTab('std_mail'); return 'handled'; }
    if (chatContact && activeTab === 'community_chat') { setChatContact(null); setActiveTab('community'); return 'handled'; }
    // Sub-screens that aren't a primary tab: bounce to home.
    // Includes both Pro-mode More-tile screens and Standard-mode std_* surfaces.
    const SUB_SCREENS: OrgTab[] = [
      'mail_setup', 'history', 'profile', 'settings', 'work', 'school',
      'calendar', 'mail', 'schedule', 'tasks', 'search', 'markets', 'radar', 'wallet',
      'portals', 'community', 'community_chat', 'missions', 'mywork',
      'std_calendar', 'std_wallet', 'std_voice', 'std_settings',
    ];
    if (SUB_SCREENS.includes(activeTab)) { setActiveTab('home'); return 'handled'; }
    // Chat with a session loaded → drop session + go home
    if (activeTab === 'chat' && sessionId) { setSessionId(null); setActiveTab('home'); return 'handled'; }
    // Capture / Approvals → home
    if (activeTab === 'capture' || activeTab === 'approvals') { setActiveTab('home'); return 'handled'; }
    // On home (or any root state) → ask for exit-prompt
    return 'exit';
  }, [showMore, activeTab, sessionId, selectedMail, chatContact]);

  useAndroidBackButton({ onBack: handleAndroidBack });

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
    <div className="safe-top flex flex-col overflow-hidden" style={{ height: '100dvh', background: 'var(--color-bg)' }}>
      {/* Multi-instance top bar (spec §4.2 + §8.9) — Pro only.
          Rendered only on Home; sub-screens carry their own page header
          and stacking InstanceTopBar above them produces a double-bar
          (regressed the May-3 single-header pass on Chat). */}
      {!isStandard && activeTab === 'home' && (
        <InstanceTopBar
          onAddInstance={() => setAuthScreen('join')}
          onOpenApprovals={() => { setActiveTab('approvals'); setShowMore(false); }}
          pendingApprovals={pendingApprovals}
        />
      )}

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
            onOpenSession={(sid) => { setSessionId(sid); setActiveTab('chat'); }}
          />
        )
      )}
      {activeTab === 'chat' && (
        <ChatPage
          orgId={selectedOrgId}
          sessionId={sessionId}
          moduleId={selectedModuleId}
          onSessionCreated={setSessionId}
          onClearModule={() => setSelectedModuleId(null)}
          onBack={() => setActiveTab('home')}
        />
      )}
      {activeTab === 'schedule' && <ScheduleScreen orgId={selectedOrgId} />}
      {activeTab === 'tasks' && <TaskScreen orgId={selectedOrgId} />}
      {activeTab === 'search' && <SearchScreen orgId={selectedOrgId} />}
      {activeTab === 'markets' && <MarketsScreen orgId={selectedOrgId} />}
      {activeTab === 'radar' && <RadarScreen orgId={selectedOrgId} />}
      {activeTab === 'wallet' && <WalletScreen orgId={selectedOrgId} />}
      {activeTab === 'portals' && (
        <PortalsScreen orgId={selectedOrgId} onBack={() => setActiveTab('home')} />
      )}
      {activeTab === 'community' && (
        <CommunityScreen
          orgId={selectedOrgId}
          onBack={() => setActiveTab('home')}
          onOpenChat={(hash, name) => {
            setChatContact({ hash, name });
            setActiveTab('community_chat');
          }}
        />
      )}
      {activeTab === 'community_chat' && chatContact && (
        <CommunityChatScreen
          orgId={selectedOrgId}
          contactHash={chatContact.hash}
          contactName={chatContact.name}
          onBack={() => setActiveTab('community')}
        />
      )}
      {activeTab === 'missions' && (
        <MissionsScreen orgId={selectedOrgId} onBack={() => setActiveTab('home')} />
      )}
      {activeTab === 'mywork' && (
        <MyWorkScreen
          orgId={selectedOrgId}
          onBack={() => setActiveTab('home')}
          onOpenSession={(sid) => { setSessionId(sid); setActiveTab('chat'); }}
        />
      )}
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
          orgName={selectedOrgName}
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
          onSelectModule={(moduleId) => {
            // Tapping a module starts a fresh session inside that module —
            // dropping prior sessionId so we don't graft a Sanctions Advisory
            // run onto, say, an open free-chat thread.
            setSelectedModuleId(moduleId);
            setSessionId(null);
            setActiveTab('chat');
          }}
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
          orgId={selectedOrgId}
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

      {/* More menu — bottom sheet (Phase I fix UX-H1, spec §9.3) — Pro only.
          Way Forward §06: monogram glyph system, no emoji. Each tile has its
          own Ico from the design-system set + a stable accent colour cue. */}
      {!isStandard && <BottomSheet open={showMore} onClose={() => setShowMore(false)} title="More" maxHeight="68dvh">
        <div className="grid grid-cols-3 gap-2.5">
          {([
            { id: 'work',     icon: 'briefcase',   label: 'Work',       tint: 'var(--color-accent)' },
            { id: 'mail',     icon: 'mail',        label: 'Mail',       tint: 'var(--color-blue)' },
            { id: 'calendar', icon: 'calendar',    label: 'Calendar',   tint: 'var(--color-accent)' },
            { id: 'school',   icon: 'graduation',  label: 'School',     tint: 'var(--color-blue)' },
            { id: 'schedule', icon: 'schedule',    label: 'Schedule',   tint: 'var(--color-text)' },
            { id: 'tasks',    icon: 'checkSquare', label: 'Tasks',      tint: 'var(--color-green)' },
            { id: 'search',   icon: 'search',      label: 'Pathfinder', tint: 'var(--color-accent)' },
            { id: 'markets',  icon: 'barChart',    label: 'Markets',    tint: 'var(--color-gold)' },
            { id: 'radar',    icon: 'radar',       label: 'Radar',      tint: 'var(--color-accent)' },
            { id: 'wallet',   icon: 'wallet',      label: 'Wallet',     tint: 'var(--color-text)' },
            { id: 'missions', icon: 'sparkles',    label: 'Missions',   tint: 'var(--color-accent)' },
            { id: 'mywork',   icon: 'briefcase',   label: 'My Work',    tint: 'var(--color-blue)' },
            { id: 'portals',  icon: 'grid',        label: 'Portals',    tint: 'var(--color-accent)' },
            { id: 'community',icon: 'user',        label: 'Community',  tint: 'var(--color-blue)' },
            { id: 'history',  icon: 'clock',       label: 'History',    tint: 'var(--color-text-muted)' },
            { id: 'profile',  icon: 'user',        label: 'Profile',    tint: 'var(--color-text)' },
            { id: 'settings', icon: 'settings',    label: 'Settings',   tint: 'var(--color-text-muted)' },
            { id: 'back',     icon: 'switchOrg',   label: 'Switch Org', tint: 'var(--color-text-body)' },
          ] as const).map(item => (
            <button
              key={item.id}
              onClick={() => {
                setShowMore(false);
                if (item.id === 'back') { setSelectedOrgId(null); setAuthScreen('connections'); }
                else setActiveTab(item.id as OrgTab);
              }}
              className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-r2)] py-3.5 transition hover:shadow-sm active:scale-[0.97]"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)',
                minHeight: 78,
              }}
            >
              <span
                className="flex items-center justify-center rounded-[var(--radius-r1)]"
                style={{
                  width: 36, height: 36,
                  background: 'var(--color-surface-alt)',
                  color: item.tint,
                }}
              >
                <Ico name={item.icon} size={20} />
              </span>
              <span className="text-[11px] font-semibold" style={{ color: 'var(--color-text-body)' }}>
                {item.label}
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>}

      {/* QuickActionsFab REMOVED (May-3 IRE pass): world-class AI apps
          (Claude, ChatGPT, Linear) ship zero FABs. The composer is the
          primary action on Chat; Voice/Capture/Approvals are reachable via
          tabs and the Home quick-action grid. The teal floating + read as
          the strongest "not-Claude" signal in the entire app. */}

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
