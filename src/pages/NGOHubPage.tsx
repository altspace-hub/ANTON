/**
 * NGOHubPage.tsx
 *
 * Landing page for the NGO & Social Impact section.
 * Groups all 9 NGO-tagged areas in one place, with a
 * 2-step AI needs wizard that routes users to the right module.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Heart, Sprout, MapPin, HardHat, GraduationCap,
  ShoppingBag, CreditCard, PiggyBank, Bird,
  ArrowRight, ChevronRight, ChevronLeft,
  Globe, Users, Leaf, Scale,
  Stethoscope, Wheat, BookOpen, Wallet,
} from 'lucide-react';

// ── Area catalogue ──────────────────────────────────────────────────

interface NgoArea {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;        // Tailwind text-* class
  bg: string;           // Tailwind bg-* class
  border: string;       // Tailwind border-* class
  clusterLabel: string;
  moduleCount: number;
  firstModuleId: string; // First module to open when user browses this area
}

const NGO_AREAS: NgoArea[] = [
  {
    id: 'community-health',
    name: 'Community Health',
    description: 'Symptom triage, maternal & child health, disease prevention, mental health referral.',
    icon: Heart,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    clusterLabel: 'Health & Wellbeing',
    moduleCount: 8,
    firstModuleId: 'symptom-assessment',
  },
  {
    id: 'smallholder-farming',
    name: 'Smallholder Farming',
    description: 'Crop planning, pest & disease control, soil health, irrigation, market prices.',
    icon: Sprout,
    color: 'text-adv-green',
    bg: 'bg-adv-green/10',
    border: 'border-adv-green/20',
    clusterLabel: 'Food & Agriculture',
    moduleCount: 8,
    firstModuleId: 'crop-planning-advisor',
  },
  {
    id: 'livestock-poultry',
    name: 'Livestock & Poultry',
    description: 'Animal health, feeding, disease prevention, dairy production, market timing.',
    icon: Bird,
    color: 'text-adv-green',
    bg: 'bg-adv-green/10',
    border: 'border-adv-green/20',
    clusterLabel: 'Food & Agriculture',
    moduleCount: 5,
    firstModuleId: 'animal-health-disease',
  },
  {
    id: 'land-rights',
    name: 'Land & Property Rights',
    description: 'Land title, boundary disputes, eviction response, women\'s land rights, inheritance.',
    icon: MapPin,
    color: 'text-adv-gold',
    bg: 'bg-adv-gold/10',
    border: 'border-adv-gold/20',
    clusterLabel: 'Rights & Justice',
    moduleCount: 6,
    firstModuleId: 'land-title-verification',
  },
  {
    id: 'workers-rights',
    name: 'Workers\' Rights',
    description: 'Pay, safety, dismissal, migrant worker rights, informal economy protections.',
    icon: HardHat,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
    clusterLabel: 'Rights & Justice',
    moduleCount: 5,
    firstModuleId: 'employment-rights-checker',
  },
  {
    id: 'education-literacy',
    name: 'Education & Literacy',
    description: 'Adult literacy, numeracy, scholarships, skills training, exam preparation.',
    icon: GraduationCap,
    color: 'text-adv-blue',
    bg: 'bg-adv-blue/10',
    border: 'border-adv-blue/20',
    clusterLabel: 'Learning & Skills',
    moduleCount: 6,
    firstModuleId: 'adult-literacy-tutor',
  },
  {
    id: 'micro-business',
    name: 'Micro-Business',
    description: 'Bookkeeping, pricing, registration, tax basics, and growth for micro-entrepreneurs.',
    icon: ShoppingBag,
    color: 'text-adv-gold',
    bg: 'bg-adv-gold/10',
    border: 'border-adv-gold/20',
    clusterLabel: 'Economic Empowerment',
    moduleCount: 5,
    firstModuleId: 'business-registration-guide',
  },
  {
    id: 'credit-navigator',
    name: 'Credit & Loans',
    description: 'Compare loan options, understand contracts, know your rights with lenders.',
    icon: CreditCard,
    color: 'text-adv-teal',
    bg: 'bg-adv-teal-dim',
    border: 'border-adv-teal/20',
    clusterLabel: 'Economic Empowerment',
    moduleCount: 4,
    firstModuleId: 'loan-comparison',
  },
  {
    id: 'microfinance',
    name: 'Microfinance',
    description: 'MFI compliance, risk management, social performance, and financial inclusion design.',
    icon: PiggyBank,
    color: 'text-adv-teal',
    bg: 'bg-adv-teal-dim',
    border: 'border-adv-teal/20',
    clusterLabel: 'Economic Empowerment',
    moduleCount: 5,
    firstModuleId: 'financial-inclusion-strategy',
  },
  {
    id: 'humanitarian',
    name: 'Humanitarian & NGO Programme Design',
    description: 'Log frames, theory of change, M&E frameworks, donor reporting, and grant writing for NGO professionals.',
    icon: Globe,
    color: 'text-adv-green',
    bg: 'bg-adv-green/10',
    border: 'border-adv-green/20',
    clusterLabel: 'Programme Management',
    moduleCount: 4,
    firstModuleId: 'log-frame-generator',
  },
];

// ── Needs wizard ─────────────────────────────────────────────────────

interface WizardCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  needs: WizardNeed[];
}

interface WizardNeed {
  label: string;
  areaId: string;
  moduleId?: string;
  hint: string;      // Pre-filled context hint passed to the module
}

const WIZARD_CATEGORIES: WizardCategory[] = [
  {
    id: 'health',
    label: 'Health & Wellbeing',
    icon: Stethoscope,
    color: 'text-red-400',
    needs: [
      { label: 'Someone is sick — what should I do?', areaId: 'community-health', moduleId: 'symptom-assessment', hint: 'Help assess symptoms and decide on urgency of care.' },
      { label: 'Pregnant woman or newborn care', areaId: 'community-health', moduleId: 'maternal-child-health', hint: 'Guidance on maternal and newborn health.' },
      { label: 'Disease prevention in the community', areaId: 'community-health', moduleId: 'disease-prevention-first-aid', hint: 'Preventing common diseases in a community setting.' },
      { label: 'Mental health support', areaId: 'community-health', moduleId: 'mental-health-referral', hint: 'Mental health awareness, support, and referral guidance.' },
      { label: 'Medicine questions', areaId: 'community-health', moduleId: 'medicine-dosage-safety', hint: 'Medicine safety, dosage guidance, and adherence.' },
    ],
  },
  {
    id: 'food',
    label: 'Food & Farming',
    icon: Wheat,
    color: 'text-adv-green',
    needs: [
      { label: 'What to plant and when', areaId: 'smallholder-farming', moduleId: 'crop-planning-advisor', hint: 'Planning what to plant this season.' },
      { label: 'Crops have pests or disease', areaId: 'smallholder-farming', moduleId: 'pest-disease-guide', hint: 'Identifying and treating crop pests and diseases.' },
      { label: 'Improving soil health', areaId: 'smallholder-farming', moduleId: 'soil-health-assessment', hint: 'Assessing and improving soil fertility and structure.' },
      { label: 'Water and irrigation challenges', areaId: 'smallholder-farming', moduleId: 'water-irrigation-management', hint: 'Managing water and irrigation for smallholder farms.' },
      { label: 'Livestock or poultry health', areaId: 'livestock-poultry', moduleId: 'animal-health-disease', hint: 'Animal health and husbandry for small-scale farmers.' },
      { label: 'Getting better market prices', areaId: 'smallholder-farming', moduleId: 'market-price-guide', hint: 'Understanding market prices and selling strategies.' },
    ],
  },
  {
    id: 'rights',
    label: 'Rights & Justice',
    icon: Scale,
    color: 'text-adv-gold',
    needs: [
      { label: 'Land dispute or eviction threat', areaId: 'land-rights', moduleId: 'land-grab-eviction-response', hint: 'Understanding land rights and dispute options.' },
      { label: 'Women\'s land and inheritance rights', areaId: 'land-rights', moduleId: 'womens-land-rights', hint: 'Women\'s rights to land, property, and inheritance.' },
      { label: 'Workplace problem — pay or dismissal', areaId: 'workers-rights', moduleId: 'employment-rights-checker', hint: 'Workers\' rights regarding pay, dismissal, and contracts.' },
      { label: 'Unsafe working conditions', areaId: 'workers-rights', moduleId: 'workplace-safety-rights', hint: 'Workplace safety rights and how to raise concerns.' },
      { label: 'Migrant worker rights', areaId: 'workers-rights', moduleId: 'migrant-worker-rights', hint: 'Rights for migrant and informal workers.' },
    ],
  },
  {
    id: 'money',
    label: 'Money & Business',
    icon: Wallet,
    color: 'text-adv-teal',
    needs: [
      { label: 'Starting or growing a small business', areaId: 'micro-business', moduleId: 'business-registration-guide', hint: 'Practical guidance for micro-entrepreneurs and market traders.' },
      { label: 'Understanding a loan or credit offer', areaId: 'credit-navigator', moduleId: 'loan-comparison', hint: 'Understanding loan terms, rights with lenders, and comparing options.' },
      { label: 'In debt — need help managing it', areaId: 'credit-navigator', moduleId: 'predatory-lending-checker', hint: 'Managing debt and avoiding dangerous debt traps.' },
      { label: 'Running a microfinance programme', areaId: 'microfinance', moduleId: 'financial-inclusion-strategy', hint: 'MFI compliance, social performance, and risk management.' },
    ],
  },
  {
    id: 'education',
    label: 'Learning & Skills',
    icon: BookOpen,
    color: 'text-adv-blue',
    needs: [
      { label: 'Adult literacy or numeracy support', areaId: 'education-literacy', moduleId: 'adult-literacy-tutor', hint: 'Improving reading, writing, and numeracy skills in adults.' },
      { label: 'Children\'s learning support', areaId: 'education-literacy', moduleId: 'homework-helper', hint: 'Supporting children\'s school learning and homework.' },
      { label: 'Finding scholarships or training', areaId: 'education-literacy', moduleId: 'scholarship-funding-finder', hint: 'Discovering scholarships, training programmes, and skills development.' },
      { label: 'Digital literacy basics', areaId: 'education-literacy', moduleId: 'digital-literacy-basics', hint: 'Learning to use phones, internet, and digital tools safely.' },
    ],
  },
];

// ── Common journeys ───────────────────────────────────────────────────

const JOURNEYS = [
  {
    title: 'Community Health Response',
    description: 'From first symptoms to safe referral and follow-up care.',
    steps: ['Symptom Assessment', 'Disease Prevention', 'Mental Health Referral'],
    areaId: 'community-health',
    firstModuleId: 'symptom-assessment',
    color: 'border-red-500/30 hover:border-red-500/50',
    icon: Heart,
    iconColor: 'text-red-400',
  },
  {
    title: 'Smallholder Farming Season',
    description: 'Plan, grow, protect, and sell with confidence this season.',
    steps: ['Crop Planning', 'Pest & Disease Guide', 'Market Price Guide'],
    areaId: 'smallholder-farming',
    firstModuleId: 'crop-planning-advisor',
    color: 'border-adv-green/30 hover:border-adv-green/50',
    icon: Sprout,
    iconColor: 'text-adv-green',
  },
  {
    title: 'Workers\' Rights Case',
    description: 'Understand your rights, document the issue, and find support.',
    steps: ['Know Your Rights', 'Document the Case', 'Find Legal Support'],
    areaId: 'workers-rights',
    firstModuleId: 'employment-rights-checker',
    color: 'border-adv-gold/30 hover:border-adv-gold/50',
    icon: HardHat,
    iconColor: 'text-adv-gold',
  },
  {
    title: 'Micro-Enterprise Launch',
    description: 'Start, register, price, and grow your small business.',
    steps: ['Business Basics', 'Pricing & Records', 'Understand Loans'],
    areaId: 'micro-business',
    firstModuleId: 'business-registration-guide',
    color: 'border-adv-teal/30 hover:border-adv-teal/50',
    icon: ShoppingBag,
    iconColor: 'text-adv-teal',
  },
];

// ── Cluster grouping ─────────────────────────────────────────────────

const CLUSTER_ORDER = [
  'Health & Wellbeing',
  'Food & Agriculture',
  'Rights & Justice',
  'Economic Empowerment',
  'Learning & Skills',
];

const CLUSTER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Health & Wellbeing': Heart,
  'Food & Agriculture': Leaf,
  'Rights & Justice': Scale,
  'Economic Empowerment': Wallet,
  'Learning & Skills': BookOpen,
};

// ── Component ────────────────────────────────────────────────────────

type WizardStep = 'idle' | 'category' | 'need' | 'result';

export default function NGOHubPage() {
  const navigate = useNavigate();

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>('idle');
  const [selectedCategory, setSelectedCategory] = useState<WizardCategory | null>(null);
  const [selectedNeed, setSelectedNeed] = useState<WizardNeed | null>(null);

  function startWizard() {
    setWizardStep('category');
    setSelectedCategory(null);
    setSelectedNeed(null);
  }

  function selectCategory(cat: WizardCategory) {
    setSelectedCategory(cat);
    setWizardStep('need');
  }

  function selectNeed(need: WizardNeed) {
    setSelectedNeed(need);
    setWizardStep('result');
  }

  function openResult() {
    if (!selectedNeed) return;
    const { areaId, moduleId, hint } = selectedNeed;
    if (moduleId) {
      navigate(`/module/${moduleId}`, { state: { areaId, prefill: hint } });
    } else {
      navigate(`/module/${areaId}`, { state: { areaId, prefill: hint } });
    }
  }

  function resetWizard() {
    setWizardStep('idle');
    setSelectedCategory(null);
    setSelectedNeed(null);
  }

  // Group areas by cluster
  const byCluster = CLUSTER_ORDER.map((cluster) => ({
    label: cluster,
    icon: CLUSTER_ICONS[cluster],
    areas: NGO_AREAS.filter((a) => a.clusterLabel === cluster),
  })).filter((g) => g.areas.length > 0);

  const totalModules = NGO_AREAS.reduce((sum, a) => sum + a.moduleCount, 0);

  return (
    <div className="min-h-screen bg-adv-dark">
      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden border-b border-border bg-adv-dark-2">
        <div className="absolute inset-0 bg-gradient-to-br from-adv-green/5 via-transparent to-adv-teal/5 pointer-events-none" />
        <div className="relative mx-auto max-w-5xl px-6 py-10">
          <div className="flex items-center gap-2 text-xs text-adv-gray mb-4">
            <Globe className="h-3.5 w-3.5" />
            <span>NGO &amp; Social Impact</span>
          </div>

          <h1 className="text-2xl font-bold text-adv-white mb-2">
            Tools for those who serve communities
          </h1>
          <p className="text-adv-gray max-w-2xl mb-6">
            AI-powered guidance for NGOs, community health workers, extension officers, legal aid
            providers, and social enterprises. {NGO_AREAS.length} specialist areas, {totalModules}+ expert modules — all
            designed for low-resource settings where the right information saves lives and livelihoods.
          </p>

          {/* Stats strip */}
          <div className="flex flex-wrap gap-6">
            {[
              { icon: Users, label: 'Focus: Communities in LMIC settings' },
              { icon: Globe, label: 'Coverage: Africa, South Asia, Southeast Asia' },
              { icon: Leaf, label: `${NGO_AREAS.length} specialist areas · ${totalModules}+ modules` },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-sm text-adv-gray">
                <Icon className="h-4 w-4 text-adv-teal shrink-0" />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8 space-y-10">

        {/* ── Needs Wizard ─────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-adv-gray mb-4">
            What does your community need today?
          </h2>

          <div className="rounded-xl border border-border bg-adv-dark-2 overflow-hidden">

            {/* Step: idle */}
            {wizardStep === 'idle' && (
              <div className="p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                <div>
                  <p className="text-adv-off-white font-medium mb-1">Not sure where to start?</p>
                  <p className="text-sm text-adv-gray">
                    Answer two quick questions and we'll point you to exactly the right tool.
                  </p>
                </div>
                <button
                  onClick={startWizard}
                  className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors shrink-0"
                >
                  Find the right tool
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Step: pick category */}
            {wizardStep === 'category' && (
              <div className="p-6">
                <p className="text-sm font-medium text-adv-off-white mb-4">
                  Step 1 of 2 — What is the main focus area?
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {WIZARD_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => selectCategory(cat)}
                        className="flex flex-col items-center gap-2 rounded-xl border border-border bg-adv-card p-4 text-center hover:border-adv-teal/50 hover:bg-adv-teal-dim transition-colors group"
                      >
                        <Icon className={`h-6 w-6 ${cat.color} group-hover:scale-110 transition-transform`} />
                        <span className="text-xs font-medium text-adv-off-white leading-tight">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Step: pick specific need */}
            {wizardStep === 'need' && selectedCategory && (
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => setWizardStep('category')}
                    className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <span className="text-sm font-medium text-adv-off-white">
                    Step 2 of 2 — {selectedCategory.label}: what specifically do you need?
                  </span>
                </div>
                <div className="space-y-2">
                  {selectedCategory.needs.map((need) => (
                    <button
                      key={need.label}
                      onClick={() => selectNeed(need)}
                      className="w-full flex items-center justify-between rounded-lg border border-border bg-adv-card px-4 py-3 text-left hover:border-adv-teal/50 hover:bg-adv-teal-dim transition-colors group"
                    >
                      <span className="text-sm text-adv-off-white">{need.label}</span>
                      <ChevronRight className="h-4 w-4 text-adv-gray group-hover:text-adv-teal transition-colors shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step: result */}
            {wizardStep === 'result' && selectedNeed && (
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <button
                    onClick={() => setWizardStep('need')}
                    className="flex items-center gap-1 text-xs text-adv-gray hover:text-adv-teal transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                </div>

                <div className="rounded-xl border border-adv-teal/30 bg-adv-teal-dim p-5 mb-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-adv-teal mb-2">
                    Recommended tool
                  </p>
                  <p className="text-base font-semibold text-adv-white mb-1">{selectedNeed.label}</p>
                  <p className="text-sm text-adv-gray mb-4">{selectedNeed.hint}</p>
                  <div className="flex gap-3">
                    <button
                      onClick={openResult}
                      className="flex items-center gap-2 rounded-lg bg-adv-teal px-4 py-2 text-sm font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
                    >
                      Open this module
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      onClick={resetWizard}
                      className="rounded-lg border border-border px-4 py-2 text-sm text-adv-gray hover:text-adv-off-white hover:bg-adv-card transition-colors"
                    >
                      Start over
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Common Journeys ───────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-adv-gray mb-4">
            Common journeys
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {JOURNEYS.map((journey) => {
              const Icon = journey.icon;
              return (
                <button
                  key={journey.title}
                  onClick={() => navigate(`/module/${journey.firstModuleId}`, { state: { areaId: journey.areaId } })}
                  className={`flex flex-col gap-3 rounded-xl border bg-adv-card p-4 text-left transition-colors ${journey.color}`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-5 w-5 ${journey.iconColor} shrink-0`} />
                    <span className="text-sm font-semibold text-adv-white leading-tight">{journey.title}</span>
                  </div>
                  <p className="text-xs text-adv-gray leading-relaxed">{journey.description}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {journey.steps.map((step, i) => (
                      <span
                        key={step}
                        className="flex items-center gap-1 rounded bg-adv-dark px-2 py-0.5 text-xs text-adv-gray"
                      >
                        <span className="text-adv-gray">{i + 1}.</span>
                        {step}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Areas grid — grouped by cluster ───────────────────── */}
        {byCluster.map(({ label: cluster, icon: ClusterIcon, areas }) => (
          <section key={cluster}>
            <div className="flex items-center gap-2 mb-4">
              <ClusterIcon className="h-4 w-4 text-adv-teal" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-adv-gray">
                {cluster}
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {areas.map((area) => {
                const Icon = area.icon;
                return (
                  <button
                    key={area.id}
                    onClick={() => navigate(`/module/${area.firstModuleId}`, { state: { areaId: area.id } })}
                    className={`flex flex-col gap-3 rounded-xl border ${area.border} ${area.bg} p-5 text-left hover:border-opacity-60 transition-all group`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-5 w-5 ${area.color} shrink-0`} />
                        <span className="text-sm font-semibold text-adv-white">{area.name}</span>
                      </div>
                      <span className="text-xs text-adv-gray shrink-0 mt-0.5">
                        {area.moduleCount} modules
                      </span>
                    </div>
                    <p className="text-xs text-adv-gray leading-relaxed">{area.description}</p>
                    <div className="flex items-center gap-1.5 text-xs text-adv-teal opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Open area</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}

        {/* ── Footer note ───────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-adv-dark-2 p-5">
          <div className="flex items-start gap-3">
            <Globe className="h-5 w-5 text-adv-teal shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-adv-off-white mb-1">
                Designed for deployment in low-resource contexts
              </p>
              <p className="text-xs text-adv-gray leading-relaxed">
                All modules in the Social Impact section are calibrated for Claude Haiku —
                making them fast, affordable, and suitable for high-volume community use.
                Responses are written in plain language, avoiding jargon, with affordable
                and zero-cost solutions always presented first. Every health and legal module
                includes appropriate referral guidance and safety boundaries.
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
