/**
 * RiskAtlasAboutPage — the "what is this workspace?" overview surface.
 *
 * Distinct from RiskAtlasLandingPage (which lists existing atlases). This is
 * the public-facing entry from the Work landing page and the README's
 * regulator/auditor reading track.
 *
 * Shipped per ANTON_Improvement_and_Investigation_Brief.md §D.1.
 */

import { Link } from 'react-router-dom';
import { ShieldAlert, ChevronRight, FileCheck, Calculator, Layers, Globe2 } from 'lucide-react';

const STAGES = [
  { n: 1, name: 'Exposures',         what: 'Where a threat enters (customer types, products, channels, geographies).' },
  { n: 2, name: 'Threat paths',       what: 'How a threat moves (typologies, predicate offences, chains of intent).' },
  { n: 3, name: 'Vulnerabilities',    what: 'Weaknesses that allow the threat to land (control gaps, blind spots).' },
  { n: 4, name: 'Inherent risk',      what: 'max(Exposure, Threat, Vulnerability) — deterministic, no LLM.' },
  { n: 5, name: 'Controls',           what: 'Strong / Adequate / Weak — worst-of rollup. LLM rationale, deterministic score.' },
  { n: 6, name: 'Residual risk',      what: 'Inherent − reduction, clamped to [1,5]. Reproducible across runs.' },
  { n: 7, name: 'Appetite',           what: '5×5 grid: 1–2 within · 3 boundary · 4 outside · 5 unacceptable.' },
];

export default function RiskAtlasAboutPage() {
  return (
    <div className="min-h-screen bg-adv-dark text-adv-off-white">
      <div className="max-w-5xl mx-auto px-4 py-10">
        {/* Hero */}
        <div className="flex items-start gap-3 mb-6">
          <ShieldAlert className="text-adv-teal mt-1" size={28} />
          <div>
            <h1 className="text-3xl font-semibold">Risk Atlas</h1>
            <p className="text-adv-gray mt-1 max-w-2xl">
              A universal, code-grounded threat-path engine. Generalises the CASP / FCP
              business-wide risk-assessment methodology into a living risk register
              any business can maintain — from a single bakery to a tier-1 bank.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-10">
          <Link
            to="/atlas"
            className="inline-flex items-center gap-2 bg-adv-teal hover:bg-adv-teal-dark text-white px-4 py-2 rounded transition"
          >
            Open my atlases <ChevronRight size={16} />
          </Link>
          <Link
            to="/atlas/setup"
            className="inline-flex items-center gap-2 border border-adv-card hover:border-adv-teal px-4 py-2 rounded text-adv-off-white transition"
          >
            Start a new atlas
          </Link>
        </div>

        {/* Why */}
        <section className="bg-adv-card rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">Why Risk Atlas exists</h2>
          <p className="text-sm text-adv-gray leading-relaxed">
            Most risk tools either give you a static heat-map (impossible to defend in an audit)
            or a free-text LLM scoring pass (impossible to reproduce). Risk Atlas keeps the
            <strong className="text-adv-off-white"> deterministic engine</strong> and uses the LLM only for
            <em> rationale</em>. Every score is reproducible across runs; every claim is
            backed by a five-character minimum evidence string. Audit-defensible by construction.
          </p>
        </section>

        {/* Seven stages */}
        <section className="bg-adv-card rounded-lg p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="text-adv-teal" size={18} />
            <h2 className="text-lg font-semibold">The seven-stage method</h2>
          </div>
          <ol className="space-y-3 text-sm">
            {STAGES.map(s => (
              <li key={s.n} className="flex items-start gap-3">
                <span className="bg-adv-teal/20 text-adv-teal w-7 h-7 rounded flex items-center justify-center font-medium">
                  {s.n}
                </span>
                <div>
                  <div className="font-medium text-adv-off-white">{s.name}</div>
                  <div className="text-adv-gray">{s.what}</div>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-4 text-xs text-adv-gray">
            The deterministic core lives in
            <code className="text-adv-off-white"> server/services/risk-atlas/atlas-residual-calculator.ts</code>
            with 25 unit tests. Audit-locked.
          </div>
        </section>

        {/* FCP add-on */}
        <section className="bg-adv-card rounded-lg p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <FileCheck className="text-adv-teal" size={18} />
            <h2 className="text-lg font-semibold">Built for FCP, generalised for every business</h2>
          </div>
          <p className="text-sm text-adv-gray leading-relaxed mb-3">
            The FCP addendum (Article 16 BWRA, AMLR-aligned) ships as a layered overlay:
            seven FCP domains (AML/CFT, sanctions, fraud, ABC, market abuse, tax-evasion
            facilitation, export controls) compose into a Stage 7b
            <strong className="text-adv-off-white"> company-wide appetite rollup</strong> — deterministic,
            worst-of-domain. The same engine handles a sole-operator bakery's BWRA.
          </p>
          <div className="flex items-center gap-2 text-xs text-adv-gray">
            <Globe2 size={14} /> 25 industry packs ship today (under
            <code className="text-adv-off-white"> data/risk-atlas/packs/</code>) — banks, CASPs,
            crowdfunders, accountants, dealers in high-value goods, construction trades, more.
          </div>
        </section>

        {/* Determinism */}
        <section className="bg-adv-card rounded-lg p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Calculator className="text-adv-teal" size={18} />
            <h2 className="text-lg font-semibold">Deterministic by construction</h2>
          </div>
          <ul className="space-y-2 text-sm text-adv-gray">
            <li>• Inherent score = <code className="text-adv-off-white">max(E, T, V)</code> — never an LLM call.</li>
            <li>• Control reduction rolled up worst-of (Strong / Adequate / Weak).</li>
            <li>• Residual = inherent − reduction, clamped to [1, 5].</li>
            <li>• LLM only writes the rationale prose. Scores are never AI-determined.</li>
            <li>• Six built-in integrity rules (ATLAS-INT-001..006) flag anything inconsistent.</li>
          </ul>
        </section>

        {/* Export */}
        <section className="bg-adv-card rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-3">What you can take out</h2>
          <ul className="space-y-2 text-sm text-adv-gray">
            <li>• Board-ready DOCX pack — Stage 1–7 + Stage 7b + named threat-path narrative.</li>
            <li>• Per-threat-path PDF for control owners.</li>
            <li>• 5×5 heatmap SVG — drop into a board deck.</li>
            <li>
              • <code className="text-adv-off-white">.anton risk-atlas-export</code> bundle —
              signed, shareable with regulators / external auditors / consultancies.
            </li>
          </ul>
        </section>

        <div className="text-xs text-adv-gray">
          For the full architecture spec see
          <code className="text-adv-off-white"> /docs/architecture/_audit-notes.md</code>{' '}
          §3 (Risk Atlas row) and the Risk Atlas marketing one-pager at
          <code className="text-adv-off-white"> /docs/marketing/risk-atlas.md</code>.
        </div>
      </div>
    </div>
  );
}
