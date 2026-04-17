import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  SearchCheck, FileText, Shield, Radar, GraduationCap, Database, BarChart3, Search,
  Home, MessageSquare, Workflow, Handshake, Rocket, Presentation, FlaskConical,
  ChevronLeft, ChevronRight, ChevronDown, Clock, FolderOpen, Puzzle, Zap, Compass, Layers, MessageCircle,
  FileEdit, Plug, Bot,
  // Wave 1 area module icons
  FileSearch, FileCheck, GitCompare, Lock, ScrollText,
  ClipboardList, TestTube, FileWarning, ClipboardCheck,
  Send, Network, RefreshCw,
  TrendingDown, CreditCard, BarChart2, Building, PackageCheck,
  AlertTriangle, Gauge, Settings, GitBranch, Share2,
  // Area header icons
  Scale, Briefcase, Building2,
  // Wave 2 area header icons
  ShieldAlert, Leaf, LineChart, FolderKanban, TrendingUp, BarChart,
  // Wave 2 module icons (existing)
  Activity, CloudLightning, Cpu, Globe, PieChart, Target, BookOpen,
  Users, CheckSquare, Calendar, DollarSign, BarChartHorizontal, TreePine,
  // Wave 2 module icons (new)
  ShieldCheck, ScanSearch, Siren, DatabaseZap, AlertCircle,
  FileBarChart, CircleDot, Thermometer, Crosshair, MapPin,
  // Wave 3 area + module icons
  Megaphone, Newspaper, Mic, Link, Star, Palette, Code, Heart, Factory, Wallet, Map,
  Package, Terminal,
  // Expansion area icons (Phase 4)
  Landmark, Smartphone, Sprout, ShoppingBag, HardHat, PiggyBank, Bird, ChefHat, Wrench, ShoppingCart,
  // Feature pages
  ScanText,
  Brain,
  Database as DatabaseIcon,
  Eye,
  Calculator,
  // Mobile close button
  X as XIcon,
  // Community sub-nav
  Users2, Mail, CalendarDays, Hexagon,
  // Orchestration Dashboard
  LayoutDashboard,
  // Regulatory Feed
  Rss,
  // Mission Inbox
  Inbox,
} from 'lucide-react';
import { MODULES, AREAS } from '@/lib/constants';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { fetchSessions, fetchProfile, fetchSessionStats, getAuthHeader, type CustomModuleData } from '@/lib/api';
import type { Session } from '@/lib/types';
import AreaDashboard from './AreaDashboard';
import { loadHiddenNavItems, ALL_NAV_ITEMS } from './NavItemConfig';
import NavLinkWithStar from './NavLinkWithStar';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  // FCP area
  SearchCheck, FileText, Shield, Radar, GraduationCap, Database, BarChart3,
  Search, Handshake, Rocket, Presentation, FlaskConical, Home,
  // Legal area
  FileSearch, FileCheck, GitCompare, Lock, ScrollText, Scale,
  // Audit area
  ClipboardList, TestTube, FileWarning, ClipboardCheck,
  // Consulting area
  Send, Network, RefreshCw, Briefcase,
  // Banking area
  TrendingDown, CreditCard, BarChart2, Building, PackageCheck, Building2,
  // Risk area
  AlertTriangle, Gauge, Settings, GitBranch, Share2,
  // Wave 2 area headers + existing module icons
  ShieldAlert, Leaf, LineChart, FolderKanban, TrendingUp, BarChart,
  Activity, CloudLightning, Cpu, Globe, PieChart, Target, BookOpen, Compass,
  Users, CheckSquare, Calendar, DollarSign, BarChartHorizontal, TreePine,
  Puzzle, Zap,
  // Wave 2 new module icons
  ShieldCheck, ScanSearch, Siren, DatabaseZap, Layers, AlertCircle,
  FileBarChart, CircleDot, Thermometer, Crosshair, MapPin,
  // Wave 3 area + module icons
  Megaphone, Newspaper, Mic, Link, Star, Palette, Code, Heart, Factory, Wallet, Map,
  Terminal,
  // Expansion area icons (Phase 4)
  Landmark, Smartphone, Sprout, ShoppingBag, HardHat, PiggyBank, Bird, ChefHat,
  // Feature pages
  ScanText,
};

// Color classes per area (must be complete strings for Tailwind not to purge)
const AREA_COLORS: Record<string, { dot: string; text: string; active: string }> = {
  fcp:           { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
  legal:         { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  audit:         { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  consulting:    { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },
  banking:       { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  risk:          { dot: 'bg-adv-red',     text: 'text-adv-red',     active: 'bg-adv-red/10 text-adv-red' },
  // Wave 2 areas
  cyber:            { dot: 'bg-adv-red',     text: 'text-adv-red',     active: 'bg-adv-red/10 text-adv-red' },
  esg:              { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },
  investment:       { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
  strategy:         { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  'data-analytics': { dot: 'bg-adv-blue',   text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  'project-mgmt':   { dot: 'bg-adv-green',  text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },
  // Wave 3 areas
  startups:           { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  'personal-dev':     { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
  academic:           { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  'comms-pr':         { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },
  hr:                 { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  accounting:         { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  branding:           { dot: 'bg-adv-red',     text: 'text-adv-red',     active: 'bg-adv-red/10 text-adv-red' },
  'software-eng':     { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
  sales:              { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },
  insurance:          { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  'real-estate':      { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  'personal-finance': { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },
  healthcare:         { dot: 'bg-adv-red',     text: 'text-adv-red',     active: 'bg-adv-red/10 text-adv-red' },
  manufacturing:      { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
  'public-sector':    { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  'consumer-legal':   { dot: 'bg-adv-red',     text: 'text-adv-red',     active: 'bg-adv-red/10 text-adv-red' },
  education:          { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  coding:             { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
  // Phase 4: Professional Deepening
  marketing:              { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  'tax-transfer-pricing': { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  design:                 { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
  journalism:             { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },
  'data-privacy':         { dot: 'bg-adv-red',     text: 'text-adv-red',     active: 'bg-adv-red/10 text-adv-red' },
  'product-management':   { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  // Phase 4: Islamic Finance & Global South
  'islamic-finance':      { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  'mobile-money':         { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },
  microfinance:           { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
  government:             { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  // Life Platform Tabs
  news:                   { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  finance:                { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
  travel:                 { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  community:              { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },
  // NGO & Social Impact hub
  ngo:                    { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },
  // Trades & Service Workers hub
  trades:                 { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  // PE/VC hub
  'pe-vc':                { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  // Phase 4: Bottom-of-Pyramid (BoP)
  'government-services':  { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  'smallholder-farming':  { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },
  'micro-business':       { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  'workers-rights':       { dot: 'bg-adv-red',     text: 'text-adv-red',     active: 'bg-adv-red/10 text-adv-red' },
  'personal-finance-bop': { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
  'credit-navigator':     { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  'land-rights':          { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  'consumer-protection':  { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
  'community-health':     { dot: 'bg-adv-red',     text: 'text-adv-red',     active: 'bg-adv-red/10 text-adv-red' },
  'education-literacy':   { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  'food-business':        { dot: 'bg-adv-gold',    text: 'text-adv-gold',    active: 'bg-adv-gold/10 text-adv-gold' },
  'artisan-craft':        { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
  'livestock-poultry':    { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },
  // New Pillars
  procure:                { dot: 'bg-adv-blue',    text: 'text-adv-blue',    active: 'bg-adv-blue/10 text-adv-blue' },
  civic:                  { dot: 'bg-adv-green',   text: 'text-adv-green',   active: 'bg-adv-green/10 text-adv-green' },
  grow:                   { dot: 'bg-adv-teal',    text: 'text-adv-teal',    active: 'bg-adv-teal-dim text-adv-teal' },
};

// Fallback color for any area not in AREA_COLORS
const DEFAULT_AREA_COLOR = { dot: 'bg-adv-gray', text: 'text-adv-gray', active: 'bg-adv-card text-adv-off-white' };

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

// ── Deadlines Nav Link with urgency badge ─────────────────────────────────────

interface DeadlinesNavLinkProps {
  sidebarCollapsed: boolean;
  collapsedLinkClass: (isActive: boolean) => string;
  linkClass: (isActive: boolean, areaId?: string) => string;
}

function DeadlinesNavLink({ sidebarCollapsed, collapsedLinkClass, linkClass }: DeadlinesNavLinkProps) {
  const { t } = useTranslation();
  const [urgentCount, setUrgentCount] = useState(0);

  useEffect(() => {
    function getAuthHeader(): Record<string, string> {
      const token = localStorage.getItem('openexpert-token');
      return token ? { Authorization: `Bearer ${token}` } : {};
    }
    fetch('/api/deadlines/morning-brief', { headers: { ...getAuthHeader() } })
      .then((r) => r.ok ? r.json() as Promise<{ overdue: unknown[]; atRisk: unknown[] }> : Promise.resolve({ overdue: [], atRisk: [] }))
      .then((data) => {
        setUrgentCount((data.overdue?.length ?? 0) + (data.atRisk?.length ?? 0));
      })
      .catch(() => {});
  }, []);

  return (
    <NavLink
      to="/deadlines"
      title={sidebarCollapsed ? t('nav.deadlines') : undefined}
      className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
    >
      <div className="relative shrink-0">
        <Calendar className="h-4 w-4" />
        {urgentCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-adv-red text-xs font-bold text-white">
            {urgentCount > 9 ? '9+' : urgentCount}
          </span>
        )}
      </div>
      {!sidebarCollapsed && (
        <span className="flex flex-1 items-center justify-between">
          {t('nav.deadlines')}
          {urgentCount > 0 && (
            <span className="ml-auto rounded-full bg-adv-red/20 px-1.5 py-0.5 text-xs font-semibold text-adv-red">
              {urgentCount}
            </span>
          )}
        </span>
      )}
    </NavLink>
  );
}

/**
 * Pending-inbound-delegation count badge for the Missions sub-nav.
 * Polls /api/missions/delegations/inbound every 60s when the sidebar
 * is mounted (it only counts status='received' rows).
 */
function MissionInboxBadge() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    function getAuthHeader(): Record<string, string> {
      const token = localStorage.getItem('openexpert-token');
      return token ? { Authorization: `Bearer ${token}` } : {};
    }
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch('/api/missions/delegations/inbound', { headers: getAuthHeader() });
        if (!r.ok) return;
        const data = await r.json() as { delegations?: Array<{ status: string }> };
        if (cancelled) return;
        setCount((data.delegations ?? []).filter(d => d.status === 'received').length);
      } catch { /* ignore */ }
    }
    void load();
    const iv = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void load();
    }, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);
  if (count === 0) return null;
  return (
    <span className="ml-auto rounded-full bg-adv-gold/20 px-1.5 py-0.5 text-xs font-semibold text-adv-gold">
      {count > 9 ? '9+' : count}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isLifeMode = ['/life', '/news', '/finance', '/travel'].some(r => pathname.startsWith(r));
  const isCommunityMode = pathname.startsWith('/community');
  const isPaymentsMode = pathname.startsWith('/futurechain');
  const isPathfinderMode = pathname.startsWith('/pathfinder');
  const isMarketsMode = pathname.startsWith('/markets');
  const isProcureMode = pathname.startsWith('/procure');
  const isCivicMode = pathname.startsWith('/civic');
  const isGrowMode = pathname.startsWith('/grow');
  const { sidebarCollapsed, toggleSidebar, setAppMode } = useSettingsStore();
  // RESP-01: force icon-only at md breakpoint (768-1024px) regardless of user toggle
  const [isForcedMini, setIsForcedMini] = useState(() => window.innerWidth >= 768 && window.innerWidth < 1024);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (max-width: 1023px)');
    const handler = (e: MediaQueryListEvent) => setIsForcedMini(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const mini = sidebarCollapsed || isForcedMini;
  const { user: authUser, isTeamMode } = useAuthStore();
  const isAdmin = authUser?.role === 'admin' || !isTeamMode;
  // Track which areas are expanded — FCP open by default
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set(['fcp']));
  const [profileName, setProfileName] = useState('');
  const [profileRole, setProfileRole] = useState('');
  const [topModules, setTopModules] = useState<Array<{ moduleId: string; count: number }>>([]);
  const [areaSessionCounts, setAreaSessionCounts] = useState<Record<string, number>>({});
  const [customModules, setCustomModules] = useState<CustomModuleData[]>([]);

  // Navigation favorites and hidden items
  const [favoriteNavItems, setFavoriteNavItems] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('openexpert-favorite-nav-items');
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });
  const [hiddenNavItems] = useState<Set<string>>(loadHiddenNavItems);

  const toggleNavFavorite = (navId: string) => {
    setFavoriteNavItems((prev) => {
      const next = new Set(prev);
      if (next.has(navId)) {
        next.delete(navId);
      } else {
        next.add(navId);
      }
      localStorage.setItem('openexpert-favorite-nav-items', JSON.stringify([...next]));
      return next;
    });
  };

  // Collapsible sidebar sections — persisted in localStorage
  const [moduleSearch, setModuleSearch] = useState('');
  const [sectionsExpanded, setSectionsExpanded] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem('openexpert-sidebar-sections');
      return raw ? JSON.parse(raw) : { interaction: true, tools: false, modules: true, recent: false };
    } catch {
      return { interaction: true, tools: false, modules: true, recent: false };
    }
  });

  const toggleSection = (section: string) => {
    setSectionsExpanded((prev) => {
      const next = { ...prev, [section]: !prev[section] };
      localStorage.setItem('openexpert-sidebar-sections', JSON.stringify(next));
      return next;
    });
  };

  useEffect(() => {
    // Fetch custom (user-built) modules so they appear under their assigned area
    fetch('/api/custom-modules', { headers: getAuthHeader() })
      .then((r) => r.ok ? r.json() : [])
      .then((list: CustomModuleData[]) => setCustomModules(list))
      .catch(() => {});

    fetchProfile()
      .then((data) => {
        setProfileName((data.display_name as string) || (data.name as string) || '');
        setProfileRole((data.role_title as string) || (data.role as string) || '');
      })
      .catch(() => {});
    fetchSessionStats()
      .then((stats) => {
        setTopModules(stats.topModules || []);
        // Compute sessions per area from topModules
        const counts: Record<string, number> = {};
        for (const area of AREAS) {
          const areaSet = new Set(area.moduleIds as readonly string[]);
          counts[area.id] = (stats.topModules || [])
            .filter((m) => areaSet.has(m.moduleId))
            .reduce((sum, m) => sum + m.count, 0);
        }
        setAreaSessionCounts(counts);
      })
      .catch(() => {});
  }, []);

  const toggleArea = (areaId: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev);
      if (next.has(areaId)) next.delete(areaId);
      else next.add(areaId);
      return next;
    });
  };

  const linkClass = (isActive: boolean, areaId?: string) => {
    const colors = areaId ? (AREA_COLORS[areaId] ?? DEFAULT_AREA_COLOR) : null;
    return `mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
      isActive && colors
        ? colors.active
        : isActive
        ? 'bg-adv-teal-dim text-adv-teal'
        : 'text-adv-gray hover:bg-adv-card hover:text-adv-off-white'
    }`;
  };

  const collapsedLinkClass = (isActive: boolean) =>
    `mb-0.5 flex items-center justify-center rounded-lg p-2.5 transition-colors ${
      isActive
        ? 'bg-adv-teal-dim text-adv-teal'
        : 'text-adv-gray hover:bg-adv-card hover:text-adv-off-white'
    }`;

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
    <aside
      className={`flex flex-col border-r border-border bg-adv-dark-2 transition-all duration-200 overflow-hidden
        ${mobileOpen ? 'fixed inset-y-0 left-0 z-50 w-[280px] overflow-visible' : 'hidden md:flex'}
        md:static md:z-auto
        ${!mobileOpen ? (mini ? 'md:w-16' : `md:w-16 lg:w-[280px]`) : ''}
      `}
    >
      {/* Logo */}
      <div className={`flex h-16 items-center border-b border-border ${mini ? 'justify-center px-2' : 'gap-3 px-6'}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0D7D6C]">
          <span className="text-sm font-bold text-white">A</span>
        </div>
        {!sidebarCollapsed && (
          <div className="flex-1">
            <div className="text-sm font-semibold text-adv-white">Anton</div>
            <div className="text-xs text-adv-gray">by openEXPERT</div>
          </div>
        )}
        {/* Mobile close button */}
        {mobileOpen && (
          <button
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-adv-gray hover:text-adv-off-white transition-colors lg:hidden"
            aria-label={t('nav.closeSidebar')}
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-auto px-2 py-4">
        {/* ── Pathfinder sidebar ───────────────────────────────────────── */}
        {isPathfinderMode && (
          <>
            {!sidebarCollapsed ? (
              <div className="mb-4 px-1">
                <button
                  onClick={() => { setAppMode('work'); navigate('/'); }}
                  className="mb-3 flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back to Work
                </button>
                <div className="px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal">Pathfinder</div>
              </div>
            ) : (
              <button
                onClick={() => { setAppMode('work'); navigate('/'); }}
                className={collapsedLinkClass(false)}
                title="Back to Work"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}

            <NavLink
              to="/pathfinder"
              end
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Search' : undefined}
            >
              <Search className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Search'}
            </NavLink>

            <NavLink
              to="/pathfinder/history"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'History' : undefined}
            >
              <Clock className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'History'}
            </NavLink>
          </>
        )}

        {/* ── Life Platform sidebar ─────────────────────────────────────── */}
        {isLifeMode && (
          <>
            {/* Back to Work + header */}
            {!sidebarCollapsed ? (
              <div className="mb-4 px-1">
                <button
                  onClick={() => { setAppMode('work'); navigate('/'); }}
                  className="mb-3 flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back to Work
                </button>
                <div className="px-2 text-xs font-semibold uppercase tracking-wider text-adv-gray">Life Platform</div>
              </div>
            ) : (
              <button
                onClick={() => { setAppMode('work'); navigate('/'); }}
                className={collapsedLinkClass(false)}
                title="Back to Work"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}

            {/* Life Hub */}
            <NavLink
              to="/life"
              end
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Life Hub' : undefined}
            >
              <Globe className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Life Hub'}
            </NavLink>

            {/* ── News ── */}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#3498DB' }}>
                News
              </div>
            )}
            <NavLink
              to="/news"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'News' : undefined}
            >
              <Newspaper className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Overview'}
            </NavLink>
            {!sidebarCollapsed && (
              <div className="mb-3 ml-4 flex flex-col gap-0.5 border-l pl-3" style={{ borderColor: '#3498DB30' }}>
                <NavLink to="/news/feed" className={({ isActive }) => `flex items-center rounded-lg px-2 py-1.5 text-xs transition ${isActive ? 'text-[#3498DB]' : 'text-adv-gray hover:text-adv-off-white'}`}>Feed</NavLink>
                <NavLink to="/news/truth-check" className={({ isActive }) => `flex items-center rounded-lg px-2 py-1.5 text-xs transition ${isActive ? 'text-[#3498DB]' : 'text-adv-gray hover:text-adv-off-white'}`}>Truth Check</NavLink>
                <NavLink to="/news/sources" className={({ isActive }) => `flex items-center rounded-lg px-2 py-1.5 text-xs transition ${isActive ? 'text-[#3498DB]' : 'text-adv-gray hover:text-adv-off-white'}`}>Sources</NavLink>
                <NavLink to="/news/my-bias" className={({ isActive }) => `flex items-center rounded-lg px-2 py-1.5 text-xs transition ${isActive ? 'text-[#3498DB]' : 'text-adv-gray hover:text-adv-off-white'}`}>My Bias</NavLink>
              </div>
            )}

            {/* ── Finance ── */}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            {!sidebarCollapsed && (
              <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#2DD4A8' }}>
                Finance
              </div>
            )}
            <NavLink
              to="/finance"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Finance' : undefined}
            >
              <Wallet className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Overview'}
            </NavLink>
            {!sidebarCollapsed && (
              <div className="mb-3 ml-4 flex flex-col gap-0.5 border-l pl-3" style={{ borderColor: '#2DD4A830' }}>
                <NavLink to="/finance/learn" className={({ isActive }) => `flex items-center rounded-lg px-2 py-1.5 text-xs transition ${isActive ? 'text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}>Learn</NavLink>
                <NavLink to="/finance/calculators" className={({ isActive }) => `flex items-center rounded-lg px-2 py-1.5 text-xs transition ${isActive ? 'text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}>Calculators</NavLink>
                <NavLink to="/finance/market" className={({ isActive }) => `flex items-center rounded-lg px-2 py-1.5 text-xs transition ${isActive ? 'text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}>Markets</NavLink>
                <NavLink to="/finance/goals" className={({ isActive }) => `flex items-center rounded-lg px-2 py-1.5 text-xs transition ${isActive ? 'text-adv-teal' : 'text-adv-gray hover:text-adv-off-white'}`}>Goals</NavLink>
              </div>
            )}

            {/* ── Travel ── */}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            {!sidebarCollapsed && (
              <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider" style={{ color: '#F5A623' }}>
                Travel
              </div>
            )}
            <NavLink
              to="/travel"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Travel' : undefined}
            >
              <Map className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Overview'}
            </NavLink>
            {!sidebarCollapsed && (
              <div className="mb-3 ml-4 flex flex-col gap-0.5 border-l pl-3" style={{ borderColor: '#F5A62330' }}>
                <NavLink to="/travel/trips" className={({ isActive }) => `flex items-center rounded-lg px-2 py-1.5 text-xs transition ${isActive ? 'text-adv-gold' : 'text-adv-gray hover:text-adv-off-white'}`}>My Trips</NavLink>
                <NavLink to="/travel/planner" className={({ isActive }) => `flex items-center rounded-lg px-2 py-1.5 text-xs transition ${isActive ? 'text-adv-gold' : 'text-adv-gray hover:text-adv-off-white'}`}>Trip Planner</NavLink>
                <NavLink to="/travel/explore" className={({ isActive }) => `flex items-center rounded-lg px-2 py-1.5 text-xs transition ${isActive ? 'text-adv-gold' : 'text-adv-gray hover:text-adv-off-white'}`}>Country Guide</NavLink>
              </div>
            )}

          </>
        )}

        {/* ── FutureChain / Payments sidebar ──────────────────────────── */}
        {isPaymentsMode && (
          <>
            {!sidebarCollapsed && (
              <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal">FutureChain</div>
            )}
            <NavLink to="/futurechain" end
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Dashboard' : undefined}>
              <LayoutDashboard className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Dashboard'}
            </NavLink>

            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">Wallets</div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink to="/futurechain/wallets"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'My Wallets' : undefined}>
              <Wallet className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'My Wallets'}
            </NavLink>
            <NavLink to="/futurechain/kyc"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'KYC Profile' : undefined}>
              <Users className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'KYC Profile'}
            </NavLink>

            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">Transactions</div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink to="/futurechain/transactions"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Transactions' : undefined}>
              <CreditCard className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Transactions'}
            </NavLink>
            <NavLink to="/futurechain/budget"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Budget & Limits' : undefined}>
              <Shield className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Budget & Limits'}
            </NavLink>

            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">Marketplace</div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink to="/futurechain/marketplace"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Services' : undefined}>
              <ShoppingBag className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Services'}
            </NavLink>
            <NavLink to="/futurechain/settings"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Settings' : undefined}>
              <Settings className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Settings'}
            </NavLink>

            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">Integration</div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink to="/futurechain/gateway"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Payment Gateway' : undefined}>
              <Plug className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Payment Gateway'}
            </NavLink>
          </>
        )}

        {/* ── Collaboration / Community sidebar ─────────────────────── */}
        {isCommunityMode && (
          <>
            {!sidebarCollapsed && (
              <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal">Collaboration</div>
            )}
            <NavLink to="/community" end
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Hub' : undefined}>
              <Home className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Hub'}
            </NavLink>

            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">People</div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink to="/community/contacts"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Contacts' : undefined}>
              <Users className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Contacts'}
            </NavLink>
            <NavLink to="/community/groups"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Groups' : undefined}>
              <Users2 className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Groups'}
            </NavLink>
            <NavLink to="/community/identity"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'My Identity' : undefined}>
              <Star className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'My Identity'}
            </NavLink>

            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">Communication</div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink to="/community/mail"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Mail' : undefined}>
              <Mail className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Mail'}
            </NavLink>
            <NavLink to="/community/messages"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Messages' : undefined}>
              <MessageCircle className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Messages'}
            </NavLink>
            <NavLink to="/community/forum"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Forum' : undefined}>
              <MessageSquare className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Forum'}
            </NavLink>

            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">Projects</div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink to="/community/projects"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Projects' : undefined}>
              <FolderKanban className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Projects'}
            </NavLink>
            <NavLink to="/community/tasks"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Task Delegation' : undefined}>
              <Send className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Task Delegation'}
            </NavLink>
            <NavLink to="/community/beehive"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Beehive' : undefined}>
              <Hexagon className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Beehive'}
            </NavLink>

            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">Knowledge</div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink to="/community/shared-knowledge"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Shared Knowledge' : undefined}>
              <Share2 className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Shared Knowledge'}
            </NavLink>
            <NavLink to="/community/capability-card"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Capability Card' : undefined}>
              <Eye className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Capability Card'}
            </NavLink>

            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">Events</div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink to="/community/calendar"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Calendar' : undefined}>
              <CalendarDays className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Calendar'}
            </NavLink>
          </>
        )}

        {/* ── Markets Intelligence sidebar ───────────────────────────── */}
        {isMarketsMode && (
          <>
            {!sidebarCollapsed ? (
              <div className="mb-4 px-1">
                <button
                  onClick={() => { setAppMode('work'); navigate('/'); }}
                  className="mb-3 flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back to Work
                </button>
                <div className="px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal">Markets Intelligence</div>
              </div>
            ) : (
              <button
                onClick={() => { setAppMode('work'); navigate('/'); }}
                className={collapsedLinkClass(false)}
                title="Back to Work"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}

            {/* Dashboard */}
            <NavLink
              to="/markets"
              end
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Dashboard' : undefined}
            >
              <TrendingUp className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Dashboard'}
            </NavLink>

            {/* Data & Atoms */}
            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">
                Data & Atoms
              </div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink
              to="/markets/sources"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Data Sources' : undefined}
            >
              <Database className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Data Sources'}
            </NavLink>
            <NavLink
              to="/markets/entities"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Entity Graph' : undefined}
            >
              <Network className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Entity Graph'}
            </NavLink>
            <NavLink
              to="/markets/atoms"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Atoms' : undefined}
            >
              <Zap className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Atoms'}
            </NavLink>
            <NavLink
              to="/markets/watchlist"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Watchlist' : undefined}
            >
              <Eye className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Watchlist'}
            </NavLink>

            {/* Analysis */}
            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">
                Analysis
              </div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink
              to="/markets/theses"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Theses' : undefined}
            >
              <Target className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Theses'}
            </NavLink>
            <NavLink
              to="/markets/predictions"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Predictions' : undefined}
            >
              <Crosshair className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Predictions'}
            </NavLink>
            <NavLink
              to="/markets/investigations"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Investigations' : undefined}
            >
              <Search className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Investigations'}
            </NavLink>
            <NavLink
              to="/markets/why-chains"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Why Chains' : undefined}
            >
              <GitBranch className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Why Chains'}
            </NavLink>
            <NavLink
              to="/markets/patterns"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Patterns' : undefined}
            >
              <Activity className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Patterns'}
            </NavLink>

            {/* Indexes & Learning */}
            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">
                Indexes & Learning
              </div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink
              to="/markets/indexes"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Indexes' : undefined}
            >
              <BarChart className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Indexes'}
            </NavLink>
            <NavLink
              to="/markets/learning"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Learning' : undefined}
            >
              <Brain className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Learning'}
            </NavLink>

            {/* Strategy & Backtesting */}
            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">
                Strategy
              </div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink
              to="/markets/onboarding"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Setup Wizard' : undefined}
            >
              <Rocket className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Setup Wizard'}
            </NavLink>
            <NavLink
              to="/markets/goals"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Goals & Values' : undefined}
            >
              <Target className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Goals & Values'}
            </NavLink>
            <NavLink
              to="/markets/backtests"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Backtesting' : undefined}
            >
              <Clock className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Backtesting'}
            </NavLink>

            {/* Operations */}
            {!sidebarCollapsed && (
              <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">
                Operations
              </div>
            )}
            {sidebarCollapsed && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink
              to="/markets/workflows"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Workflows' : undefined}
            >
              <RefreshCw className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Workflows'}
            </NavLink>
            <NavLink
              to="/markets/events"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Events' : undefined}
            >
              <Calendar className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Events'}
            </NavLink>
            <NavLink
              to="/markets/rci"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'RCI' : undefined}
            >
              <Calculator className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'RCI'}
            </NavLink>
            <NavLink
              to="/markets/computation"
              className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
              title={sidebarCollapsed ? 'Computation' : undefined}
            >
              <Cpu className="h-4 w-4 shrink-0" />
              {!sidebarCollapsed && 'Computation'}
            </NavLink>
          </>
        )}

        {/* ── Procure Pillar sidebar ──────────────────────────────────────── */}
        {isProcureMode && (
          <>
            {!mini ? (
              <div className="mb-4 px-1">
                <button
                  onClick={() => { setAppMode('work'); navigate('/'); }}
                  className="mb-3 flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back to Work
                </button>
                <div className="px-2 text-xs font-semibold uppercase tracking-wider text-adv-blue">Procure</div>
              </div>
            ) : (
              <button
                onClick={() => { setAppMode('work'); navigate('/'); }}
                className={collapsedLinkClass(false)}
                title="Back to Work"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <NavLink to="/procure" end className={({ isActive }) => mini ? collapsedLinkClass(isActive) : linkClass(isActive)} title={mini ? 'Dashboard' : undefined}>
              <ShoppingCart className="h-4 w-4 shrink-0" />
              {!mini && 'Dashboard'}
            </NavLink>
          </>
        )}

        {/* ── Civic Pillar sidebar ──────────────────────────────────────── */}
        {isCivicMode && (
          <>
            {!mini ? (
              <div className="mb-4 px-1">
                <button
                  onClick={() => { setAppMode('work'); navigate('/'); }}
                  className="mb-3 flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back to Work
                </button>
                <div className="px-2 text-xs font-semibold uppercase tracking-wider text-adv-green">Civic</div>
              </div>
            ) : (
              <button
                onClick={() => { setAppMode('work'); navigate('/'); }}
                className={collapsedLinkClass(false)}
                title="Back to Work"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <NavLink to="/civic" end className={({ isActive }) => mini ? collapsedLinkClass(isActive) : linkClass(isActive)} title={mini ? 'Dashboard' : undefined}>
              <Landmark className="h-4 w-4 shrink-0" />
              {!mini && 'Dashboard'}
            </NavLink>
          </>
        )}

        {/* ── Grow Pillar sidebar ────────────────────────────────────────── */}
        {isGrowMode && (
          <>
            {!mini ? (
              <div className="mb-4 px-1">
                <button
                  onClick={() => { setAppMode('work'); navigate('/'); }}
                  className="mb-3 flex items-center gap-1.5 text-xs text-adv-gray hover:text-adv-teal transition-colors"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back to Work
                </button>
                <div className="px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal">Grow</div>
              </div>
            ) : (
              <button
                onClick={() => { setAppMode('work'); navigate('/'); }}
                className={collapsedLinkClass(false)}
                title="Back to Work"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <NavLink to="/grow" end className={({ isActive }) => mini ? collapsedLinkClass(isActive) : linkClass(isActive)} title={mini ? 'Dashboard' : undefined}>
              <TrendingUp className="h-4 w-4 shrink-0" />
              {!mini && 'Dashboard'}
            </NavLink>
            {!mini && <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">People</div>}
            {mini && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink to="/grow/contacts" className={({ isActive }) => mini ? collapsedLinkClass(isActive) : linkClass(isActive)} title={mini ? 'Contacts' : undefined}>
              <Users className="h-4 w-4 shrink-0" />
              {!mini && 'Contacts'}
            </NavLink>
            <NavLink to="/grow/organisations" className={({ isActive }) => mini ? collapsedLinkClass(isActive) : linkClass(isActive)} title={mini ? 'Organisations' : undefined}>
              <Building2 className="h-4 w-4 shrink-0" />
              {!mini && 'Organisations'}
            </NavLink>
            {!mini && <div className="mt-4 mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-adv-teal/70">Pipeline</div>}
            {mini && <div className="my-1.5 mx-2 h-px bg-border/40" />}
            <NavLink to="/grow/pipeline" className={({ isActive }) => mini ? collapsedLinkClass(isActive) : linkClass(isActive)} title={mini ? 'Pipeline' : undefined}>
              <BarChart3 className="h-4 w-4 shrink-0" />
              {!mini && 'Pipeline'}
            </NavLink>
          </>
        )}

        {/* ── Work sidebar (hidden while on Life/Pathfinder/Markets/Pillar routes) */}
        {!isLifeMode && !isPathfinderMode && !isMarketsMode && !isCommunityMode && !isPaymentsMode && !isProcureMode && !isCivicMode && !isGrowMode && (<>
        {/* Favorites section — only show if there are favorited items and sidebar is expanded */}
        {!sidebarCollapsed && favoriteNavItems.size > 0 && (
          <>
            <div className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-adv-gold flex items-center gap-2">
              <Star className="h-3 w-3 fill-adv-gold" />
              {t('nav.favorites')}
            </div>

            {/* Home - if favorited */}
            {favoriteNavItems.has('home') && !hiddenNavItems.has('home') && (
              <NavLinkWithStar
                to="/"
                navId="home"
                title={sidebarCollapsed ? t('nav.home') : undefined}
                className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
                isFavorite={true}
                isHidden={false}
                onToggleFavorite={toggleNavFavorite}
                sidebarCollapsed={sidebarCollapsed}
              >
                <Home className="h-4 w-4 shrink-0" />
                {!sidebarCollapsed && t('nav.home')}
              </NavLinkWithStar>
            )}

            {/* Map through ALL_NAV_ITEMS to show favorited ones */}
            {ALL_NAV_ITEMS.filter(item => favoriteNavItems.has(item.id) && !hiddenNavItems.has(item.id)).map(item => {
              const navConfig = {
                'engagements': { to: '/engagements', icon: Briefcase, label: t('nav.engagementTasks') },
                'discover': { to: '/discover', icon: Search, label: t('nav.discover') },
                'my-work': { to: '/my-work', icon: Briefcase, label: t('nav.myWork') },
                'coding': { to: '/coding', icon: Terminal, label: t('nav.coding') },
                'presentations': { to: '/presentations', icon: Presentation, label: t('nav.presentations') },
                'brief': { to: '/brief', icon: MessageCircle, label: t('nav.briefMe') },
                'guide': { to: '/guide', icon: Compass, label: t('nav.guideMe') },
                'fill': { to: '/fill', icon: FileEdit, label: t('nav.fillForm') },
                'challenge': { to: '/challenge', icon: ShieldAlert, label: t('nav.challengeThis') },
                'dual': { to: '/dual', icon: Scale, label: t('nav.dualInterpret') },
                'review': { to: '/review', icon: ScanText, label: t('nav.reviewEngine') },
                'prompt': { to: '/prompt', icon: MessageSquare, label: t('nav.openChat') },
                'sounding-board': { to: '/sounding-board', icon: MessageSquare, label: t('nav.soundingBoard') },
                'ab-test': { to: '/ab-test', icon: FlaskConical, label: t('nav.abPromptTesting') },
                'council': { to: '/council', icon: Users, label: t('nav.aiCouncil') },
                'workflows': { to: '/workflows', icon: Workflow, label: t('nav.workflows') },
                'orchestration': { to: '/orchestration', icon: LayoutDashboard, label: 'Orchestration' },
                'datasets': { to: '/datasets', icon: Database, label: t('nav.savedDatasets') },
                'coworkers': { to: '/coworkers', icon: Bot, label: t('nav.coworkers') },
                'projects': { to: '/projects', icon: FolderOpen, label: t('nav.projects') },
                'build-module': { to: '/build-module', icon: Puzzle, label: t('nav.buildModule') },
                'skills': { to: '/skills', icon: Zap, label: t('nav.skillsLibrary') },
                'batch': { to: '/batch', icon: Layers, label: t('nav.batchCreate') },
                'audit': { to: '/audit', icon: ClipboardCheck, label: t('nav.auditLog') },
                'connections': { to: '/settings?tab=connections', icon: Plug, label: t('nav.connections') },
                'exchange': { to: '/exchange', icon: Package, label: t('nav.exchange') },
                'analytics': { to: '/analytics', icon: BarChart2, label: t('nav.analytics') },
                'insights': { to: '/insights', icon: TrendingUp, label: t('nav.dataInsights') },
                'knowledge': { to: '/knowledge', icon: BookOpen, label: t('nav.knowledge') },
                'knowledge-base': { to: '/knowledge-base', icon: DatabaseIcon, label: t('nav.knowledgeBase') },
                'graph': { to: '/graph', icon: Network, label: t('nav.knowledgeGraph') },
                'intelligence': { to: '/intelligence', icon: Brain, label: t('nav.intelligence') },
                'patterns': { to: '/patterns', icon: Zap, label: t('nav.patterns') },
                'compliance': { to: '/compliance', icon: ShieldCheck, label: t('nav.compliance') },
                'compliance-posture': { to: '/compliance-posture', icon: ShieldCheck, label: 'Compliance Posture' },
                'risk-appetite': { to: '/risk-appetite', icon: ShieldAlert, label: 'Risk Appetite' },
                'deadlines': { to: '/deadlines', icon: Calendar, label: t('nav.deadlines') },
                'radar': { to: '/radar', icon: Radar, label: t('nav.radar') },
                'quality': { to: '/quality', icon: Star, label: t('nav.quality') },
                'apprentice': { to: '/apprentice', icon: GraduationCap, label: t('nav.myJourney') },
                'skill-packs': { to: '/skill-packs', icon: Package, label: t('nav.skillPacks') },
                'governance': { to: '/governance', icon: Shield, label: t('nav.governance') },
                'compare': { to: '/compare', icon: GitCompare, label: t('nav.compare') },
                'marketplace': { to: '/marketplace', icon: Rocket, label: t('nav.marketplace') },
                'pathfinder': { to: '/pathfinder', icon: Compass, label: 'Pathfinder' },
                'pathfinder-history': { to: '/pathfinder/history', icon: Search, label: 'Search History' },
                'task-agent': { to: '/task-agent', icon: Bot, label: 'ANTON Task Agent' },
                'orchestrator': { to: '/orchestrator', icon: Brain, label: 'ANTON Orchestrator' },
                'counsels-desk': { to: '/counsels-desk', icon: Scale, label: "Counsel's Desk" },
                'gap-assessment': { to: '/gap-assessment', icon: ClipboardCheck, label: 'Gap Assessor' },
                'regulatory-feed': { to: '/regulatory-feed', icon: Rss, label: 'Regulatory Feed' },
                'lore-ledger': { to: '/lore-ledger', icon: BookOpen, label: 'Lore Ledger' },
                'roaring': { to: '/roaring', icon: Building2, label: 'Roaring Registry' },
                'dj-screening': { to: '/dj-screening', icon: Shield, label: 'DJ Screening' },
                'entity-intelligence': { to: '/entity-intelligence', icon: ScanSearch, label: 'Entity Intelligence' },
                'ngo': { to: '/ngo', icon: Globe, label: 'NGO & Social Impact' },
                'trades': { to: '/trades', icon: Wrench, label: 'Trades & Service Workers' },
                'pe-vc': { to: '/pe-vc', icon: TrendingUp, label: 'PE/VC Hub' },
                'markets': { to: '/markets', icon: TrendingUp, label: 'Markets Intelligence' },
                'procure': { to: '/procure', icon: ShoppingCart, label: 'Procure' },
                'civic': { to: '/civic', icon: Landmark, label: 'Civic' },
                'grow': { to: '/grow', icon: TrendingUp, label: 'Grow' },
                'school': { to: '/school', icon: GraduationCap, label: 'ANTON School' },
                'innovation-radar': { to: '/innovation-radar', icon: Radar, label: 'Innovation Radar' },
                'versions': { to: '/versions', icon: GitBranch, label: 'Version History' },
                'community-groups': { to: '/community/groups', icon: Users2, label: 'Community Groups' },
                'community-mail': { to: '/community/mail', icon: Mail, label: 'Community Mail' },
                'community-calendar': { to: '/community/calendar', icon: CalendarDays, label: 'Community Calendar' },
                'news': { to: '/news', icon: Newspaper, label: 'News' },
                'finance': { to: '/finance', icon: Wallet, label: 'Finance' },
                'travel': { to: '/travel', icon: Map, label: 'Travel' },
                'community': { to: '/community', icon: MessageCircle, label: 'Community' },
                'app-gateway': { to: '/app-gateway', icon: Smartphone, label: 'App Gateway' },
              }[item.id];

              if (!navConfig) return null;
              const Icon = navConfig.icon;

              return (
                <NavLinkWithStar
                  key={item.id}
                  to={navConfig.to}
                  navId={item.id}
                  title={sidebarCollapsed ? navConfig.label : undefined}
                  className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
                  isFavorite={true}
                  isHidden={false}
                  onToggleFavorite={toggleNavFavorite}
                  sidebarCollapsed={sidebarCollapsed}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!sidebarCollapsed && navConfig.label}
                </NavLinkWithStar>
              );
            })}

            <div className="my-3 border-t border-border" />
          </>
        )}

        {/* ── Interactive Modes section ────────────────────────── */}
        {!sidebarCollapsed && (
          <button
            onClick={() => toggleSection('interaction')}
            aria-expanded={!!sectionsExpanded.interaction}
            aria-controls="nav-section-interaction"
            className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray hover:bg-adv-card hover:text-adv-off-white transition-colors"
          >
            <span>{t('nav.interactiveModes')}</span>
            <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${sectionsExpanded.interaction ? '' : '-rotate-90'}`} />
          </button>
        )}

        {(sidebarCollapsed || sectionsExpanded.interaction) && (<>

        {/* Top-level nav items */}
        <NavLinkWithStar
          to="/"
          navId="home"
          title={sidebarCollapsed ? t('nav.home') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('home')}
          isHidden={hiddenNavItems.has('home')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Home className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.home')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/discover"
          navId="discover"
          title={sidebarCollapsed ? t('nav.discover') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('discover')}
          isHidden={hiddenNavItems.has('discover')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Search className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.discover')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/my-work"
          navId="my-work"
          title={sidebarCollapsed ? t('nav.myWork') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('my-work')}
          isHidden={hiddenNavItems.has('my-work')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Briefcase className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.myWork')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/coding"
          navId="coding"
          title={sidebarCollapsed ? t('nav.coding') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('coding')}
          isHidden={hiddenNavItems.has('coding')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Terminal className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.coding')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/engagements"
          navId="engagements"
          title={sidebarCollapsed ? t('nav.engagementTasks') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('engagements')}
          isHidden={hiddenNavItems.has('engagements')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Briefcase className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.engagementTasks')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/presentations"
          navId="presentations"
          title={sidebarCollapsed ? t('nav.presentations') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('presentations')}
          isHidden={hiddenNavItems.has('presentations')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Presentation className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.presentations')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/ngo"
          navId="ngo"
          title={sidebarCollapsed ? t('nav.ngo', 'NGO & Social Impact') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('ngo')}
          isHidden={hiddenNavItems.has('ngo')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Globe className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.ngo', 'NGO & Social Impact')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/trades"
          navId="trades"
          title={sidebarCollapsed ? t('nav.trades', 'Trades & Service Workers') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('trades')}
          isHidden={hiddenNavItems.has('trades')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Wrench className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.trades', 'Trades & Service Workers')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/pe-vc"
          navId="pe-vc"
          title={sidebarCollapsed ? t('nav.peVc', 'PE/VC') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('pe-vc')}
          isHidden={hiddenNavItems.has('pe-vc')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <TrendingUp className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.peVc', 'PE/VC')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/pathfinder"
          navId="pathfinder"
          title={sidebarCollapsed ? 'Pathfinder' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('pathfinder')}
          isHidden={hiddenNavItems.has('pathfinder')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Compass className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Pathfinder'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/task-agent"
          navId="task-agent"
          title={sidebarCollapsed ? 'ANTON Task Agent' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('task-agent')}
          isHidden={hiddenNavItems.has('task-agent')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Bot className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Task Agent'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/orchestrator"
          navId="orchestrator"
          title={sidebarCollapsed ? 'ANTON Orchestrator' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('orchestrator')}
          isHidden={hiddenNavItems.has('orchestrator')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Brain className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Orchestrator'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/counsels-desk"
          navId="counsels-desk"
          title={sidebarCollapsed ? "Counsel's Desk" : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('counsels-desk')}
          isHidden={hiddenNavItems.has('counsels-desk')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Scale className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && "Counsel's Desk"}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/gap-assessment"
          navId="gap-assessment"
          title={sidebarCollapsed ? 'Gap Assessor' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('gap-assessment')}
          isHidden={hiddenNavItems.has('gap-assessment')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <ClipboardCheck className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Gap Assessor'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/lore-ledger"
          navId="lore-ledger"
          title={sidebarCollapsed ? 'Lore Ledger' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('lore-ledger')}
          isHidden={hiddenNavItems.has('lore-ledger')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Lore Ledger'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/regulatory-feed"
          navId="regulatory-feed"
          title={sidebarCollapsed ? 'Regulatory Feed' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('regulatory-feed')}
          isHidden={hiddenNavItems.has('regulatory-feed')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Rss className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Regulatory Feed'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/roaring"
          navId="roaring"
          title={sidebarCollapsed ? 'Roaring Entity Registry' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('roaring')}
          isHidden={hiddenNavItems.has('roaring')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Building2 className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Roaring Registry'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/dj-screening"
          navId="dj-screening"
          title={sidebarCollapsed ? 'DJ Risk & Compliance' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('dj-screening')}
          isHidden={hiddenNavItems.has('dj-screening')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Shield className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'DJ Screening'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/entity-intelligence"
          navId="entity-intelligence"
          title={sidebarCollapsed ? 'Entity Intelligence' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('entity-intelligence')}
          isHidden={hiddenNavItems.has('entity-intelligence')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <ScanSearch className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Entity Intelligence'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/school"
          navId="school"
          title={sidebarCollapsed ? t('nav.school', 'ANTON School') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('school')}
          isHidden={hiddenNavItems.has('school')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <GraduationCap className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.school', 'ANTON School')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/markets"
          navId="markets"
          title={sidebarCollapsed ? 'Markets Intelligence' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('markets')}
          isHidden={hiddenNavItems.has('markets')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <TrendingUp className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Markets Intelligence'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/procure"
          navId="procure"
          title={sidebarCollapsed ? 'Procure' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('procure')}
          isHidden={hiddenNavItems.has('procure')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <ShoppingCart className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Procure'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/civic"
          navId="civic"
          title={sidebarCollapsed ? 'Civic' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('civic')}
          isHidden={hiddenNavItems.has('civic')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Landmark className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Civic'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/grow"
          navId="grow"
          title={sidebarCollapsed ? 'Grow' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('grow')}
          isHidden={hiddenNavItems.has('grow')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <TrendingUp className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Grow'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/innovation-radar"
          navId="innovation-radar"
          title={sidebarCollapsed ? t('nav.innovationRadar', 'Innovation Radar') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('innovation-radar')}
          isHidden={hiddenNavItems.has('innovation-radar')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Radar className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.innovationRadar', 'Innovation Radar')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/brief"
          navId="brief"
          title={sidebarCollapsed ? t('nav.briefMe') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('brief')}
          isHidden={hiddenNavItems.has('brief')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <MessageCircle className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.briefMe')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/guide"
          navId="guide"
          title={sidebarCollapsed ? t('nav.guideMe') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('guide')}
          isHidden={hiddenNavItems.has('guide')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Compass className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.guideMe')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/fill"
          navId="fill"
          title={sidebarCollapsed ? t('nav.fillForm') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('fill')}
          isHidden={hiddenNavItems.has('fill')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <FileEdit className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.fillForm')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/challenge"
          navId="challenge"
          title={sidebarCollapsed ? t('nav.challengeThis') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('challenge')}
          isHidden={hiddenNavItems.has('challenge')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.challengeThis')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/dual"
          navId="dual"
          title={sidebarCollapsed ? t('nav.dualInterpret') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('dual')}
          isHidden={hiddenNavItems.has('dual')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Scale className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.dualInterpret')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/review"
          navId="review"
          title={sidebarCollapsed ? t('nav.reviewEngine') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('review')}
          isHidden={hiddenNavItems.has('review')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <ScanText className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.reviewEngine')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/prompt"
          navId="prompt"
          title={sidebarCollapsed ? t('nav.openChat') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('prompt')}
          isHidden={hiddenNavItems.has('prompt')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.openChat')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/sounding-board"
          navId="sounding-board"
          title={sidebarCollapsed ? t('nav.soundingBoard') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('sounding-board')}
          isHidden={hiddenNavItems.has('sounding-board')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.soundingBoard')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/ab-test"
          navId="ab-test"
          title={sidebarCollapsed ? t('nav.abPromptTesting') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('ab-test')}
          isHidden={hiddenNavItems.has('ab-test')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <FlaskConical className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.abPromptTesting')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/council"
          navId="council"
          title={sidebarCollapsed ? t('nav.aiCouncil') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('council')}
          isHidden={hiddenNavItems.has('council')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Users className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.aiCouncil')}
        </NavLinkWithStar>

        </>)}

        {/* ── Tools & Features section (collapsed by default) ──── */}
        {!sidebarCollapsed && (
          <button
            onClick={() => toggleSection('tools')}
            aria-expanded={!!sectionsExpanded.tools}
            aria-controls="nav-section-tools"
            className="mb-1 mt-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray hover:bg-adv-card hover:text-adv-off-white transition-colors"
          >
            <span>{t('nav.toolsAndFeatures')}</span>
            <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${sectionsExpanded.tools ? '' : '-rotate-90'}`} />
          </button>
        )}

        {(sidebarCollapsed || sectionsExpanded.tools) && (<>

        <NavLinkWithStar
          to="/workflows"
          navId="workflows"
          title={sidebarCollapsed ? t('nav.workflows') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('workflows')}
          isHidden={hiddenNavItems.has('workflows')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Workflow className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.workflows')}
        </NavLinkWithStar>

        {/* Missions — autonomous multi-step work */}
        <NavLink
          to="/missions"
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          title={sidebarCollapsed ? 'Missions' : undefined}
        >
          <Target className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Missions'}
        </NavLink>

        {/* Mission Inbox sub-nav — shown when inside /missions */}
        {!sidebarCollapsed && pathname.startsWith('/missions') && (
          <NavLink
            to="/missions/inbox"
            className={({ isActive }) =>
              `ml-6 flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                isActive
                  ? 'bg-adv-teal/15 text-adv-teal'
                  : 'text-adv-gray hover:text-adv-off-white hover:bg-white/5'
              }`
            }
          >
            <Inbox className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">Inbox</span>
            <MissionInboxBadge />
          </NavLink>
        )}

        {/* Risk Atlas — universal seven-stage threat-path methodology */}
        <NavLink
          to="/atlas"
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          title={sidebarCollapsed ? 'Risk Atlas' : undefined}
        >
          <ShieldAlert className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Risk Atlas'}
        </NavLink>

        {/* Event Triggers sub-nav (under Workflows) */}
        {!sidebarCollapsed && pathname.startsWith('/workflows') && (
          <NavLink
            to="/workflows/triggers"
            className={({ isActive }) =>
              `ml-6 flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors ${
                isActive
                  ? 'bg-adv-teal/15 text-adv-teal'
                  : 'text-adv-gray hover:text-adv-off-white hover:bg-white/5'
              }`
            }
          >
            <Zap className="h-3.5 w-3.5 shrink-0" />
            Event Triggers
          </NavLink>
        )}

        <NavLinkWithStar
          to="/orchestration"
          navId="orchestration"
          title={sidebarCollapsed ? 'Orchestration' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('orchestration')}
          isHidden={hiddenNavItems.has('orchestration')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Orchestration'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/datasets"
          navId="datasets"
          title={sidebarCollapsed ? t('nav.savedDatasets') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('datasets')}
          isHidden={hiddenNavItems.has('datasets')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Database className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.savedDatasets')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/coworkers"
          navId="coworkers"
          title={sidebarCollapsed ? t('nav.coworkers') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('coworkers')}
          isHidden={hiddenNavItems.has('coworkers')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Bot className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.coworkers')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/projects"
          navId="projects"
          title={sidebarCollapsed ? t('nav.projects') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('projects')}
          isHidden={hiddenNavItems.has('projects')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <FolderOpen className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.projects')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/build-module"
          navId="build-module"
          title={sidebarCollapsed ? t('nav.buildModule') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('build-module')}
          isHidden={hiddenNavItems.has('build-module')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Puzzle className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.buildModule')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/skills"
          navId="skills"
          title={sidebarCollapsed ? t('nav.skillsLibrary') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('skills')}
          isHidden={hiddenNavItems.has('skills')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Zap className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.skillsLibrary')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/skill-packs"
          navId="skill-packs"
          title={sidebarCollapsed ? t('nav.skillPacks') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('skill-packs')}
          isHidden={hiddenNavItems.has('skill-packs')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Package className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.skillPacks')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/governance"
          navId="governance"
          title={sidebarCollapsed ? t('nav.governanceDashboard') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('governance')}
          isHidden={hiddenNavItems.has('governance')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Shield className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.governance')}
        </NavLinkWithStar>

        {/* Compare removed from nav — covered in whitepaper */}

        <NavLinkWithStar
          to="/marketplace"
          navId="marketplace"
          title={sidebarCollapsed ? t('nav.marketplace') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('marketplace')}
          isHidden={hiddenNavItems.has('marketplace')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Rocket className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.marketplace')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/batch"
          navId="batch"
          title={sidebarCollapsed ? t('nav.batchCreate') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('batch')}
          isHidden={hiddenNavItems.has('batch')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Layers className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.batchCreate')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/audit"
          navId="audit"
          title={sidebarCollapsed ? t('nav.auditLog') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('audit')}
          isHidden={hiddenNavItems.has('audit')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <ClipboardCheck className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.auditLog')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/app-gateway"
          navId="app-gateway"
          title={sidebarCollapsed ? 'App Gateway' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('app-gateway')}
          isHidden={hiddenNavItems.has('app-gateway')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Smartphone className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'App Gateway'}
        </NavLinkWithStar>

        {/* Connections */}
        <NavLinkWithStar
          to="/settings?tab=connections"
          navId="connections"
          title={sidebarCollapsed ? t('nav.connections') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('connections')}
          isHidden={hiddenNavItems.has('connections')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Plug className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.connections')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/exchange"
          navId="exchange"
          title={sidebarCollapsed ? t('nav.exchange') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('exchange')}
          isHidden={hiddenNavItems.has('exchange')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Package className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.exchange')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/analytics"
          navId="analytics"
          title={sidebarCollapsed ? t('nav.analytics') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('analytics')}
          isHidden={hiddenNavItems.has('analytics')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <BarChart2 className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.analytics')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/insights"
          navId="insights"
          title={sidebarCollapsed ? t('nav.dataInsights') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('insights')}
          isHidden={hiddenNavItems.has('insights')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <TrendingUp className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.dataInsights')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/knowledge"
          navId="knowledge"
          title={sidebarCollapsed ? t('nav.knowledge') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('knowledge')}
          isHidden={hiddenNavItems.has('knowledge')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.knowledge')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/knowledge-base"
          navId="knowledge-base"
          title={sidebarCollapsed ? t('nav.knowledgeBase') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('knowledge-base')}
          isHidden={hiddenNavItems.has('knowledge-base')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <DatabaseIcon className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.knowledgeBase')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/graph"
          navId="graph"
          title={sidebarCollapsed ? t('nav.knowledgeGraph') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('graph')}
          isHidden={hiddenNavItems.has('graph')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Network className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.knowledgeGraph')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/intelligence"
          navId="intelligence"
          title={sidebarCollapsed ? t('nav.intelligenceDashboard') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('intelligence')}
          isHidden={hiddenNavItems.has('intelligence')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Brain className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.intelligence')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/patterns"
          navId="patterns"
          title={sidebarCollapsed ? t('nav.patternDetection') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('patterns')}
          isHidden={hiddenNavItems.has('patterns')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Zap className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.patterns')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/compliance"
          navId="compliance"
          title={sidebarCollapsed ? t('nav.compliance') : undefined}
          className={({ isActive}) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('compliance')}
          isHidden={hiddenNavItems.has('compliance')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.compliance')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/system-cards"
          navId="system-cards"
          title={sidebarCollapsed ? t('nav.systemCards', 'AI System Cards') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('system-cards')}
          isHidden={hiddenNavItems.has('system-cards')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <FileText className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.systemCards', 'AI System Cards')}
        </NavLinkWithStar>

        {/* Deadlines — with urgency badge */}
        <DeadlinesNavLink
          sidebarCollapsed={sidebarCollapsed}
          collapsedLinkClass={collapsedLinkClass}
          linkClass={linkClass}
        />

        <NavLinkWithStar
          to="/radar"
          navId="radar"
          title={sidebarCollapsed ? t('nav.regulatoryRadar') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('radar')}
          isHidden={hiddenNavItems.has('radar')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Radar className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.radar')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/quality"
          navId="quality"
          title={sidebarCollapsed ? t('nav.quality') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('quality')}
          isHidden={hiddenNavItems.has('quality')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Star className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.quality')}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/apprentice"
          navId="apprentice"
          title={sidebarCollapsed ? t('nav.myJourney') : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('apprentice')}
          isHidden={hiddenNavItems.has('apprentice')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <GraduationCap className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && t('nav.myJourney')}
        </NavLinkWithStar>

        </>)}

        {/* ── Modules section ──────────────────────────────────── */}
        <div className="my-3 border-t border-border" />

        {!sidebarCollapsed && (
          <button
            onClick={() => toggleSection('modules')}
            aria-expanded={!!sectionsExpanded.modules}
            aria-controls="nav-section-modules"
            className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray hover:bg-adv-card hover:text-adv-off-white transition-colors"
          >
            <span>{t('nav.modules')}</span>
            <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${sectionsExpanded.modules ? '' : '-rotate-90'}`} />
          </button>
        )}

        {/* UX-04: Module search/filter — shown only when modules section is open */}
        {!sidebarCollapsed && sectionsExpanded.modules && (
          <div className="relative mb-2 px-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3 w-3 -translate-y-1/2 text-adv-gray" />
            <input
              type="text"
              value={moduleSearch}
              onChange={(e) => setModuleSearch(e.target.value)}
              placeholder="Filter modules…"
              aria-label="Filter modules"
              className="w-full rounded-md border border-border bg-adv-dark py-1.5 pl-7 pr-7 text-xs text-adv-off-white placeholder-adv-gray-med focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1"
            />
            {moduleSearch && (
              <button
                onClick={() => setModuleSearch('')}
                aria-label="Clear filter"
                className="absolute right-4 top-1/2 -translate-y-1/2 text-adv-gray hover:text-adv-off-white"
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {/* Collapsed: flat module icon list */}
        {sidebarCollapsed && MODULES.map((mod) => {
          const Icon = iconMap[mod.icon] || Search;
          return (
            <NavLink
              key={mod.id}
              to={`/module/${mod.id}`}
              title={mod.shortLabel}
              className={({ isActive }) => collapsedLinkClass(isActive)}
            >
              <Icon className="h-4 w-4 shrink-0" />
            </NavLink>
          );
        })}

        {/* UX-04: Filtered module results — replaces area tree when search is active */}
        {!sidebarCollapsed && sectionsExpanded.modules && moduleSearch.trim() && (() => {
          const q = moduleSearch.trim().toLowerCase();
          const matched = MODULES.filter(
            (m) => m.id.includes(q) || m.shortLabel.toLowerCase().includes(q) || m.label?.toLowerCase().includes(q)
          );
          if (matched.length === 0) {
            return <p className="px-4 py-2 text-xs text-adv-gray">No modules match "{moduleSearch}"</p>;
          }
          return (
            <div className="mb-2">
              {matched.map((mod) => {
                const Icon = iconMap[mod.icon] || Search;
                const area = AREAS.find((a) => (a.moduleIds as readonly string[]).includes(mod.id as string));
                return (
                  <NavLink
                    key={mod.id}
                    to={`/module/${mod.id}`}
                    onClick={() => setModuleSearch('')}
                    className={({ isActive }) => linkClass(isActive, area?.id)}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate text-sm">{mod.shortLabel}</span>
                    {area && <span className="ml-auto shrink-0 text-xs text-adv-gray">{area.shortLabel}</span>}
                  </NavLink>
                );
              })}
            </div>
          );
        })()}

        {/* ── My Modules section — appears before domain areas for quick access ── */}
        {!sidebarCollapsed && sectionsExpanded.modules && !moduleSearch.trim() && (() => {
          const myModules = customModules.filter(() => true);
          if (myModules.length === 0) return null;
          const isExpanded = expandedAreas.has('my-modules');
          return (
            <div className="mb-1">
              <button
                onClick={() => toggleArea('my-modules')}
                className="mb-0.5 flex w-full items-center justify-between rounded-lg px-3 py-1.5 transition-colors hover:bg-adv-card"
              >
                <div className="flex items-center gap-2">
                  <Puzzle className="h-3.5 w-3.5 shrink-0 text-adv-teal" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-adv-teal">
                    {t('nav.myModules')}
                  </span>
                  <span className="text-xs text-adv-gray">{myModules.length}</span>
                </div>
                <ChevronDown
                  className={`h-3 w-3 text-adv-gray transition-transform duration-150 ${isExpanded ? '' : '-rotate-90'}`}
                />
              </button>
              {isExpanded && (
                <div className="ml-2 border-l border-adv-teal/20 pl-1">
                  {myModules.map((cm) => {
                    const Icon = iconMap[cm.icon] || Puzzle;
                    return (
                      <NavLink
                        key={cm.id}
                        to={`/module/${cm.id}`}
                        className={({ isActive }) =>
                          `flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${
                            isActive
                              ? 'bg-adv-teal-dim text-adv-teal'
                              : 'text-adv-gray hover:bg-adv-card hover:text-adv-off-white'
                          }`
                        }
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{cm.short_name || cm.name}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Expanded: modules grouped by area — hidden when search is active */}
        {!sidebarCollapsed && sectionsExpanded.modules && !moduleSearch.trim() && AREAS.map((area) => {
          const isExpanded = expandedAreas.has(area.id);
          const colors = AREA_COLORS[area.id] ?? DEFAULT_AREA_COLOR;
          const AreaIcon = iconMap[area.icon] || Search;
          const areaModules = area.moduleIds
            .map((id) => MODULES.find((m) => m.id === id))
            .filter(Boolean) as typeof MODULES;
          // Custom modules assigned to this area
          const areaCustomModules = customModules.filter((cm) => cm.area === area.id);
          const totalCount = areaModules.length + areaCustomModules.length;

          return (
            <div key={area.id} className="mb-1">
              {/* Area header — clickable to expand/collapse */}
              <button
                onClick={() => toggleArea(area.id)}
                aria-expanded={isExpanded}
                aria-controls={`area-modules-${area.id}`}
                className="mb-0.5 flex w-full items-center justify-between rounded-lg px-3 py-1.5 transition-colors hover:bg-adv-card"
              >
                <div className="flex items-center gap-2">
                  <AreaIcon className={`h-3.5 w-3.5 shrink-0 ${colors.text}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>
                    {area.shortLabel}
                  </span>
                  <span className="text-xs text-adv-gray">{totalCount}</span>
                </div>
                <ChevronDown
                  className={`h-3 w-3 text-adv-gray transition-transform duration-150 ${isExpanded ? '' : '-rotate-90'}`}
                />
              </button>

              {/* Area dashboard + module links within area */}
              {isExpanded && (
                <div id={`area-modules-${area.id}`}>
                  <AreaDashboard
                    areaId={area.id}
                    areaLabel={area.label}
                    moduleIds={area.moduleIds as unknown as string[]}
                    topModules={topModules}
                    areaSessions={areaSessionCounts[area.id] ?? 0}
                  />
                  <div className="ml-2 border-l border-border pl-1">
                    {areaModules.map((mod) => {
                      const Icon = iconMap[mod.icon] || Search;
                      return (
                        <NavLink
                          key={mod.id}
                          to={`/module/${mod.id}`}
                          className={({ isActive }) => linkClass(isActive, area.id)}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate text-sm">{mod.shortLabel}</span>
                        </NavLink>
                      );
                    })}
                    {/* Custom modules assigned to this area */}
                    {areaCustomModules.map((cm) => {
                      const Icon = iconMap[cm.icon] || Puzzle;
                      return (
                        <NavLink
                          key={cm.id}
                          to={`/module/${cm.id}`}
                          className={({ isActive }) => linkClass(isActive, area.id)}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate text-sm">{cm.short_name || cm.name}</span>
                          <span className="ml-auto shrink-0 text-xs text-adv-teal/60">custom</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Recent Sessions removed from nav — available on Dashboard and My Work */}
        </>)}
      </nav>

      {/* Profile mini-summary */}
      <div className="border-t border-border px-2 py-2">
        {sidebarCollapsed ? (
          <button
            onClick={() => navigate('/settings?tab=profile')}
            title={profileName || t('nav.setupProfile')}
            className="flex w-full items-center justify-center rounded-lg p-2 transition-colors hover:bg-adv-card"
          >
            {profileName ? (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-adv-teal text-xs font-bold text-adv-dark">
                {profileName.charAt(0).toUpperCase()}
              </div>
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-adv-gray-med text-xs text-adv-gray">
                ?
              </div>
            )}
          </button>
        ) : (
          <button
            onClick={() => navigate('/settings?tab=profile')}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-adv-card"
          >
            {profileName ? (
              <>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-adv-teal text-xs font-bold text-adv-dark">
                  {profileName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-adv-off-white">{profileName}</div>
                  {profileRole && (
                    <div className="truncate text-[11px] text-adv-gray">{profileRole}</div>
                  )}
                </div>
              </>
            ) : (
              <span className="text-xs text-adv-gray">
                {t('nav.setupProfile')} →
              </span>
            )}
          </button>
        )}
      </div>

      {/* Toggle + Footer */}
      <div className="border-t border-border">
        <button
          onClick={toggleSidebar}
          className="flex w-full items-center justify-center py-3 text-adv-gray hover:text-adv-teal transition-colors"
          title={mini ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
        >
          {mini ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        {!sidebarCollapsed && (
          <div className="px-4 pb-3 text-xs text-adv-gray">
            Anton v0.7.5
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
