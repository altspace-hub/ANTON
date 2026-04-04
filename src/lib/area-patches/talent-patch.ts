/**
 * talent-patch.ts
 * Module definitions for the Talent Discovery & Recruitment module.
 * Adds discovery-driven hiring with EU AI Act + Pay Transparency compliance.
 */

import type { ModuleDefinition } from '../types';

export const TALENT_MODULES: ModuleDefinition[] = [
  {
    id: 'talent-discovery',
    label: 'Talent Discovery',
    shortLabel: 'Discovery',
    icon: 'Search',
    description: 'Guided team discovery session to map capabilities, identify gaps, and define what a hire actually needs — before writing any job ad. Produces a structured capability map and three hiring directions (Mirror, Complement, Future-Proof).',
    color: 'adv-blue',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['executive-summary', 'detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Organisational design, team dynamics, capability mapping frameworks',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'talent-ad-generator',
    label: 'Job Ad Generator',
    shortLabel: 'Ad Generator',
    icon: 'FileText',
    description: 'Generate compelling, honest job advertisements from Discovery findings. Three variants (Mirror, Complement, Future-Proof) with published Assessment Framework, EU Pay Transparency compliance, and targeted candidate questions.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'Recruitment marketing, EU Pay Transparency Directive, EU AI Act requirements',
        },
      },
    },
  },
  {
    id: 'talent-assessment',
    label: 'Candidate Assessment',
    shortLabel: 'Assessment',
    icon: 'ClipboardCheck',
    description: 'Dual-model candidate assessment against published scoring framework. Primary assessment with full reasoning trace, bias audit, wild card detection, and EU AI Act Art. 12 logging. Every score is explainable.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['gap-scoring-matrix', 'detailed-findings', 'executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Assessment methodology, competency frameworks, bias detection, EU AI Act compliance',
        },
      },
    },
  },
  {
    id: 'talent-aspiration',
    label: 'Career Aspiration Profile',
    shortLabel: 'Aspirations',
    icon: 'Compass',
    description: 'Private career aspiration conversation. Explore what drives you, where you want to grow, and what kind of work energises you. Your profile is private — your manager cannot see it. Used for internal opportunity matching.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: ['executive-summary'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Career development, skill mapping, internal mobility frameworks',
        },
      },
    },
  },
];
