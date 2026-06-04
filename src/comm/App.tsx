import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import OnboardingScreen from './pages/OnboardingScreen';
import ChatListScreen from './pages/ChatListScreen';
import TabBar, { type TabId } from './components/TabBar';
import TopBar from './components/TopBar';
import LoadingShell from './components/LoadingShell';
import { hasIdentity } from './services/identity';
import { startRelayClient, stopRelayClient } from './services/relay-client';
import { reconcileAllReminders } from './services/event-reminders';
import { reconcileScheduleNotifications } from './services/schedules';
import { reconcileLiveShares } from './services/geo';
import { maybeRunIdlePoll } from './services/idle-poller';
import { notifyIncoming, ensureNotificationPermission } from './services/notifications';
import { useAndroidBackButton, type AppBackResult } from './hooks/useAndroidBackButton';
import LockScreen from './components/LockScreen';
import { isAppLockEnabled, APP_LOCK_GRACE_MS } from './services/app-lock';

// P4-1: every screen the user can navigate to but doesn't see on cold
// boot is lazy-loaded. The "default landing" (ChatListScreen + TopBar +
// TabBar + Onboarding for first-run) stays in the main chunk so the
// app paints instantly. Switching tabs or pushing a detail view fetches
// its chunk on demand — every chunk is a single .js file in the
// Capacitor bundle so the WebView reads it from disk in <50 ms.
const SettingsScreen = lazy(() => import('./pages/SettingsScreen'));
const AddContactScreen = lazy(() => import('./pages/AddContactScreen'));
const RequestsScreen = lazy(() => import('./pages/RequestsScreen'));
const ChatThreadScreen = lazy(() => import('./pages/ChatThreadScreen'));
const EventsScreen = lazy(() => import('./pages/EventsScreen'));
const EventCreateScreen = lazy(() => import('./pages/EventCreateScreen'));
const EventDetailScreen = lazy(() => import('./pages/EventDetailScreen'));
const PortalsBrowseScreen = lazy(() => import('./pages/PortalsBrowseScreen'));
const PortalDetailScreen = lazy(() => import('./pages/PortalDetailScreen'));
const WassupFeedScreen = lazy(() => import('./pages/WassupFeedScreen'));
const WassupComposeScreen = lazy(() => import('./pages/WassupComposeScreen'));
const WassupPostDetailScreen = lazy(() => import('./pages/WassupPostDetailScreen'));
const WalletScreen = lazy(() => import('./pages/WalletScreen'));
const PaymentDetailsScreen = lazy(() => import('./pages/PaymentDetailsScreen'));
const MoneyProfileScreen = lazy(() => import('./pages/MoneyProfileScreen'));
const ActivityReviewScreen = lazy(() => import('./pages/ActivityReviewScreen'));

// Canonical relay URLs have no path component (spec §4.2.1). Frame routing
// inside the relay is by frame-type byte — instance/phone vs comm — so a
// single relay process handles both protocols on the same WS endpoint.
const RELAY_URL = (import.meta.env.VITE_COMM_RELAY_URL as string | undefined)
  ?? 'wss://relay.futurechain.eu';

type View =
  | 'onboarding'
  | 'tabs'
  | 'profile'
  | 'payment-details'
  | 'money-profile'
  | 'activity-review'
  | 'add-contact'
  | 'requests'
  | 'chat-thread'
  | 'event-create'
  | 'event-detail'
  | 'portal-detail'
  | 'wassup-compose'
  | 'wassup-post';

export default function App() {
  const [view, setView] = useState<View>(hasIdentity() ? 'tabs' : 'onboarding');
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [identityVersion, setIdentityVersion] = useState(0);
  const [contactsVersion, setContactsVersion] = useState(0);
  const [eventsVersion, setEventsVersion] = useState(0);
  const [openChatHash, setOpenChatHash] = useState<string | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [openPortalAddress, setOpenPortalAddress] = useState<string | null>(null);
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [wassupVersion, setWassupVersion] = useState(0);
  /** A `futurechain:pay` URI handed to the Wallet tab when a scheduled-
   *  payment notification is tapped — opens straight into review. */
  const [walletDeepLinkUri, setWalletDeepLinkUri] = useState<string | null>(null);
  /** App-open biometric lock — starts locked when the user enabled it. */
  const [locked, setLocked] = useState<boolean>(() => isAppLockEnabled());
  const hiddenAtRef = useRef<number>(0);

  useEffect(() => {
    if (view === 'tabs' && !hasIdentity()) setView('onboarding');
  }, [view]);

  // Android hardware back button — first close overlays (back-stack), then
  // step out of nested views, then ask "exit?" at the root.
  useAndroidBackButton({
    onBack(): AppBackResult {
      if (view === 'chat-thread') { setOpenChatHash(null); setView('tabs'); return 'handled'; }
      if (view === 'event-detail') { setOpenEventId(null); setView('tabs'); return 'handled'; }
      if (view === 'portal-detail') { setOpenPortalAddress(null); setView('tabs'); return 'handled'; }
      if (view === 'event-create') { setView('tabs'); return 'handled'; }
      if (view === 'wassup-compose') { setView('tabs'); return 'handled'; }
      if (view === 'wassup-post') { setOpenPostId(null); setView('tabs'); return 'handled'; }
      if (view === 'add-contact') { setView('tabs'); return 'handled'; }
      if (view === 'requests') { setView('tabs'); return 'handled'; }
      if (view === 'payment-details') { setView('profile'); return 'handled'; }
      if (view === 'money-profile') { setView('profile'); return 'handled'; }
      if (view === 'activity-review') { setView('profile'); return 'handled'; }
      if (view === 'profile') { setView('tabs'); return 'handled'; }
      // At root tabs — if not on chat, bounce to chat first; else exit
      if (view === 'tabs' && activeTab !== 'chat') { setActiveTab('chat'); return 'handled'; }
      return 'exit';
    },
  });

  // Relay client lifecycle — start when identity exists, stop on sign-out.
  useEffect(() => {
    if (!hasIdentity()) return;
    startRelayClient({
      relayUrl: RELAY_URL,
      onMessage: () => {
        setContactsVersion((v) => v + 1);
        setEventsVersion((v) => v + 1);
        setWassupVersion((v) => v + 1);
      },
      // #68 — a contact_request landed in the tray; refresh the chat list so
      // its Requests banner + count update.
      onContactRequest: () => {
        setContactsVersion((v) => v + 1);
      },
    });
    // R11 — sync local notifications for any events with reminders set.
    // Survives process restart because the events store has the source of truth.
    void reconcileAllReminders();
    // R13 — resume live-share tickers for any of our outgoing location
    // bubbles whose liveUntil is still in the future.
    void reconcileLiveShares();
    // #79 Phase 6 — re-arm scheduled-payment reminders (a fresh install /
    // OS-cleared notifications get back to a healthy state).
    void reconcileScheduleNotifications();
    // #82 — broadcast my profile (name + avatar) to contacts so peers learn
    // (and re-learn) my face each session. Slight delay so the relay socket
    // is up; sends queue to the inline outbox if it isn't.
    void import('./services/chat').then((m) => m.broadcastProfile()).catch(() => {});
    return () => stopRelayClient();
  }, [identityVersion]);

  // #79 Phase 6 — scheduled-payment notification tap → open the prefilled
  // send flow on the Wallet tab. The plugin is absent on web (dynamic
  // import is a no-op there), so this only fires inside the Capacitor app.
  useEffect(() => {
    let remove: (() => void) | undefined;
    void (async () => {
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const handle = await LocalNotifications.addListener(
          'localNotificationActionPerformed',
          async (action) => {
            const scheduleId = (action?.notification?.extra as { scheduleId?: string } | undefined)?.scheduleId;
            if (!scheduleId) return;
            const [{ getSchedule }, { scheduleToPayUri }] = await Promise.all([
              import('./services/schedules'),
              import('./services/schedule-to-payment'),
            ]);
            const s = await getSchedule(scheduleId);
            if (!s) return;
            setWalletDeepLinkUri(scheduleToPayUri(s));
            setActiveTab('wallet');
            setView('tabs');
          },
        );
        remove = () => { void handle.remove(); };
      } catch { /* plugin unavailable (web) — no-op */ }
    })();
    return () => { remove?.(); };
  }, []);

  /**
   * Polling strategy (redesigned 2026-05-21):
   *
   *   - Idle floor: once-per-day opportunistic poll on app foreground
   *     (services/idle-poller.ts). Replaces the previous always-on
   *     30 s timer that Coinbase's engineering blog explicitly calls
   *     an anti-pattern.
   *   - Hot polling lives on the Wallet tab (WalletBalanceScreen /
   *     WalletReceiveScreen) — bounded active-sync via
   *     services/active-sync.ts when the user explicitly expects a
   *     payment.
   *   - Permission prompt fires on mount, cached.
   */
  useEffect(() => {
    let cancelled = false;
    void ensureNotificationPermission();

    const onForeground = async () => {
      const fresh = await maybeRunIdlePoll();
      if (cancelled || !fresh) return;
      for (const incoming of fresh) {
        void notifyIncoming(incoming.tx, incoming.fromName);
      }
    };
    void onForeground();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void onForeground();
        if (isAppLockEnabled() && hiddenAtRef.current > 0
            && Date.now() - hiddenAtRef.current > APP_LOCK_GRACE_MS) {
          setLocked(true);
        }
        hiddenAtRef.current = 0;
      } else {
        hiddenAtRef.current = Date.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // App-open lock — biometric gate over the whole UI when enabled.
  if (locked) {
    return <LockScreen onUnlock={() => setLocked(false)} />;
  }

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
      <Suspense fallback={<LoadingShell />}>
        <SettingsScreen
          onBack={() => setView('tabs')}
          onPaymentDetails={() => setView('payment-details')}
          onMoneyProfile={() => setView('money-profile')}
          onActivityReview={() => setView('activity-review')}
          onSignedOut={() => {
            setIdentityVersion((v) => v + 1);
            setView('onboarding');
            setActiveTab('chat');
          }}
        />
      </Suspense>
    );
  }

  if (view === 'payment-details') {
    return (
      <Suspense fallback={<LoadingShell />}>
        <PaymentDetailsScreen onBack={() => setView('profile')} />
      </Suspense>
    );
  }

  if (view === 'money-profile') {
    return (
      <Suspense fallback={<LoadingShell />}>
        <MoneyProfileScreen onBack={() => setView('profile')} />
      </Suspense>
    );
  }

  if (view === 'activity-review') {
    return (
      <Suspense fallback={<LoadingShell />}>
        <ActivityReviewScreen onBack={() => setView('profile')} />
      </Suspense>
    );
  }

  if (view === 'add-contact') {
    return (
      <Suspense fallback={<LoadingShell />}>
        <AddContactScreen
          onBack={() => setView('tabs')}
          onAdded={() => {
            setContactsVersion((v) => v + 1);
            setView('tabs');
            setActiveTab('chat');
          }}
        />
      </Suspense>
    );
  }

  if (view === 'requests') {
    return (
      <Suspense fallback={<LoadingShell />}>
        <RequestsScreen
          onBack={() => setView('tabs')}
          onChanged={() => setContactsVersion((v) => v + 1)}
        />
      </Suspense>
    );
  }

  if (view === 'chat-thread' && openChatHash) {
    return (
      <Suspense fallback={<LoadingShell />}>
        <ChatThreadScreen
          peerContactHash={openChatHash}
          onBack={() => { setOpenChatHash(null); setView('tabs'); }}
          onOpenEvent={(id) => { setOpenEventId(id); setView('event-detail'); }}
        />
      </Suspense>
    );
  }

  if (view === 'event-create') {
    return (
      <Suspense fallback={<LoadingShell />}>
        <EventCreateScreen
          onCancel={() => setView('tabs')}
          onCreated={() => {
            setEventsVersion((v) => v + 1);
            setView('tabs');
            setActiveTab('events');
          }}
        />
      </Suspense>
    );
  }

  if (view === 'event-detail' && openEventId) {
    return (
      <Suspense fallback={<LoadingShell />}>
        <EventDetailScreen
          eventId={openEventId}
          onBack={() => {
            setEventsVersion((v) => v + 1);
            setOpenEventId(null);
            setView('tabs');
          }}
        />
      </Suspense>
    );
  }

  if (view === 'portal-detail' && openPortalAddress) {
    return (
      <Suspense fallback={<LoadingShell />}>
        <PortalDetailScreen
          portalAddress={openPortalAddress}
          onBack={() => { setOpenPortalAddress(null); setView('tabs'); }}
        />
      </Suspense>
    );
  }

  if (view === 'wassup-compose') {
    return (
      <Suspense fallback={<LoadingShell />}>
        <WassupComposeScreen
          onCancel={() => setView('tabs')}
          onPosted={() => {
            setWassupVersion((v) => v + 1);
            setView('tabs');
            setActiveTab('wassup');
          }}
        />
      </Suspense>
    );
  }

  if (view === 'wassup-post' && openPostId) {
    return (
      <Suspense fallback={<LoadingShell />}>
        <WassupPostDetailScreen
          postId={openPostId}
          onBack={() => {
            setWassupVersion((v) => v + 1);
            setOpenPostId(null);
            setView('tabs');
          }}
        />
      </Suspense>
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
            onOpenRequests={() => setView('requests')}
            onOpenChat={(hash) => { setOpenChatHash(hash); setView('chat-thread'); }}
          />
        )}
        {activeTab === 'wassup' && (
          <Suspense fallback={<LoadingShell />}>
            <WassupFeedScreen
              refreshKey={wassupVersion}
              onCompose={() => setView('wassup-compose')}
              onOpenPost={(id) => { setOpenPostId(id); setView('wassup-post'); }}
            />
          </Suspense>
        )}
        {activeTab === 'events' && (
          <Suspense fallback={<LoadingShell />}>
            <EventsScreen
              refreshKey={eventsVersion}
              onCreate={() => setView('event-create')}
              onOpenEvent={(id) => { setOpenEventId(id); setView('event-detail'); }}
            />
          </Suspense>
        )}
        {activeTab === 'portals' && (
          <Suspense fallback={<LoadingShell />}>
            <PortalsBrowseScreen
              onOpenPortal={(addr) => { setOpenPortalAddress(addr); setView('portal-detail'); }}
            />
          </Suspense>
        )}
        {activeTab === 'wallet' && (
          <Suspense fallback={<LoadingShell />}>
            <WalletScreen
              deepLinkUri={walletDeepLinkUri}
              onDeepLinkConsumed={() => setWalletDeepLinkUri(null)}
            />
          </Suspense>
        )}
      </main>
      <TabBar active={activeTab} onChange={setActiveTab} />
    </div>
  );
}
