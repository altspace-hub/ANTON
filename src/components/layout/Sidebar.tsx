import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate } from 'react-router-dom';
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
  Landmark, Smartphone, Sprout, ShoppingBag, HardHat, PiggyBank, Bird, ChefHat,
  // Feature pages
  ScanText,
  Brain,
  Database as DatabaseIcon,
  // Mobile close button
  X as XIcon,
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
      title={sidebarCollapsed ? 'Deadlines' : undefined}
      className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
    >
      <div className="relative shrink-0">
        <Calendar className="h-4 w-4" />
        {urgentCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-adv-red text-[8px] font-bold text-white">
            {urgentCount > 9 ? '9+' : urgentCount}
          </span>
        )}
      </div>
      {!sidebarCollapsed && (
        <span className="flex flex-1 items-center justify-between">
          Deadlines
          {urgentCount > 0 && (
            <span className="ml-auto rounded-full bg-adv-red/20 px-1.5 py-0.5 text-[10px] font-semibold text-adv-red">
              {urgentCount}
            </span>
          )}
        </span>
      )}
    </NavLink>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { sidebarCollapsed, toggleSidebar } = useSettingsStore();
  const { user: authUser, isTeamMode } = useAuthStore();
  const isAdmin = authUser?.role === 'admin' || !isTeamMode;
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);
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

    fetchSessions()
      .then((sessions) => setRecentSessions(sessions.slice(0, 4)))
      .catch(() => setRecentSessions([]));
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
      className={`flex flex-col border-r border-border bg-adv-dark-2 transition-all duration-200
        ${mobileOpen ? 'fixed inset-y-0 left-0 z-50 w-[280px]' : 'hidden lg:flex'}
        lg:static lg:z-auto
        ${!mobileOpen ? (sidebarCollapsed ? 'lg:w-16' : 'lg:w-[280px]') : ''}
      `}
    >
      {/* Logo */}
      <div className={`flex h-16 items-center border-b border-border ${sidebarCollapsed ? 'justify-center px-2' : 'gap-3 px-6'}`}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-adv-teal">
          <span className="text-sm font-bold text-adv-dark">A</span>
        </div>
        {!sidebarCollapsed && (
          <div className="flex-1">
            <div className="text-sm font-semibold text-adv-white">Anton</div>
            <div className="text-xs text-adv-gray-med">by openEXPERT</div>
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
        {/* Favorites section — only show if there are favorited items and sidebar is expanded */}
        {!sidebarCollapsed && favoriteNavItems.size > 0 && (
          <>
            <div className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-adv-gold flex items-center gap-2">
              <Star className="h-3 w-3 fill-adv-gold" />
              Favorites
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
                'discover': { to: '/discover', icon: Search, label: 'Discover' },
                'my-work': { to: '/my-work', icon: Briefcase, label: 'My Work' },
                'coding': { to: '/coding', icon: Terminal, label: 'Coding' },
                'presentations': { to: '/presentations', icon: Presentation, label: 'Presentations' },
                'brief': { to: '/brief', icon: MessageCircle, label: t('nav.briefMe') },
                'guide': { to: '/guide', icon: Compass, label: t('nav.guideMe') },
                'fill': { to: '/fill', icon: FileEdit, label: t('nav.fillForm') },
                'challenge': { to: '/challenge', icon: ShieldAlert, label: t('nav.challengeThis') },
                'dual': { to: '/dual', icon: Scale, label: t('nav.dualInterpret') },
                'review': { to: '/review', icon: ScanText, label: t('nav.reviewEngine') },
                'prompt': { to: '/prompt', icon: MessageSquare, label: t('nav.openChat') },
                'sounding-board': { to: '/sounding-board', icon: MessageSquare, label: t('nav.soundingBoard') },
                'ab-test': { to: '/ab-test', icon: FlaskConical, label: 'A/B Prompt Testing' },
                'council': { to: '/council', icon: Users, label: 'AI Council' },
                'workflows': { to: '/workflows', icon: Workflow, label: t('nav.workflows') },
                'datasets': { to: '/datasets', icon: Database, label: 'Saved Datasets' },
                'coworkers': { to: '/coworkers', icon: Bot, label: 'Coworkers' },
                'projects': { to: '/projects', icon: FolderOpen, label: t('nav.projects') },
                'build-module': { to: '/build-module', icon: Puzzle, label: t('nav.buildModule') },
                'skills': { to: '/skills', icon: Zap, label: t('nav.skillsLibrary') },
                'batch': { to: '/batch', icon: Layers, label: t('nav.batchCreate') },
                'audit': { to: '/audit', icon: ClipboardCheck, label: t('nav.auditLog') },
                'connections': { to: '/settings?tab=connections', icon: Plug, label: 'Connections' },
                'exchange': { to: '/exchange', icon: Package, label: t('nav.exchange') },
                'analytics': { to: '/analytics', icon: BarChart2, label: t('nav.analytics') },
                'insights': { to: '/insights', icon: TrendingUp, label: t('nav.dataInsights') },
                'knowledge': { to: '/knowledge', icon: BookOpen, label: 'Knowledge' },
                'knowledge-base': { to: '/knowledge-base', icon: DatabaseIcon, label: 'Knowledge Base' },
                'graph': { to: '/graph', icon: Network, label: 'Knowledge Graph' },
                'intelligence': { to: '/intelligence', icon: Brain, label: 'Intelligence' },
                'patterns': { to: '/patterns', icon: Zap, label: 'Patterns' },
                'compliance': { to: '/compliance', icon: ShieldCheck, label: 'Compliance' },
                'deadlines': { to: '/deadlines', icon: Calendar, label: 'Deadlines' },
                'radar': { to: '/radar', icon: Radar, label: 'Radar' },
                'quality': { to: '/quality', icon: Star, label: 'Quality' },
                'apprentice': { to: '/apprentice', icon: GraduationCap, label: 'My Journey' },
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
            className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray-med hover:bg-adv-card hover:text-adv-off-white transition-colors"
          >
            <span>Interactive Modes</span>
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
          title={sidebarCollapsed ? 'Discover' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('discover')}
          isHidden={hiddenNavItems.has('discover')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Search className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Discover'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/my-work"
          navId="my-work"
          title={sidebarCollapsed ? 'My Work' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('my-work')}
          isHidden={hiddenNavItems.has('my-work')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Briefcase className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'My Work'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/coding"
          navId="coding"
          title={sidebarCollapsed ? 'Coding' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('coding')}
          isHidden={hiddenNavItems.has('coding')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Terminal className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Coding'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/presentations"
          navId="presentations"
          title={sidebarCollapsed ? 'Presentations' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('presentations')}
          isHidden={hiddenNavItems.has('presentations')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Presentation className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Presentations'}
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
          title={sidebarCollapsed ? 'A/B Prompt Testing' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('ab-test')}
          isHidden={hiddenNavItems.has('ab-test')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <FlaskConical className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'A/B Prompt Testing'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/council"
          navId="council"
          title={sidebarCollapsed ? 'AI Council' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('council')}
          isHidden={hiddenNavItems.has('council')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Users className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'AI Council'}
        </NavLinkWithStar>

        </>)}

        {/* ── Tools & Features section (collapsed by default) ──── */}
        {!sidebarCollapsed && (
          <button
            onClick={() => toggleSection('tools')}
            className="mb-1 mt-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray-med hover:bg-adv-card hover:text-adv-off-white transition-colors"
          >
            <span>Tools & Features</span>
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

        <NavLinkWithStar
          to="/datasets"
          navId="datasets"
          title={sidebarCollapsed ? 'Saved Datasets' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('datasets')}
          isHidden={hiddenNavItems.has('datasets')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Database className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Saved Datasets'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/coworkers"
          navId="coworkers"
          title={sidebarCollapsed ? 'Coworkers' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('coworkers')}
          isHidden={hiddenNavItems.has('coworkers')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Bot className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Coworkers'}
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

        {/* Connections */}
        <NavLinkWithStar
          to="/settings?tab=connections"
          navId="connections"
          title={sidebarCollapsed ? 'Connections' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('connections')}
          isHidden={hiddenNavItems.has('connections')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Plug className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Connections'}
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
          title={sidebarCollapsed ? 'Knowledge' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('knowledge')}
          isHidden={hiddenNavItems.has('knowledge')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Knowledge'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/knowledge-base"
          navId="knowledge-base"
          title={sidebarCollapsed ? 'Knowledge Base' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('knowledge-base')}
          isHidden={hiddenNavItems.has('knowledge-base')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <DatabaseIcon className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Knowledge Base'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/graph"
          navId="graph"
          title={sidebarCollapsed ? 'Knowledge Graph' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('graph')}
          isHidden={hiddenNavItems.has('graph')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Network className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Knowledge Graph'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/intelligence"
          navId="intelligence"
          title={sidebarCollapsed ? 'Intelligence Dashboard' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('intelligence')}
          isHidden={hiddenNavItems.has('intelligence')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Brain className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Intelligence'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/patterns"
          navId="patterns"
          title={sidebarCollapsed ? 'Pattern Detection' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('patterns')}
          isHidden={hiddenNavItems.has('patterns')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Zap className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Patterns'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/compliance"
          navId="compliance"
          title={sidebarCollapsed ? 'Compliance' : undefined}
          className={({ isActive}) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('compliance')}
          isHidden={hiddenNavItems.has('compliance')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Compliance'}
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
          title={sidebarCollapsed ? 'Regulatory Radar' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('radar')}
          isHidden={hiddenNavItems.has('radar')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Radar className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Radar'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/quality"
          navId="quality"
          title={sidebarCollapsed ? 'Quality' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('quality')}
          isHidden={hiddenNavItems.has('quality')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <Star className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'Quality'}
        </NavLinkWithStar>

        <NavLinkWithStar
          to="/apprentice"
          navId="apprentice"
          title={sidebarCollapsed ? 'My Journey' : undefined}
          className={({ isActive }) => sidebarCollapsed ? collapsedLinkClass(isActive) : linkClass(isActive)}
          isFavorite={favoriteNavItems.has('apprentice')}
          isHidden={hiddenNavItems.has('apprentice')}
          onToggleFavorite={toggleNavFavorite}
          sidebarCollapsed={sidebarCollapsed}
        >
          <GraduationCap className="h-4 w-4 shrink-0" />
          {!sidebarCollapsed && 'My Journey'}
        </NavLinkWithStar>

        </>)}

        {/* ── Modules section ──────────────────────────────────── */}
        <div className="my-3 border-t border-border" />

        {!sidebarCollapsed && (
          <button
            onClick={() => toggleSection('modules')}
            className="mb-1 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray-med hover:bg-adv-card hover:text-adv-off-white transition-colors"
          >
            <span>Modules</span>
            <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${sectionsExpanded.modules ? '' : '-rotate-90'}`} />
          </button>
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

        {/* Expanded: modules grouped by area */}
        {!sidebarCollapsed && sectionsExpanded.modules && AREAS.map((area) => {
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
                className="mb-0.5 flex w-full items-center justify-between rounded-lg px-3 py-1.5 transition-colors hover:bg-adv-card"
              >
                <div className="flex items-center gap-2">
                  <AreaIcon className={`h-3.5 w-3.5 shrink-0 ${colors.text}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>
                    {area.shortLabel}
                  </span>
                  <span className="text-[10px] text-adv-gray-med">{totalCount}</span>
                </div>
                <ChevronDown
                  className={`h-3 w-3 text-adv-gray-med transition-transform duration-150 ${isExpanded ? '' : '-rotate-90'}`}
                />
              </button>

              {/* Area dashboard + module links within area */}
              {isExpanded && (
                <>
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
                          <span className="ml-auto shrink-0 text-[9px] text-adv-teal/60">custom</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          );
        })}

        {/* ── My Modules section — custom modules not assigned to a specific area ── */}
        {!sidebarCollapsed && sectionsExpanded.modules && (() => {
          const myModules = customModules.filter(
            (cm) => !cm.area || cm.area === 'custom' || cm.area === 'my-modules'
          );
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
                    My Modules
                  </span>
                  <span className="text-[10px] text-adv-gray-med">{myModules.length}</span>
                </div>
                <ChevronDown
                  className={`h-3 w-3 text-adv-gray-med transition-transform duration-150 ${isExpanded ? '' : '-rotate-90'}`}
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

        {/* ── Recent Sessions section (collapsed by default) ─── */}
        {!sidebarCollapsed && (
          <>
            <button
              onClick={() => toggleSection('recent')}
              className="mb-1 mt-4 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-adv-gray-med hover:bg-adv-card hover:text-adv-off-white transition-colors"
            >
              <span>{t('nav.recentSessions')}</span>
              <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${sectionsExpanded.recent ? '' : '-rotate-90'}`} />
            </button>
            {sectionsExpanded.recent && (
              recentSessions.length === 0 ? (
                <div className="px-3 text-xs text-adv-gray-med italic">{t('nav.noRecentSessions')}</div>
              ) : (
                recentSessions.map((session) => {
                  const mod = MODULES.find((m) => m.id === session.module_id);
                  const Icon = mod ? (iconMap[mod.icon] || Clock) : Clock;
                  return (
                    <NavLink
                      key={session.id}
                      to={`/module/${session.module_id}`}
                      className={({ isActive }) => linkClass(isActive)}
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-70" />
                      <span className="truncate text-xs">{session.title}</span>
                    </NavLink>
                  );
                })
              )
            )}
          </>
        )}
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
              <div className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-adv-gray-med text-[10px] text-adv-gray-med">
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
                    <div className="truncate text-[11px] text-adv-gray-med">{profileRole}</div>
                  )}
                </div>
              </>
            ) : (
              <span className="text-xs text-adv-gray-med">
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
          className="flex w-full items-center justify-center py-3 text-adv-gray-med hover:text-adv-teal transition-colors"
          title={sidebarCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        {!sidebarCollapsed && (
          <div className="px-4 pb-3 text-xs text-adv-gray-med">
            Anton v0.2.0
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
