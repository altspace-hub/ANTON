/**
 * LifePage.tsx
 *
 * Hub landing page for the Life Platform.
 * Route: /life
 *
 * Entry point when the user clicks the "Life" tab in the header.
 * Shows 4 section cards: News, Finance, Travel, Community.
 * Each section has a tagline, sub-feature list, and a primary CTA.
 */

import { useNavigate } from 'react-router-dom';
import {
  Newspaper, Wallet, Map, Users,
  ChevronRight, Shield, TrendingUp, Radio, User,
  PiggyBank, BarChart2, Calculator, Globe,
  Plane, BookOpen, MessageCircle, CalendarDays, Mail, Users2,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────

interface SectionCard {
  id: string;
  icon: React.ReactNode;
  label: string;
  tagline: string;
  color: string;         // CSS hex for accent ring + icon bg
  to: string;
  features: { icon: React.ReactNode; label: string; to: string }[];
  cta: string;
}

// ── Section definitions ───────────────────────────────────────────────────

const SECTIONS: SectionCard[] = [
  {
    id: 'news',
    icon: <Newspaper className="h-7 w-7" />,
    label: 'News',
    tagline: 'Stay informed without the noise. Curated, bias-aware, chronological.',
    color: '#3498DB',
    to: '/news',
    cta: 'Open News',
    features: [
      { icon: <Radio className="h-3.5 w-3.5" />,    label: 'Live Feed',       to: '/news/feed' },
      { icon: <Shield className="h-3.5 w-3.5" />,   label: 'Truth Check',     to: '/news/truth-check' },
      { icon: <TrendingUp className="h-3.5 w-3.5" />,label: 'Sources',        to: '/news/sources' },
      { icon: <User className="h-3.5 w-3.5" />,     label: 'My Bias Report',  to: '/news/my-bias' },
    ],
  },
  {
    id: 'finance',
    icon: <Wallet className="h-7 w-7" />,
    label: 'Finance',
    tagline: 'Personal finance, market data, and learning — in one place.',
    color: '#2DD4A8',
    to: '/finance',
    cta: 'Open Finance',
    features: [
      { icon: <BookOpen className="h-3.5 w-3.5" />,    label: 'Learn',       to: '/finance/learn' },
      { icon: <Calculator className="h-3.5 w-3.5" />,  label: 'Calculators', to: '/finance/calculators' },
      { icon: <BarChart2 className="h-3.5 w-3.5" />,   label: 'Markets',     to: '/finance/market' },
      { icon: <PiggyBank className="h-3.5 w-3.5" />,   label: 'Goals',       to: '/finance/goals' },
    ],
  },
  {
    id: 'travel',
    icon: <Map className="h-7 w-7" />,
    label: 'Travel',
    tagline: 'Plan trips, explore countries, and travel smarter with AI.',
    color: '#F5A623',
    to: '/travel',
    cta: 'Open Travel',
    features: [
      { icon: <Plane className="h-3.5 w-3.5" />,  label: 'My Trips',      to: '/travel/trips' },
      { icon: <BookOpen className="h-3.5 w-3.5" />, label: 'Trip Planner', to: '/travel/planner' },
      { icon: <Globe className="h-3.5 w-3.5" />,  label: 'Country Guide', to: '/travel/explore' },
    ],
  },
  {
    id: 'community',
    icon: <Users className="h-7 w-7" />,
    label: 'Community',
    tagline: 'Private groups, async mail, and shared calendars. Your data, your device.',
    color: '#9B59B6',
    to: '/community',
    cta: 'Open Community',
    features: [
      { icon: <Users2 className="h-3.5 w-3.5" />,     label: 'Groups',   to: '/community/groups' },
      { icon: <Mail className="h-3.5 w-3.5" />,       label: 'Mail',     to: '/community/mail' },
      { icon: <CalendarDays className="h-3.5 w-3.5" />,label: 'Calendar', to: '/community/calendar' },
      { icon: <MessageCircle className="h-3.5 w-3.5" />,label: 'Forum',   to: '/community/forum' },
    ],
  },
];

// ── Section card ──────────────────────────────────────────────────────────

function SectionCard({ section }: { section: SectionCard }) {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col rounded-2xl border border-border bg-adv-card overflow-hidden transition hover:border-opacity-60"
      style={{ borderColor: `${section.color}30` }}
    >
      {/* Card header */}
      <div className="p-6 pb-4">
        <div className="mb-4 flex items-center gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ backgroundColor: `${section.color}18`, color: section.color }}
          >
            {section.icon}
          </div>
          <div>
            <h2 className="text-xl font-bold text-adv-white">{section.label}</h2>
          </div>
        </div>
        <p className="text-sm text-adv-gray leading-relaxed">{section.tagline}</p>
      </div>

      {/* Feature links */}
      <div className="flex-1 px-6 pb-4">
        <div className="flex flex-col gap-1">
          {section.features.map(f => (
            <button
              key={f.to}
              onClick={() => navigate(f.to)}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-adv-gray transition hover:bg-adv-dark-2 hover:text-adv-off-white text-left"
            >
              <span style={{ color: section.color }}>{f.icon}</span>
              {f.label}
              <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 group-hover:opacity-100" />
            </button>
          ))}
        </div>
      </div>

      {/* CTA button */}
      <div className="px-6 pb-6 pt-2">
        <button
          onClick={() => navigate(section.to)}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition"
          style={{
            backgroundColor: `${section.color}18`,
            color: section.color,
            border: `1px solid ${section.color}30`,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${section.color}28`; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${section.color}18`; }}
        >
          {section.cta}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────

export default function LifePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {/* Header */}
      <div className="mb-10 text-center">
        <h1 className="mb-2 text-3xl font-bold text-adv-white">Life Platform</h1>
        <p className="text-adv-gray">
          News · Finance · Travel · Community — everything outside of work, in one place.
        </p>
      </div>

      {/* 2×2 section grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {SECTIONS.map(s => (
          <SectionCard key={s.id} section={s} />
        ))}
      </div>
    </div>
  );
}
