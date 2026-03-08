import { useState, useEffect } from 'react';
import { ShieldCheck, RefreshCw, Info } from 'lucide-react';
import { getAuthHeader } from '@/lib/api';

// LONE-05: 5-level maturity across 8 AML/FCP compliance dimensions

const DIMENSIONS = [
  { id: 'governance',       label: 'Governance & Oversight',         desc: 'Board accountability, MLCO/MLRO structure, escalation paths' },
  { id: 'risk-assessment',  label: 'Business-Wide Risk Assessment',  desc: 'BWRA completeness, methodology, annual refresh' },
  { id: 'cdd-kyc',          label: 'CDD / KYC Controls',            desc: 'Onboarding quality, EDD triggers, PEP screening' },
  { id: 'monitoring',       label: 'Transaction Monitoring',         desc: 'Scenario coverage, calibration, alert quality' },
  { id: 'sanctions',        label: 'Sanctions Screening',            desc: 'Screening coverage, match rate, OFSI/OFAC alignment' },
  { id: 'reporting',        label: 'STR / SAR Reporting',            desc: 'Filing quality, timeliness, MLRO decision audit trail' },
  { id: 'training',         label: 'Training & Awareness',           desc: 'Coverage, frequency, role-based content' },
  { id: 'data-quality',     label: 'Data Quality & Completeness',    desc: 'GoAML readiness, data lineage, field completeness' },
] as const;

type DimensionId = typeof DIMENSIONS[number]['id'];

const MATURITY_LEVELS = [
  { level: 1, label: 'Initial',     color: 'bg-adv-red',        textColor: 'text-adv-red',        desc: 'Ad-hoc — no formal processes, significant gaps' },
  { level: 2, label: 'Developing',  color: 'bg-adv-gold',       textColor: 'text-adv-gold',       desc: 'Some processes documented but inconsistently applied' },
  { level: 3, label: 'Defined',     color: 'bg-yellow-500',     textColor: 'text-yellow-500',     desc: 'Documented and applied; some gaps remain' },
  { level: 4, label: 'Managed',     color: 'bg-adv-teal',       textColor: 'text-adv-teal',       desc: 'Measured and managed; continuous improvement underway' },
  { level: 5, label: 'Optimised',   color: 'bg-adv-green',      textColor: 'text-adv-green',      desc: 'Best-in-class; proactive, data-driven, fully documented' },
];

const LEVEL_CLASSES: Record<number, string> = {
  1: 'bg-adv-red/20 border-adv-red/40 text-adv-red',
  2: 'bg-adv-gold/20 border-adv-gold/40 text-adv-gold',
  3: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-500',
  4: 'bg-adv-teal/20 border-adv-teal/40 text-adv-teal',
  5: 'bg-adv-green/20 border-adv-green/40 text-adv-green',
};

const LEVEL_ACTIVE: Record<number, string> = {
  1: 'bg-adv-red border-adv-red text-white',
  2: 'bg-adv-gold border-adv-gold text-white',
  3: 'bg-yellow-500 border-yellow-500 text-white',
  4: 'bg-adv-teal border-adv-teal text-adv-dark',
  5: 'bg-adv-green border-adv-green text-white',
};

type Scores = Record<DimensionId, number>;

const DEFAULT_SCORES: Scores = {
  'governance':      3,
  'risk-assessment': 2,
  'cdd-kyc':         3,
  'monitoring':      2,
  'sanctions':       3,
  'reporting':       2,
  'training':        3,
  'data-quality':    2,
};

const STORAGE_KEY = 'compliance_posture_scores';

function loadScores(): Scores {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_SCORES, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_SCORES };
}

function saveScores(scores: Scores) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scores)); } catch { /* ignore */ }
}

function averageScore(scores: Scores): number {
  const values = Object.values(scores);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export default function CompliancePosturePage() {
  const [scores, setScores] = useState<Scores>(loadScores);
  const [hoveredDim, setHoveredDim] = useState<DimensionId | null>(null);
  const [lastSaved, setLastSaved] = useState<string | null>(null);

  const avg = averageScore(scores);
  const avgLevel = MATURITY_LEVELS.find((l) => l.level === Math.round(avg)) || MATURITY_LEVELS[2];

  function setScore(dim: DimensionId, level: number) {
    const next = { ...scores, [dim]: level };
    setScores(next);
    saveScores(next);
    setLastSaved(new Date().toLocaleTimeString());
  }

  const criticalCount  = Object.values(scores).filter((s) => s <= 1).length;
  const developingCount = Object.values(scores).filter((s) => s === 2).length;
  const managedCount   = Object.values(scores).filter((s) => s >= 4).length;

  return (
    <div className="min-h-screen bg-adv-dark p-6">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-adv-teal/10">
            <ShieldCheck className="h-5 w-5 text-adv-teal" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-adv-off-white">Compliance Posture Heatmap</h1>
            <p className="text-sm text-adv-gray">5-level maturity assessment across 8 AML/FCP dimensions</p>
          </div>
        </div>
        {lastSaved && (
          <span className="text-xs text-adv-gray">Saved {lastSaved}</span>
        )}
      </div>

      {/* Summary bar */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-adv-dark-2 p-4">
          <p className="text-xs text-adv-gray">Overall Maturity</p>
          <p className={`mt-1 text-2xl font-bold ${avgLevel.textColor}`}>{avg.toFixed(1)}</p>
          <p className={`text-xs font-medium ${avgLevel.textColor}`}>{avgLevel.label}</p>
        </div>
        <div className="rounded-lg border border-border bg-adv-dark-2 p-4">
          <p className="text-xs text-adv-gray">Critical (Level 1)</p>
          <p className="mt-1 text-2xl font-bold text-adv-red">{criticalCount}</p>
          <p className="text-xs text-adv-gray">dimensions</p>
        </div>
        <div className="rounded-lg border border-border bg-adv-dark-2 p-4">
          <p className="text-xs text-adv-gray">Developing (Level 2)</p>
          <p className="mt-1 text-2xl font-bold text-adv-gold">{developingCount}</p>
          <p className="text-xs text-adv-gray">dimensions</p>
        </div>
        <div className="rounded-lg border border-border bg-adv-dark-2 p-4">
          <p className="text-xs text-adv-gray">Managed+ (Level 4-5)</p>
          <p className="mt-1 text-2xl font-bold text-adv-teal">{managedCount}</p>
          <p className="text-xs text-adv-gray">dimensions</p>
        </div>
      </div>

      {/* Heatmap grid */}
      <div className="mb-6 rounded-xl border border-border bg-adv-dark-2 p-6">
        <h2 className="mb-4 text-sm font-semibold text-adv-off-white">Maturity by Dimension</h2>
        <div className="space-y-3">
          {DIMENSIONS.map((dim) => {
            const score = scores[dim.id];
            const levelInfo = MATURITY_LEVELS[score - 1];
            return (
              <div
                key={dim.id}
                className="flex items-center gap-4"
                onMouseEnter={() => setHoveredDim(dim.id)}
                onMouseLeave={() => setHoveredDim(null)}
              >
                {/* Dimension label */}
                <div className="w-52 shrink-0">
                  <p className="text-sm text-adv-off-white">{dim.label}</p>
                  {hoveredDim === dim.id && (
                    <p className="mt-0.5 text-xs text-adv-gray">{dim.desc}</p>
                  )}
                </div>

                {/* Level selector */}
                <div className="flex flex-1 gap-1">
                  {MATURITY_LEVELS.map((ml) => (
                    <button
                      key={ml.level}
                      title={`${ml.label}: ${ml.desc}`}
                      onClick={() => setScore(dim.id, ml.level)}
                      className={`flex-1 rounded border py-1.5 text-xs font-medium transition-all ${
                        score === ml.level
                          ? LEVEL_ACTIVE[ml.level]
                          : `${LEVEL_CLASSES[ml.level]} hover:opacity-80`
                      }`}
                    >
                      {ml.level}
                    </button>
                  ))}
                </div>

                {/* Current label */}
                <div className={`w-24 shrink-0 text-right text-xs font-medium ${levelInfo.textColor}`}>
                  {levelInfo.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Maturity legend */}
      <div className="rounded-xl border border-border bg-adv-dark-2 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Info className="h-4 w-4 text-adv-gray" />
          <h3 className="text-sm font-medium text-adv-off-white">Maturity Level Reference</h3>
        </div>
        <div className="grid grid-cols-5 gap-2">
          {MATURITY_LEVELS.map((ml) => (
            <div key={ml.level} className={`rounded-lg border p-3 ${LEVEL_CLASSES[ml.level]}`}>
              <p className="font-semibold">Level {ml.level}: {ml.label}</p>
              <p className="mt-1 text-xs opacity-80">{ml.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
