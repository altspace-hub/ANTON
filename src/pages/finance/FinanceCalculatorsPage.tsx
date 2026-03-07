/**
 * FinanceCalculatorsPage.tsx
 *
 * 5 interactive calculators: Mortgage, Compound Interest,
 * Pension Projection, Debt Payoff, Swedish Tax.
 * All values in SEK by default.
 */

import { useState } from 'react';
import { Calculator, AlertTriangle, Loader2 } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

// ── Shared helpers ──────────────────────────────────────────────────

function formatSEK(n: number): string {
  return n.toLocaleString('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 });
}

const DISCLAIMER = (
  <p className="mt-3 text-xs text-adv-gray">
    This is for educational illustration only. Actual results may differ. Consult a financial advisor.
  </p>
);

interface ResultPanelProps {
  rows: { label: string; value: string; highlight?: boolean }[];
}

function ResultPanel({ rows }: ResultPanelProps) {
  return (
    <div className="mt-4 rounded-lg border border-adv-teal/30 bg-adv-teal-soft p-4 space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between">
          <span className="text-sm text-adv-gray">{r.label}</span>
          <span className={`text-sm font-semibold ${r.highlight ? 'text-adv-teal' : 'text-adv-off-white'}`}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Mortgage Calculator ──────────────────────────────────────────────

function MortgageCalc() {
  const [homePrice, setHomePrice] = useState('3500000');
  const [downPayment, setDownPayment] = useState('700000');
  const [interestRate, setInterestRate] = useState('4.5');
  const [loanYears, setLoanYears] = useState<25 | 30>(25);
  const [result, setResult] = useState<{ monthly: number; totalInterest: number; totalCost: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function calculate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/finance/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          type: 'mortgage',
          params: {
            home_price: Number(homePrice),
            down_payment: Number(downPayment),
            interest_rate: Number(interestRate),
            loan_years: loanYears,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Calculation failed');
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-adv-gray">Home price (SEK)</span>
          <input type="number" value={homePrice} onChange={(e) => setHomePrice(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-adv-gray">Down payment (SEK)</span>
          <input type="number" value={downPayment} onChange={(e) => setDownPayment(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-adv-gray">Annual interest rate (%)</span>
          <input type="number" step="0.1" value={interestRate} onChange={(e) => setInterestRate(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-adv-gray">Loan term</span>
          <select value={loanYears} onChange={(e) => setLoanYears(Number(e.target.value) as 25 | 30)}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1">
            <option value={25}>25 years</option>
            <option value={30}>30 years</option>
          </select>
        </label>
      </div>
      <button onClick={calculate} disabled={loading}
        className="mt-4 flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Calculate
      </button>
      {error && <p className="mt-2 text-sm text-adv-red">{error}</p>}
      {result && (
        <ResultPanel rows={[
          { label: 'Monthly payment', value: formatSEK(result.monthly), highlight: true },
          { label: 'Total interest paid', value: formatSEK(result.totalInterest) },
          { label: 'Total cost', value: formatSEK(result.totalCost) },
        ]} />
      )}
      {DISCLAIMER}
    </div>
  );
}

// ── Compound Interest Calculator ────────────────────────────────────

function CompoundCalc() {
  const [principal, setPrincipal] = useState('50000');
  const [monthly, setMonthly] = useState('2000');
  const [annualRate, setAnnualRate] = useState('7');
  const [years, setYears] = useState('20');
  const [result, setResult] = useState<{ total: number; contributions: number; profit: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function calculate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/finance/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          type: 'compound_interest',
          params: { principal: Number(principal), monthly_contribution: Number(monthly), annual_rate: Number(annualRate), years: Number(years) },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Calculation failed');
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: 'Starting amount (SEK)', value: principal, set: setPrincipal },
          { label: 'Monthly contribution (SEK)', value: monthly, set: setMonthly },
          { label: 'Annual return rate (%)', value: annualRate, set: setAnnualRate },
          { label: 'Years', value: years, set: setYears },
        ].map(({ label, value, set }) => (
          <label key={label} className="space-y-1">
            <span className="text-xs text-adv-gray">{label}</span>
            <input type="number" value={value} onChange={(e) => set(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
          </label>
        ))}
      </div>
      <button onClick={calculate} disabled={loading}
        className="mt-4 flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Calculate
      </button>
      {error && <p className="mt-2 text-sm text-adv-red">{error}</p>}
      {result && (
        <ResultPanel rows={[
          { label: 'Final value', value: formatSEK(result.total), highlight: true },
          { label: 'Total contributions', value: formatSEK(result.contributions) },
          { label: 'Investment gain', value: formatSEK(result.profit) },
        ]} />
      )}
      {DISCLAIMER}
    </div>
  );
}

// ── Pension Projection ────────────────────────────────────────────────

function PensionCalc() {
  const [currentAge, setCurrentAge] = useState('35');
  const [retirementAge, setRetirementAge] = useState('65');
  const [currentSavings, setCurrentSavings] = useState('200000');
  const [monthlyContrib, setMonthlyContrib] = useState('3000');
  const [result, setResult] = useState<{ projectedTotal: number; monthlyPension: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function calculate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/finance/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          type: 'pension',
          params: { current_age: Number(currentAge), retirement_age: Number(retirementAge), current_savings: Number(currentSavings), monthly_contribution: Number(monthlyContrib) },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Calculation failed');
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { label: 'Current age', value: currentAge, set: setCurrentAge },
          { label: 'Retirement age', value: retirementAge, set: setRetirementAge },
          { label: 'Current pension savings (SEK)', value: currentSavings, set: setCurrentSavings },
          { label: 'Monthly contribution (SEK)', value: monthlyContrib, set: setMonthlyContrib },
        ].map(({ label, value, set }) => (
          <label key={label} className="space-y-1">
            <span className="text-xs text-adv-gray">{label}</span>
            <input type="number" value={value} onChange={(e) => set(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
          </label>
        ))}
      </div>
      <button onClick={calculate} disabled={loading}
        className="mt-4 flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Calculate
      </button>
      {error && <p className="mt-2 text-sm text-adv-red">{error}</p>}
      {result && (
        <ResultPanel rows={[
          { label: 'Projected pension pot', value: formatSEK(result.projectedTotal), highlight: true },
          { label: 'Est. monthly pension (20yr drawdown)', value: formatSEK(result.monthlyPension) },
        ]} />
      )}
      {DISCLAIMER}
    </div>
  );
}

// ── Debt Payoff Calculator ───────────────────────────────────────────

function DebtCalc() {
  const [balance, setBalance] = useState('150000');
  const [annualRate, setAnnualRate] = useState('18');
  const [monthlyPayment, setMonthlyPayment] = useState('5000');
  const [result, setResult] = useState<{ months: number; totalInterest: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function calculate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/finance/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          type: 'debt_payoff',
          params: { balance: Number(balance), annual_rate: Number(annualRate), monthly_payment: Number(monthlyPayment) },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Calculation failed');
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Current balance (SEK)', value: balance, set: setBalance },
          { label: 'Annual interest rate (%)', value: annualRate, set: setAnnualRate },
          { label: 'Monthly payment (SEK)', value: monthlyPayment, set: setMonthlyPayment },
        ].map(({ label, value, set }) => (
          <label key={label} className="space-y-1">
            <span className="text-xs text-adv-gray">{label}</span>
            <input type="number" value={value} onChange={(e) => set(e.target.value)}
              className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
          </label>
        ))}
      </div>
      <button onClick={calculate} disabled={loading}
        className="mt-4 flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Calculate
      </button>
      {error && <p className="mt-2 text-sm text-adv-red">{error}</p>}
      {result && (
        <ResultPanel rows={[
          { label: 'Months to payoff', value: `${result.months} months (${(result.months / 12).toFixed(1)} years)`, highlight: true },
          { label: 'Total interest paid', value: formatSEK(result.totalInterest) },
        ]} />
      )}
      {DISCLAIMER}
    </div>
  );
}

// ── Swedish Tax Calculator ───────────────────────────────────────────

function SwedishTaxCalc() {
  const [income, setIncome] = useState('600000');
  const [municipalRate, setMunicipalRate] = useState('32.5');
  const [result, setResult] = useState<{ gross: number; tax: number; net: number; effectiveRate: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function calculate() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/finance/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({
          type: 'swedish_tax',
          params: { annual_income: Number(income), municipality_rate: Number(municipalRate) },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Calculation failed');
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-adv-gray">Annual gross income (SEK)</span>
          <input type="number" value={income} onChange={(e) => setIncome(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
        </label>
        <label className="space-y-1">
          <span className="text-xs text-adv-gray">Municipal tax rate (%) — default 32.5</span>
          <input type="number" step="0.1" value={municipalRate} onChange={(e) => setMunicipalRate(e.target.value)}
            className="w-full rounded-lg border border-border bg-adv-dark px-3 py-2 text-sm text-adv-off-white focus:border-adv-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1" />
        </label>
      </div>
      <button onClick={calculate} disabled={loading}
        className="mt-4 flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark disabled:opacity-50">
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        Calculate
      </button>
      {error && <p className="mt-2 text-sm text-adv-red">{error}</p>}
      {result && (
        <ResultPanel rows={[
          { label: 'Gross income', value: formatSEK(result.gross) },
          { label: 'Total tax', value: formatSEK(result.tax) },
          { label: 'Net income', value: formatSEK(result.net), highlight: true },
          { label: 'Effective tax rate', value: `${result.effectiveRate.toFixed(1)}%` },
        ]} />
      )}
      {DISCLAIMER}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────

const TABS = [
  { id: 'mortgage', label: 'Mortgage', component: MortgageCalc },
  { id: 'compound', label: 'Compound Interest', component: CompoundCalc },
  { id: 'pension', label: 'Pension', component: PensionCalc },
  { id: 'debt', label: 'Debt Payoff', component: DebtCalc },
  { id: 'tax', label: 'Swedish Tax', component: SwedishTaxCalc },
];

export default function FinanceCalculatorsPage() {
  const [activeTab, setActiveTab] = useState('mortgage');
  const active = TABS.find((t) => t.id === activeTab)!;
  const ActiveComponent = active.component;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Header */}
      <div className="border-b border-border bg-adv-dark-2 px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
            <Calculator className="h-5 w-5 text-adv-blue" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-adv-off-white">Calculators</h1>
            <p className="text-sm text-adv-gray">Educational financial calculators — all values in SEK</p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-6 space-y-6">
        {/* Disclaimer */}
        <div className="flex items-start gap-3 rounded-xl border border-adv-gold/30 bg-adv-gold/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-adv-gold" />
          <p className="text-sm text-adv-gold">
            These calculators are for educational illustration only. Actual results depend on your specific circumstances.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-adv-teal bg-adv-teal-dim text-adv-teal'
                  : 'border-border bg-adv-card text-adv-gray hover:border-adv-gray-med hover:text-adv-off-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Active calculator card */}
        <div className="rounded-xl border border-border bg-adv-card p-6">
          <h2 className="mb-4 text-lg font-semibold text-adv-off-white">{active.label}</h2>
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
