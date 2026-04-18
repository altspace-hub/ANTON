// Patch for Hardware Engineering area — Phase 3 modules from
// server/areas/hardware-engineering/modules/.
// Tier 5 of the Coding area; 60-80 engineer-week build per spec v4.
// Phase 3 ships 10 of the planned ~30 modules. The remainder land in
// Phases 4-9 per docs/HARDWARE_BUILD_ROADMAP.md.

import type { ModuleDefinition } from '../types';

export const HARDWARE_MODULES: ModuleDefinition[] = [
  {
    id: 'hw-classifier',
    label: 'Phase 0 Hardware Classifier',
    shortLabel: 'Classify',
    icon: 'Compass',
    description: 'Mandatory entry point for any hardware build. Captures hardware family, path (Diagnose/Maintain/Develop), tier (1 Personal / 2 Professional / 3 Market), and deployment context. Gates every downstream hardware module.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Hardware family registry, regulatory tier criteria (CRA, RED, MDR), path semantics' },
      },
    },
  },
  {
    id: 'hw-diagnose-symptom-walkthrough',
    label: 'Diagnose — Symptom Walkthrough',
    shortLabel: 'Diagnose',
    icon: 'Stethoscope',
    description: 'Conversational symptom-driven diagnosis using the diagnostic case layer. Produces a Reasoning Trail, root cause, remediation plan, and offers community contribution on resolution.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'ESP32 community knowledge, Espressif advisories, diagnostic case patterns' },
      },
    },
  },
  {
    id: 'hw-diagnose-photo-id',
    label: 'Diagnose — Photo-Based Module Identification',
    shortLabel: 'Photo ID',
    icon: 'Camera',
    description: 'Identifies the actual hardware module from photos, including counterfeit detection. Compares markings, package, antenna style, and shielding finish against the HKP reference set.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Module markings, FCC IDs, vendor logos, counterfeit indicator patterns' },
      },
    },
  },
  {
    id: 'hw-diagnose-runtime-trace',
    label: 'Diagnose — Runtime Trace Analyzer',
    shortLabel: 'Trace Analyzer',
    icon: 'Activity',
    description: 'Reads ESP-IDF panic backtraces, Guru Meditation Errors, exception causes, and serial logs. Maps stack pointers to functions when symbols available; otherwise reasons from offsets and pattern-matches against known crash signatures.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'ESP-IDF panic format, Xtensa register conventions, common crash patterns' },
      },
    },
  },
  {
    id: 'hw-maintain-cve-applicability',
    label: 'Maintain — CVE Applicability Assessment',
    shortLabel: 'CVE Check',
    icon: 'ShieldAlert',
    description: 'Given project BoM and active CVE feed, determines which advisories actually affect the device. Avoids false-positive avalanche by checking version ranges, configuration, and exposure surfaces.',
    color: 'adv-red',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['risk-register', 'detailed-findings', 'action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'NVD, GHSA, vendor advisories, CVSS scoring methodology' },
      },
    },
  },
  {
    id: 'hw-maintain-patch-planner',
    label: 'Maintain — Patch Plan & Rollback',
    shortLabel: 'Patch Plan',
    icon: 'GitMerge',
    description: 'Patch plan with explicit rollback for single device or fleet. Pre-patch verification, OTA/USB sequencing, per-stage acceptance test, post-patch verification, and rollback chain when patch fails.',
    color: 'adv-teal',
    defaults: {
      thinking: 'think_hard',
      creativity: 'strict',
      outputFormats: ['action-plan'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'OTA partition layout, signed updates, fleet rollout patterns' },
      },
    },
  },
  {
    id: 'hw-develop-requirements',
    label: 'Develop — Requirements & Constraints',
    shortLabel: 'Requirements',
    icon: 'ListChecks',
    description: 'First phase of the 6-phase Develop workflow. Captures intended use, deployment context, environmental envelope, regulatory tier, safety-criticality, and BoM cost target.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Hardware engineering requirement patterns, environmental classes, deployment archetypes' },
      },
    },
  },
  {
    id: 'hw-develop-architecture',
    label: 'Develop — Architecture',
    shortLabel: 'Architecture',
    icon: 'Layers',
    description: 'Translates the requirements record into hardware family + variant choice, peripheral assignments, connectivity stack, power architecture, partition layout, and firmware structure. Cites HKP claims for every load-bearing decision.',
    color: 'adv-green',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'Embedded architecture patterns, peripheral capability matrices' },
      },
    },
  },
  {
    id: 'hw-develop-pin-mapper',
    label: 'Develop — Pin Mapper & Conflict Detector',
    shortLabel: 'Pin Map',
    icon: 'Grid3x3',
    description: 'Conflict-free pin assignment for required peripheral functions. Respects flash-reserved pins, input-only pins, strapping-pin boot constraints, ADC1-vs-ADC2 Wi-Fi rules, DAC/touch/RTC-GPIO requirements.',
    color: 'adv-blue',
    defaults: {
      thinking: 'think',
      creativity: 'strict',
      outputFormats: ['detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: false, description: 'ESP32 GPIO matrix, peripheral routing, pin capabilities' },
      },
    },
  },
  {
    id: 'hw-humanitarian-deployment-planner',
    label: 'Humanitarian Deployment Planner',
    shortLabel: 'Humanitarian Kit',
    icon: 'Globe',
    description: 'Cross-cutting planner for humanitarian / low-infrastructure deployments. Wraps an architecture in regional sourcing, capacity-transfer artefacts, offline-first telemetry, sustainable spares, and named local partner ownership.',
    color: 'adv-gold',
    defaults: {
      thinking: 'think_hard',
      creativity: 'balanced',
      outputFormats: ['action-plan', 'detailed-findings'],
      knowledgeSources: {
        claudeKnowledge: { enabled: true, webSearchEnabled: true, description: 'Humanitarian tech deployment patterns, capacity transfer, regional sourcing, OCHA cluster coordination' },
      },
    },
  },
];
