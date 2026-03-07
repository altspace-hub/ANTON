import React, { useState, useEffect, useRef } from 'react';
import { Play, ChevronRight, Code2, Zap, Building2, Shield, Eye, CheckCircle, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ApiLogEntry {
  timestamp: string;
  method: string;
  endpoint: string;
  status: number;
  responseMs: number;
  source: 'roaring' | 'dowjones' | 'anton';
}

interface DemoScene {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  color: string;
  steps: Array<{
    label: string;
    description: string;
    apiCalls?: ApiLogEntry[];
    delay: number;
  }>;
}

const SCENES: DemoScene[] = [
  {
    id: 'onboarding',
    title: 'Scene 1 — Customer Onboarding',
    subtitle: 'Roaring integration: company search → UBO chain → EDD trigger',
    icon: <Building2 className="h-5 w-5" />,
    color: 'text-adv-teal',
    steps: [
      {
        label: 'Company search initiated',
        description: 'User enters "Acme Holdings AB" in ANTON module. ANTON detects Swedish company pattern and triggers Roaring lookup.',
        apiCalls: [
          { timestamp: new Date().toISOString(), method: 'GET', endpoint: '/api/roaring/company/Acme Holdings AB', status: 200, responseMs: 147, source: 'roaring' },
        ],
        delay: 800,
      },
      {
        label: 'UBO chain retrieved',
        description: 'Roaring returns full UBO chain. ANTON detects indirect ownership via offshore entity (Panama Holdings Ltd) and PEP flag on ultimate beneficial owner John Smith.',
        apiCalls: [
          { timestamp: new Date().toISOString(), method: 'GET', endpoint: '/api/roaring/ubo/556123-4567', status: 200, responseMs: 203, source: 'roaring' },
        ],
        delay: 1200,
      },
      {
        label: 'Roaring data injected into prompt',
        description: 'ANTON builds Layer 2c (Roaring entity layer) and injects structured data into the active FCP module session. AI now reasons over live registry data.',
        apiCalls: [
          { timestamp: new Date().toISOString(), method: 'POST', endpoint: '/api/roaring/enrich-session', status: 200, responseMs: 52, source: 'roaring' },
        ],
        delay: 600,
      },
      {
        label: 'EDD session auto-opened in Counsel\'s Desk',
        description: 'Risk score ≥ 70 triggers automatic EDD workflow. Counsel\'s Desk opens with pre-loaded context: Roaring entity profile, UBO chain, PEP flag rationale, AMLR Art. 22 reference.',
        apiCalls: [
          { timestamp: new Date().toISOString(), method: 'POST', endpoint: '/api/legal-research/sessions', status: 201, responseMs: 89, source: 'anton' },
        ],
        delay: 1000,
      },
    ],
  },
  {
    id: 'sanctions',
    title: 'Scene 2 — Sanctions Alert',
    subtitle: 'Dow Jones integration: monitoring alert → Proactive Intelligence → auto-brief',
    icon: <Shield className="h-5 w-5" />,
    color: 'text-adv-red',
    steps: [
      {
        label: 'DJ watchlist change webhook fires',
        description: 'Dow Jones sends webhook: "Global Trade Partners LLC" added to EU Consolidated Sanctions list. ANTON webhook listener receives event.',
        apiCalls: [
          { timestamp: new Date().toISOString(), method: 'POST', endpoint: '/webhooks/inbound/dowjones', status: 200, responseMs: 31, source: 'dowjones' },
        ],
        delay: 500,
      },
      {
        label: 'Proactive Intelligence insight created',
        description: 'ANTON event-workflow-processor creates a WATCHLIST_CHANGE insight (HIGH priority). InsightsBell notification fires. Any active session with this entity is flagged.',
        apiCalls: [
          { timestamp: new Date().toISOString(), method: 'POST', endpoint: '/api/insights', status: 201, responseMs: 44, source: 'anton' },
        ],
        delay: 800,
      },
      {
        label: 'DJ screening data injected into prompt',
        description: 'ANTON builds Layer 2d (DJ screening layer) with full hit details, source lists, designation date, and associated entity network.',
        apiCalls: [
          { timestamp: new Date().toISOString(), method: 'GET', endpoint: '/api/dowjones/entity/ENT-2024-00847', status: 200, responseMs: 178, source: 'dowjones' },
        ],
        delay: 900,
      },
      {
        label: 'Sanctions research session opened',
        description: 'Counsel\'s Desk opens in "Sanctions Deep-Dive" mode with DJ screening evidence pre-loaded. AI drafts legal opinion with AMLR Art. 16 (screening obligations) and Art. 40 (freezing) citations.',
        apiCalls: [
          { timestamp: new Date().toISOString(), method: 'POST', endpoint: '/api/legal-research/sessions', status: 201, responseMs: 92, source: 'anton' },
          { timestamp: new Date().toISOString(), method: 'POST', endpoint: '/api/legal-research/sessions/lr-abc123/message', status: 200, responseMs: 3240, source: 'anton' },
        ],
        delay: 2000,
      },
    ],
  },
  {
    id: 'combined-edd',
    title: 'Scene 3 — Combined EDD',
    subtitle: 'Full enhanced due diligence: Roaring + DJ + AMLR gap assessment',
    icon: <Eye className="h-5 w-5" />,
    color: 'text-adv-gold',
    steps: [
      {
        label: 'Entity Intelligence Panel activated',
        description: 'Compliance officer opens Entity Intelligence Panel for "Acme Holdings AB". ANTON runs Roaring registry lookup + DJ global screen in parallel (avg 320ms combined).',
        apiCalls: [
          { timestamp: new Date().toISOString(), method: 'GET', endpoint: '/api/roaring/profile/556123-4567', status: 200, responseMs: 287, source: 'roaring' },
          { timestamp: new Date().toISOString(), method: 'POST', endpoint: '/api/dowjones/screen', status: 200, responseMs: 334, source: 'dowjones' },
        ],
        delay: 1000,
      },
      {
        label: 'Combined risk assessment computed',
        description: 'ANTON combines Roaring (UBO PEP flag, complexity 3/5) and DJ (PEP STRONG match, 2 adverse media articles) into an overall HIGH risk score. AMLR triggers: Art. 22 + Art. 40.',
        delay: 600,
      },
      {
        label: 'AMLR gap assessment scoped to PEP articles',
        description: 'Gap Assessment Wizard auto-scopes to AMLR Articles 20–25 (PEP provisions). Engine assesses institution\'s PEP identification, approval, and monitoring controls.',
        apiCalls: [
          { timestamp: new Date().toISOString(), method: 'POST', endpoint: '/api/gap-assessments', status: 201, responseMs: 65, source: 'anton' },
          { timestamp: new Date().toISOString(), method: 'GET', endpoint: '/api/gap-assessments/ga-xyz789/stream', status: 200, responseMs: 8450, source: 'anton' },
        ],
        delay: 2500,
      },
      {
        label: 'Board-ready EDD summary generated',
        description: 'ANTON generates executive EDD summary: entity profile (Roaring), screening evidence (DJ), AMLR compliance gaps, recommended actions, risk appetite statement. Exportable as PDF.',
        apiCalls: [
          { timestamp: new Date().toISOString(), method: 'POST', endpoint: '/api/export/pdf', status: 200, responseMs: 1240, source: 'anton' },
        ],
        delay: 1500,
      },
    ],
  },
];

function ApiLogPanel({ entries }: { entries: ApiLogEntry[] }) {
  if (entries.length === 0) return null;
  const SOURCE_COLOR = {
    roaring: 'text-adv-teal',
    dowjones: 'text-adv-blue',
    anton: 'text-adv-gold',
  };
  return (
    <div className="rounded-lg border border-adv-dark/60 bg-adv-dark/70 p-3 font-mono text-[11px] space-y-1">
      <div className="text-adv-gray-med mb-2 font-sans text-[10px]">API calls</div>
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className={SOURCE_COLOR[entry.source]}>[{entry.source.toUpperCase()}]</span>
          <span className="text-adv-gray">{entry.method}</span>
          <span className="text-adv-off-white flex-1 truncate">{entry.endpoint}</span>
          <span className="text-adv-green">{entry.status}</span>
          <span className="text-adv-gray-med">{entry.responseMs}ms</span>
        </div>
      ))}
    </div>
  );
}

function ScenePlayer({ scene }: { scene: DemoScene }) {
  const [currentStep, setCurrentStep] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [complete, setComplete] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function runStep(index: number) {
    if (index >= scene.steps.length) {
      setPlaying(false);
      setComplete(true);
      return;
    }
    setCurrentStep(index);
    const step = scene.steps[index];
    timerRef.current = setTimeout(() => runStep(index + 1), step.delay + 400);
  }

  function handlePlay() {
    setCurrentStep(-1);
    setComplete(false);
    setPlaying(true);
    timerRef.current = setTimeout(() => runStep(0), 200);
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={handlePlay}
          disabled={playing}
          className="flex items-center gap-2 rounded-xl bg-adv-teal/10 border border-adv-teal/30 px-4 py-2 text-sm text-adv-teal hover:bg-adv-teal/20 disabled:opacity-50 transition-colors"
        >
          <Play className="h-4 w-4" />
          {playing ? 'Running demo…' : complete ? 'Replay' : 'Run Demo'}
        </button>
        {complete && (
          <div className="flex items-center gap-1.5 text-xs text-adv-green">
            <CheckCircle className="h-4 w-4" />
            Demo complete — all steps succeeded
          </div>
        )}
      </div>

      <div className="space-y-3">
        {scene.steps.map((step, i) => {
          const state = currentStep < i ? 'pending' : currentStep === i ? 'active' : 'done';
          return (
            <div
              key={i}
              className={`rounded-xl border p-4 transition-all duration-300 ${
                state === 'active' ? 'border-adv-teal/40 bg-adv-teal/5' :
                state === 'done' ? 'border-adv-dark/40 bg-adv-dark/20 opacity-80' :
                'border-adv-dark/30 bg-adv-dark/10 opacity-40'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition-colors ${
                  state === 'done' ? 'border-adv-green/40 bg-adv-green/10 text-adv-green' :
                  state === 'active' ? 'border-adv-teal/40 bg-adv-teal/10 text-adv-teal animate-pulse' :
                  'border-adv-dark/60 bg-adv-dark/40 text-adv-gray'
                }`}>
                  {state === 'done' ? '✓' : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-adv-off-white">{step.label}</span>
                    {state === 'active' && <span className="text-[10px] text-adv-teal animate-pulse">● processing</span>}
                  </div>
                  <p className="text-xs text-adv-gray">{step.description}</p>
                  {state !== 'pending' && step.apiCalls && step.apiCalls.length > 0 && (
                    <div className="mt-2">
                      <ApiLogPanel entries={step.apiCalls} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-adv-gold/20 bg-adv-gold/5 px-3 py-2 text-xs text-adv-gold">
        ⚠ All data shown is mock demo data — structurally identical to live API responses. Replace <code>ROARING_API_KEY</code> and <code>DOWJONES_API_KEY</code> in <code>.env</code> to go live.
      </div>
    </div>
  );
}

export default function PartnershipDemo() {
  const navigate = useNavigate();
  const [activeScene, setActiveScene] = useState(0);

  return (
    <div className="min-h-screen bg-adv-dark p-6">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div className="rounded-2xl border border-adv-teal/20 bg-gradient-to-br from-adv-card to-adv-dark-2 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-adv-teal/10 border border-adv-teal/20">
              <Zap className="h-5 w-5 text-adv-teal" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-adv-off-white">ANTON × Data Partnerships Demo</h1>
              <p className="text-xs text-adv-gray">Roaring (Nordic entity registry) + Dow Jones Risk & Compliance</p>
            </div>
          </div>
          <p className="text-sm text-adv-gray mb-4">
            This demo shows exactly what ANTON can do when integrated with Roaring and Dow Jones data.
            All three scenes run on mock data — structurally identical to live API responses.
            A partner's technical team can see exactly how the integration works and what it would look like with live credentials.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => navigate('/roaring')}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal/10 border border-adv-teal/30 px-3 py-1.5 text-xs text-adv-teal hover:bg-adv-teal/20 transition-colors"
            >
              <Building2 className="h-3.5 w-3.5" />
              Open Roaring Search
            </button>
            <button
              onClick={() => navigate('/dj-screening')}
              className="flex items-center gap-1.5 rounded-lg bg-adv-blue/10 border border-adv-blue/30 px-3 py-1.5 text-xs text-adv-blue hover:bg-adv-blue/20 transition-colors"
            >
              <Shield className="h-3.5 w-3.5" />
              Open DJ Screening
            </button>
            <button
              onClick={() => navigate('/entity-intelligence')}
              className="flex items-center gap-1.5 rounded-lg bg-adv-gold/10 border border-adv-gold/30 px-3 py-1.5 text-xs text-adv-gold hover:bg-adv-gold/20 transition-colors"
            >
              <Eye className="h-3.5 w-3.5" />
              Entity Intelligence
            </button>
            <a
              href="/docs/partnerships/ROARING_INTEGRATION_BRIEF.md"
              className="flex items-center gap-1.5 rounded-lg bg-adv-card border border-adv-gray/20 px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
            >
              <Code2 className="h-3.5 w-3.5" />
              Integration Briefs
            </a>
          </div>
        </div>

        {/* Scene selector */}
        <div className="grid grid-cols-3 gap-3">
          {SCENES.map((scene, i) => (
            <button
              key={scene.id}
              onClick={() => setActiveScene(i)}
              className={`rounded-xl border p-4 text-left transition-all ${
                activeScene === i
                  ? 'border-adv-teal/40 bg-adv-teal/5'
                  : 'border-adv-dark/50 bg-adv-card hover:border-adv-dark/80'
              }`}
            >
              <div className={`flex items-center gap-2 mb-1 ${scene.color}`}>
                {scene.icon}
                <span className="text-xs font-semibold">Scene {i + 1}</span>
              </div>
              <div className="text-sm font-medium text-adv-off-white mb-1">
                {scene.title.replace(`Scene ${i + 1} — `, '')}
              </div>
              <div className="text-[11px] text-adv-gray">{scene.subtitle}</div>
            </button>
          ))}
        </div>

        {/* Active scene */}
        <div className="rounded-2xl border border-adv-dark/50 bg-adv-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <span className={`${SCENES[activeScene].color}`}>{SCENES[activeScene].icon}</span>
            <div>
              <h2 className="text-base font-semibold text-adv-off-white">{SCENES[activeScene].title}</h2>
              <p className="text-xs text-adv-gray">{SCENES[activeScene].subtitle}</p>
            </div>
          </div>
          <ScenePlayer key={activeScene} scene={SCENES[activeScene]} />
        </div>

        {/* What this would look like with live credentials */}
        <div className="rounded-xl border border-adv-dark/50 bg-adv-card p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-adv-gold" />
            <h3 className="text-sm font-semibold text-adv-off-white">Going live — what changes</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs text-adv-gray">
            <div>
              <div className="font-medium text-adv-teal mb-1">Roaring</div>
              <ul className="space-y-1">
                <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-adv-gray-med" />Set <code className="text-adv-off-white">ROARING_API_KEY</code> in <code>.env</code></li>
                <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-adv-gray-med" />All mock responses automatically replaced with live Roaring API data</li>
                <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-adv-gray-med" />Status indicator changes from "Mock" to "Live API"</li>
                <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-adv-gray-med" />Sandbox endpoint at <code>api.roaring.io/v2/</code> — no code change needed</li>
              </ul>
            </div>
            <div>
              <div className="font-medium text-adv-blue mb-1">Dow Jones R&C</div>
              <ul className="space-y-1">
                <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-adv-gray-med" />Set <code className="text-adv-off-white">DOWJONES_API_KEY</code> in <code>.env</code></li>
                <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-adv-gray-med" />OAuth 2.0 client credentials flow handled automatically</li>
                <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-adv-gray-med" />Webhook URL: <code>https://[your-domain]/webhooks/inbound/dowjones</code></li>
                <li className="flex items-start gap-1.5"><ChevronRight className="h-3 w-3 shrink-0 mt-0.5 text-adv-gray-med" />Monitoring alerts flow automatically into Proactive Intelligence</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
