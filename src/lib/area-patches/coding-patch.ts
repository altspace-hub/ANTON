// Patch for Coding area — 7 modules from server/areas/coding/modules/
// Matches module IDs registered in AREAS constant for the 'coding' area.
// Generated: 2026-02-23

import type { ModuleDefinition } from '../types';

export const CODING_MODULES: ModuleDefinition[] = [
  {
    id: 'code-review-explain',
    label: 'Code Review & Explain',
    shortLabel: 'Code Review',
    icon: 'GitBranch',
    description:
      'Review code through multiple expert lenses: security, compliance, architecture, product alignment. Supports diff-aware re-review and dependency auditing.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Code quality standards, OWASP security guidelines, architecture best practices',
        },
      },
    },
  },
  {
    id: 'script-lite',
    label: 'Script Lite',
    shortLabel: 'Script Lite',
    icon: 'FileCode',
    description:
      'Generate single Python scripts from natural language descriptions with guided questioning and sandbox preview.',
    color: 'adv-green',
    defaults: {
      thinking: 'think',
      creativity: 'balanced',
      outputFormats: [],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Python scripting best practices, pandas/numpy, data analysis patterns',
        },
      },
    },
  },
  {
    id: 'script-medium',
    label: 'App Builder',
    shortLabel: 'App Builder',
    icon: 'AppWindow',
    description:
      'Generate complete applications (React, HTML/CSS/JS, Python CLI, Node.js API) with live preview and iterative refinement.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: [],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'React, Node.js, Python, HTML/CSS/JS best practices and patterns',
        },
      },
    },
  },
  {
    id: 'coding-large-discovery',
    label: 'Project Discovery',
    shortLabel: 'Discovery',
    icon: 'Compass',
    description:
      'Phase 1 of professional AI-led development: multi-turn requirements gathering, stakeholder analysis, constraint identification, and discovery document generation.',
    color: 'adv-gold',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'Software requirements engineering, project discovery frameworks, stakeholder analysis',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'coding-large-architecture',
    label: 'Architecture Design',
    shortLabel: 'Architecture',
    icon: 'Layers',
    description:
      'Phase 2 of professional AI-led development: architecture proposal with expert panel review from security, compliance, and product perspectives.',
    color: 'adv-gold',
    defaults: {
      thinking: 'investigate',
      creativity: 'balanced',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: true,
          description: 'Software architecture patterns, cloud platforms, security design, scalability',
        },
      },
    },
  },
  {
    id: 'coding-large-implementation',
    label: 'Implementation',
    shortLabel: 'Implementation',
    icon: 'Hammer',
    description:
      'Phase 3 of professional AI-led development: task-by-task code implementation with plan → approve → execute → record workflow.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: [],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: '',
        },
        localFolder: { enabled: true, folderPaths: [], recursive: true },
      },
    },
  },
  {
    id: 'goal-alignment-check',
    label: 'Goal Alignment Check',
    shortLabel: 'Alignment',
    icon: 'Target',
    description:
      'Verify that current implementation progress aligns with the original discovery commitments, surface technical debt, and flag scope drift.',
    color: 'adv-gold',
    defaults: {
      thinking: 'investigate',
      creativity: 'strict',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: {
          enabled: true,
          webSearchEnabled: false,
          description: 'Software quality metrics, technical debt assessment, scope management',
        },
      },
    },
  },
];
