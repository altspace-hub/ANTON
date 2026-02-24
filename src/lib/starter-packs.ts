export interface StarterPack {
  id: string;
  name: string;
  description: string;
  targetUser: string;           // "Nordic bank compliance officer"
  icon: string;                 // Lucide icon name
  color: string;                // Tailwind color class e.g. 'adv-teal'
  moduleIds: string[];          // Module IDs from constants.ts
  highlightModuleId: string;    // Which module to open first
  tags: string[];
}

export const STARTER_PACKS: StarterPack[] = [
  {
    id: 'nordic-bank-aml',
    name: 'Nordic Bank AML',
    description: 'Complete AML/CFT compliance toolkit for Nordic retail and corporate banks. Covers AMLR gap analysis, policy creation, risk assessment, and training.',
    targetUser: 'Bank compliance officer',
    icon: 'Building2',
    color: 'adv-teal',
    moduleIds: ['gap-analysis', 'document-creation', 'risk-assessment', 'training-content', 'regulatory-monitor'],
    highlightModuleId: 'gap-analysis',
    tags: ['AML', 'Banking', 'Nordic', 'AMLR'],
  },
  {
    id: 'sanctions-specialist',
    name: 'Sanctions Specialist',
    description: 'Everything a sanctions officer needs: regime briefings, screening assessments, policy reviews, and incident response workflows.',
    targetUser: 'Sanctions officer',
    icon: 'Shield',
    color: 'adv-red',
    moduleIds: ['sanctions-advisory', 'regulatory-monitor', 'document-creation', 'investigation-support'],
    highlightModuleId: 'sanctions-advisory',
    tags: ['Sanctions', 'OFAC', 'EU', 'Screening'],
  },
  {
    id: 'startup-founder',
    name: 'Startup Founder Kit',
    description: 'Everything a founder needs: business plan, pitch deck, funding strategy, MVP scoping, and co-founder agreements.',
    targetUser: 'Startup founder',
    icon: 'Rocket',
    color: 'adv-gold',
    moduleIds: ['business-plan', 'pitch-deck', 'funding-strategy', 'mvp-scoping', 'cofounder-agreements'],
    highlightModuleId: 'business-plan',
    tags: ['Startup', 'Funding', 'Pitch'],
  },
  {
    id: 'legal-advisor',
    name: 'Legal Advisor',
    description: 'Contract review, regulatory interpretation, compliance framework building, and GDPR/privacy analysis for in-house legal teams.',
    targetUser: 'In-house legal counsel',
    icon: 'Scale',
    color: 'adv-blue',
    moduleIds: ['contract-review', 'regulatory-interpretation', 'compliance-framework', 'gdpr-privacy', 'contract-negotiation'],
    highlightModuleId: 'contract-review',
    tags: ['Legal', 'Contracts', 'GDPR'],
  },
  {
    id: 'hr-people-ops',
    name: 'HR & People Ops',
    description: 'End-to-end HR toolkit: job descriptions, interview frameworks, performance reviews, HR policy creation, and L&D planning.',
    targetUser: 'HR manager / People ops',
    icon: 'Users',
    color: 'adv-green',
    moduleIds: ['job-description', 'interview-framework', 'performance-review', 'hr-policy', 'ld-planning'],
    highlightModuleId: 'job-description',
    tags: ['HR', 'Hiring', 'Performance'],
  },
  {
    id: 'consultant-toolkit',
    name: 'Consultant Toolkit',
    description: 'Core toolkit for management consultants: engagement proposals, client presentations, gap analyses, action plans, and stakeholder reporting.',
    targetUser: 'Management consultant',
    icon: 'Briefcase',
    color: 'adv-teal',
    moduleIds: ['gap-analysis', 'document-creation', 'risk-assessment', 'regulatory-monitor'],
    highlightModuleId: 'gap-analysis',
    tags: ['Consulting', 'Strategy', 'Advisory'],
  },
];
