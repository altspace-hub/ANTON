/**
 * FinancePage.tsx
 *
 * Finance hub landing page at /finance.
 * Provides navigation to all finance sub-sections with disclaimer.
 */

import { useNavigate } from 'react-router-dom';
import {
  Wallet,
  BookOpen,
  Calculator,
  BarChart2,
  Star,
  Target,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';

interface QuickActionCard {
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  iconBg: string;
  iconColor: string;
}

const QUICK_ACTIONS: QuickActionCard[] = [
  {
    path: '/finance/learn',
    icon: BookOpen,
    title: 'Financial Literacy',
    description: 'Learn about mortgages, pensions, investing, tax, and more with Swedish context.',
    iconBg: 'bg-adv-teal-dim',
    iconColor: 'text-adv-teal',
  },
  {
    path: '/finance/calculators',
    icon: Calculator,
    title: 'Calculators',
    description: 'Mortgage, compound interest, pension projection, debt payoff, and Swedish tax.',
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-adv-blue',
  },
  {
    path: '/finance/market',
    icon: BarChart2,
    title: 'Market Overview',
    description: 'Overview of major indices. Ask ANTON about market concepts.',
    iconBg: 'bg-adv-gold/10',
    iconColor: 'text-adv-gold',
  },
  {
    path: '/finance/watchlist',
    icon: Star,
    title: 'My Watchlist',
    description: 'Track stocks, ETFs, crypto, and indices. Personalised symbol list.',
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-400',
  },
  {
    path: '/finance/goals',
    icon: Target,
    title: 'Financial Goals',
    description: 'Set savings targets, track progress, and stay on course.',
    iconBg: 'bg-adv-green/10',
    iconColor: 'text-adv-green',
  },
];

export default function FinancePage() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal-dim">
            <Wallet className="h-5 w-5 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-adv-off-white">Finance</h1>
            <p className="text-sm text-adv-gray">
              Financial literacy for real life — not Wall Street
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-6">
        {/* Disclaimer banner */}
        <div className="flex items-start gap-3 rounded-xl border border-adv-gold/30 bg-adv-gold/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-adv-gold" />
          <p className="text-sm text-adv-gold">
            <span className="font-semibold">Educational only — not financial advice.</span>{' '}
            Always consult a qualified financial advisor before making financial decisions.
          </p>
        </div>

        {/* Quick action cards */}
        <div>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-adv-gray">
            Get Started
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_ACTIONS.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.path}
                  onClick={() => navigate(card.path)}
                  className="group flex flex-col gap-3 rounded-xl border border-border bg-adv-card p-5 text-left transition-all duration-150 hover:border-adv-teal/50 hover:shadow-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.iconBg}`}>
                      <Icon className={`h-5 w-5 ${card.iconColor}`} />
                    </div>
                    <ChevronRight className="h-4 w-4 text-adv-gray opacity-0 transition-opacity group-hover:opacity-100 text-adv-teal" />
                  </div>
                  <div>
                    <h3 className="mb-1 font-semibold text-adv-off-white">{card.title}</h3>
                    <p className="text-sm leading-relaxed text-adv-gray">{card.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer note */}
        <p className="text-xs text-adv-gray text-center pb-4">
          All tools are for educational illustration only. Market data is not live unless an API key is configured.
        </p>
      </div>
    </div>
  );
}
