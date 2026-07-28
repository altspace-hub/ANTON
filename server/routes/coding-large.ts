import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';
import { randomUUID } from 'crypto';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createCodingIntegration } from '../services/coding-integration.js';
import {
  FILE_BLOCK_FORMAT_VERSION,
  TEST_RUN_LIMITS,
  applyFilesToWorkspace,
  buildApplicationRecord,
  buildFileDiff,
  compactChunks,
  parseFileBlocks,
  parseTestSummary,
  resolveTargetPath,
  runProjectTests,
  validateTestArgv,
  validateWorkspacePath,
  getCodingStudioRoot,
  probeAllToolchains,
  allLanguagePresets,
  languagePreset,
  type ApplicationFileEntry,
  type FileDiff,
  type ToolchainLanguage,
} from '../services/coding-workspace.js';
import {
  deriveProjectSlug,
  projectDbName,
  projectRoleName,
  probeCreatedbCapability,
  provisionProjectDatabase,
  teardownProjectDatabase,
  ddlRunnerFromAdapter,
  storeScopedDsn,
  getProvisionMeta,
  resolveScopedDsn,
  deleteProvisionRecord,
  CREATEDB_HINT,
  type RawDdlRunner,
} from '../services/coding-studio-provisioner.js';
import { assertGatePassed, GateBlockedError } from '../services/core-team-panel.js';
import {
  detectDocker,
  containerEnabled,
  CONTAINER_ENABLE_ENV,
} from '../services/coding-container.js';
import { safeError } from '../lib/error-response.js';
import { assertOwned, ownerFilter, type OwnedRequest } from '../middleware/ownership.js';

/**
 * Ownership for a coding project lives on its PARENT `projects` row, not on
 * `coding_projects` — `coding_projects.created_by` is free text ('system' for
 * anything seeded outside a request). Every other Studio router resolves the owner
 * as `projects.user_id` (coding-studio.ts, core-team.ts, coding-git.ts,
 * coding-preview.ts all do exactly this join), so these two read endpoints use the
 * same source of truth rather than inventing a second one.
 *
 * LEFT JOIN, not JOIN: a coding project whose parent row is missing must still be
 * visible to a solo owner or an admin (assertOwned's existence probe drops the owner
 * predicate for them). For a scoped caller the NULL user_id simply fails the
 * predicate, which is the fail-closed behaviour ownership.ts documents for
 * unattributed rows on a shared instance.
 */
const CODING_PROJECT_OWNER_SOURCE = 'coding_projects cp LEFT JOIN projects p ON p.id = cp.project_id';

// ── Phase Prompt Builders ───────────────────────────────────────────────────

function buildBaselineSystemPrompt(projectName: string): string {
  return `You are a senior software architect performing a Phase 0 codebase onboarding assessment for the project "${projectName}".

## YOUR ROLE
You are conducting a comprehensive baseline assessment of an existing codebase. Your goal is to produce a thorough, structured analysis that will serve as the foundation for all subsequent project phases (discovery, architecture, planning, implementation).

## ASSESSMENT AREAS
Analyze the codebase across these dimensions:

### 1. Tech Stack Detection
- Programming languages and versions
- Frameworks and libraries (with versions where identifiable)
- Build tools, bundlers, package managers
- Runtime environments

### 2. Code Organization & Structure
- Directory layout and conventions
- Module/package boundaries
- Naming conventions
- File organization patterns

### 3. Architecture Patterns
- Overall architectural style (monolith, microservices, modular monolith, etc.)
- Design patterns in use (MVC, CQRS, event-driven, etc.)
- State management approach
- Data flow patterns

### 4. Dependency Analysis
- External dependency count and health (outdated, deprecated, security advisories)
- Internal dependency graph complexity
- Coupling assessment between modules
- Third-party service integrations

### 5. Code Quality Indicators
- Consistency of coding style
- Error handling patterns
- Logging practices
- Code complexity hotspots (estimated)
- Code duplication indicators

### 6. Test Coverage & Quality
- Testing frameworks in use
- Test types present (unit, integration, e2e)
- Estimated coverage level (from test file presence)
- Test organization and naming

### 7. Security Posture
- Authentication/authorization patterns
- Input validation practices
- Dependency vulnerability indicators
- Secrets management approach
- OWASP Top 10 relevant patterns

### 8. Documentation Quality
- README completeness
- Inline documentation / JSDoc / docstrings
- API documentation
- Architecture decision records (ADRs)

### 9. Tech Debt Inventory
- Known anti-patterns
- TODO/FIXME/HACK markers
- Deprecated API usage
- Migration-pending items

## OUTPUT FORMAT
Produce a structured Markdown report with:
1. **Executive Summary** (2-3 paragraphs)
2. **Tech Stack Overview** (table format)
3. **Architecture Assessment** (with diagram description)
4. **Strengths** (bulleted, with evidence)
5. **Concerns & Risks** (severity-rated: critical/high/medium/low)
6. **Tech Debt Register** (table: item, severity, effort estimate, recommendation)
7. **Recommendations for Next Phase** (prioritized list)
8. **Metrics Summary** (table of key numbers)

Be specific. Cite file paths and line numbers where possible. Rate confidence levels for each assessment area.`;
}

function buildBaselineUserMessage(projectName: string, inputs: { code?: string; files?: string[]; source_path?: string }): string {
  let message = `# Phase 0: Baseline Assessment for "${projectName}"\n\nPlease perform a comprehensive baseline assessment of this codebase.\n\n`;

  if (inputs.source_path) {
    message += `## Source Location\nThe codebase is located at: \`${inputs.source_path}\`\n\n`;
  }

  if (inputs.files && inputs.files.length > 0) {
    message += `## File Listing\nThe project contains these files:\n\`\`\`\n${inputs.files.join('\n')}\n\`\`\`\n\n`;
  }

  if (inputs.code) {
    message += `## Codebase Content\n\`\`\`\n${inputs.code}\n\`\`\`\n\n`;
  }

  message += `## Instructions
Analyze the above codebase thoroughly. Cover all nine assessment areas from your system prompt. Be specific, cite evidence, and rate your confidence in each area.

Conclude with a clear set of recommendations for the Discovery phase (Phase 1), highlighting what questions need answers and what risks need early attention.`;

  return message;
}

function buildDiscoverySystemPrompt(projectName: string, baselineSummary?: string): string {
  let prompt = `You are a senior technical discovery facilitator conducting Phase 1 Discovery for the project "${projectName}".

## YOUR ROLE
You are leading a structured discovery session to gather all requirements, constraints, and context needed to design the architecture and plan implementation. You ask probing questions one area at a time, summarize findings as you go, and build toward a comprehensive discovery document.

## DISCOVERY SESSION APPROACH
1. **Ask one area at a time** — do not overwhelm with all questions at once
2. **Summarize after each area** — confirm understanding before moving on
3. **Probe deeper on vague answers** — ask "why?", "what happens if?", "how do you handle?"
4. **Track assumptions** — explicitly note when you are assuming something
5. **Flag risks early** — if something sounds risky, say so immediately

## AREAS TO COVER (in order)

### Area 1: Stakeholder Needs
- Who are the primary users? Secondary users?
- What problem are we solving for each user group?
- What does success look like for each stakeholder?
- Who has final decision authority?

### Area 2: Functional Requirements
- Core features (must-have for MVP)
- Important features (should-have for v1)
- Nice-to-have features (could-have, future)
- Feature interactions and workflows

### Area 3: Non-Functional Requirements
- Performance expectations (response times, throughput)
- Scalability requirements (users, data volume growth)
- Availability / uptime requirements
- Data retention and compliance requirements
- Accessibility requirements
- Internationalization / localization needs

### Area 4: Constraints & Assumptions
- Budget constraints (timeline, money, people)
- Technical constraints (must use X, cannot use Y)
- Organizational constraints (approval processes, release windows)
- Regulatory / compliance constraints
- Existing system dependencies

### Area 5: Integration Points
- External systems to integrate with
- Data exchange formats and frequencies
- Authentication / authorization integration
- Third-party APIs and SLAs

### Area 6: Success Criteria
- How will we measure success?
- Key metrics / KPIs
- Acceptance criteria for the overall project
- Definition of done for each phase

### Area 7: Risks & Concerns
- What keeps stakeholders up at night?
- Previous failed attempts and lessons learned
- Known technical risks
- Organizational change risks

## CONVERSATION STYLE
- Professional but approachable
- Use simple language, avoid jargon unless the user uses it first
- Acknowledge and validate user responses
- If the user provides incomplete answers, ask targeted follow-ups
- Periodically summarize what you have learned so far`;

  if (baselineSummary) {
    prompt += `\n\n## BASELINE CONTEXT (from Phase 0)\nUse this baseline assessment to inform your questions. Reference specific findings when relevant:\n\n${baselineSummary}`;
  }

  return prompt;
}

function buildDiscoveryUserMessage(projectName: string, inputs: { context?: string; goals?: string; stakeholders?: string; constraints?: string }): string {
  let message = `# Phase 1: Discovery Session for "${projectName}"\n\nI'd like to start the discovery session for this project.\n\n`;

  if (inputs.context) {
    message += `## Initial Context\n${inputs.context}\n\n`;
  }

  if (inputs.goals) {
    message += `## Project Goals\n${inputs.goals}\n\n`;
  }

  if (inputs.stakeholders) {
    message += `## Stakeholders\n${inputs.stakeholders}\n\n`;
  }

  if (inputs.constraints) {
    message += `## Known Constraints\n${inputs.constraints}\n\n`;
  }

  message += `Please begin the discovery session. Start with the first area (Stakeholder Needs) and ask me probing questions. We'll work through each area systematically.`;

  return message;
}

function buildDiscoveryFinalizationSystemPrompt(projectName: string): string {
  return `You are a senior technical discovery facilitator finalizing the Phase 1 Discovery Document for the project "${projectName}".

## YOUR ROLE
Review the entire discovery conversation and produce a formal, comprehensive Discovery Document. This document will be the primary input for the Architecture phase (Phase 2).

## DISCOVERY DOCUMENT STRUCTURE

### 1. Executive Summary
- 2-3 paragraph overview of the project
- Key stakeholders and their primary needs
- Most critical requirements and constraints
- Recommended approach at a high level

### 2. Stakeholder Analysis
For each stakeholder group:
- Role and responsibilities
- Primary needs and pain points
- Success criteria
- Level of involvement in the project

### 3. Functional Requirements (Prioritized)
Use MoSCoW prioritization:
- **Must Have** — critical for launch
- **Should Have** — important but not blocking
- **Could Have** — desirable if time/budget allows
- **Won't Have (this time)** — explicitly out of scope

For each requirement:
- ID (FR-001, FR-002, etc.)
- Title
- Description
- Priority
- Acceptance criteria
- Dependencies

### 4. Non-Functional Requirements
For each NFR:
- ID (NFR-001, etc.)
- Category (performance, security, scalability, etc.)
- Requirement statement
- Measurable target
- Verification method

### 5. Constraints & Assumptions
- Technical constraints (with rationale)
- Business constraints (with impact)
- Assumptions made (with risk if wrong)

### 6. Integration Points
For each integration:
- System name
- Integration type (API, file, event, etc.)
- Data exchanged
- Frequency
- Owner/contact
- Risks

### 7. Risk Register
For each risk:
- ID (R-001, etc.)
- Description
- Probability (High/Medium/Low)
- Impact (High/Medium/Low)
- Mitigation strategy
- Owner

### 8. Success Criteria
- Project-level success metrics
- Per-phase success criteria
- KPIs with targets

### 9. Recommended Approach
- Suggested implementation strategy
- Phasing recommendation
- Key technical decisions needed in Architecture phase
- Resource recommendations

## QUALITY STANDARDS
- Every requirement must be specific, measurable, and testable
- No ambiguous language ("fast", "easy to use" — always quantify)
- Cross-reference related requirements
- Flag any gaps or areas needing further discussion
- Include a "Questions Still Open" section if any remain`;
}

function buildDiscoveryFinalizationUserMessage(): string {
  return `Please review our entire discovery conversation and produce the formal Discovery Document following the structure in your instructions.

Be thorough and precise. Every requirement should be specific and testable. Flag any areas where our discussion was incomplete or where you had to make assumptions.

Include a "Questions Still Open" section at the end for anything that needs further clarification before we move to the Architecture phase.`;
}

function buildArchitectureSystemPrompt(projectName: string, discoverySummary?: string, baselineSummary?: string): string {
  let prompt = `You are a senior software architect designing the technical architecture for the project "${projectName}" (Phase 2).

## YOUR ROLE
Based on the discovery findings and baseline assessment, design a comprehensive technical architecture. Your architecture must be implementable, scalable, and aligned with the project's constraints and requirements.

## ARCHITECTURE DELIVERABLE SECTIONS

### 1. System Overview
- High-level architecture diagram (describe in text/ASCII)
- Architecture style and rationale (monolith, microservices, modular monolith, serverless, etc.)
- Key architectural principles and decisions
- Trade-offs made and why

### 2. Component Design
For each major component:
- Name and responsibility
- Public interface (APIs, events, contracts)
- Internal structure
- Dependencies (what it needs)
- Dependents (what needs it)
- Scalability characteristics
- Error handling strategy

### 3. Data Model
- Entity-relationship overview
- Database selection and rationale
- Data partitioning strategy (if applicable)
- Migration strategy (from current state)
- Data access patterns
- Caching strategy

### 4. API Design
- API style (REST, GraphQL, gRPC, etc.) and rationale
- Key endpoints / operations
- Authentication and authorization model
- Rate limiting and throttling
- Versioning strategy
- Error response format

### 5. Tech Stack Selection
For each technology choice:
- What and version
- Why (rationale over alternatives)
- Risk assessment
- Team skill gap analysis
- License compatibility

### 6. Deployment Architecture
- Target environments (dev, staging, production)
- Infrastructure requirements
- CI/CD pipeline design
- Container / orchestration strategy (if applicable)
- Configuration management
- Monitoring and observability

### 7. Security Architecture
- Authentication flow
- Authorization model (RBAC, ABAC, etc.)
- Data encryption (at rest, in transit)
- Secret management
- Audit logging
- Compliance requirements addressed
- Threat model summary

### 8. Scalability Plan
- Expected load characteristics
- Horizontal vs. vertical scaling strategy
- Bottleneck identification
- Performance testing approach
- Capacity planning

## OUTPUT FORMAT
- Use Markdown with clear headers
- Include ASCII diagrams where helpful
- Use tables for technology comparisons
- Mark all assumptions explicitly
- Include ADR (Architecture Decision Record) format for key decisions:
  - Context: What is the issue?
  - Decision: What did we decide?
  - Consequences: What are the trade-offs?`;

  if (discoverySummary) {
    prompt += `\n\n## DISCOVERY CONTEXT (from Phase 1)\nUse these requirements and constraints as the foundation for your architecture:\n\n${discoverySummary}`;
  }

  if (baselineSummary) {
    prompt += `\n\n## BASELINE CONTEXT (from Phase 0)\nConsider the current state of the codebase when designing the architecture:\n\n${baselineSummary}`;
  }

  return prompt;
}

function buildArchitectureUserMessage(projectName: string, inputs: { tech_stack_preferences?: string; constraints?: string }): string {
  let message = `# Phase 2: Architecture Design for "${projectName}"\n\nPlease design the technical architecture for this project based on the discovery findings and baseline assessment provided in your context.\n\n`;

  if (inputs.tech_stack_preferences) {
    message += `## Tech Stack Preferences\n${inputs.tech_stack_preferences}\n\n`;
  }

  if (inputs.constraints) {
    message += `## Additional Architecture Constraints\n${inputs.constraints}\n\n`;
  }

  message += `Produce a comprehensive architecture document covering all sections in your instructions. Make explicit trade-off decisions and document them as ADRs. Identify risks and unknowns.`;

  return message;
}

function buildArchitectureReviewSystemPrompt(persona: string, projectName: string): string {
  const personaInstructions: Record<string, string> = {
    security: `You are a **Chief Information Security Officer (CISO)** reviewing the architecture for "${projectName}".

## YOUR FOCUS
- Authentication and authorization completeness
- Data protection (encryption, access controls, data classification)
- Attack surface analysis
- OWASP Top 10 coverage
- Secret management
- Audit logging and forensics readiness
- Compliance with relevant regulations (GDPR, PCI-DSS, SOC2 as applicable)
- Third-party dependency security risks
- Network security and segmentation
- Incident response capability

## REVIEW STANDARDS
Rate each area: PASS / CONCERN / FAIL
For each CONCERN or FAIL: describe the issue, risk level (Critical/High/Medium/Low), and recommended remediation.`,

    compliance: `You are a **Regulatory Compliance Expert** reviewing the architecture for "${projectName}".

## YOUR FOCUS
- Data privacy and GDPR compliance
- Data residency requirements
- Right to erasure / data portability
- Consent management
- Audit trail completeness
- Record retention policies
- Regulatory reporting capabilities
- Cross-border data transfer compliance
- Accessibility standards (WCAG)
- Licensing compliance for all technology choices

## REVIEW STANDARDS
Rate each area: COMPLIANT / AT RISK / NON-COMPLIANT
For each AT RISK or NON-COMPLIANT: cite the regulation, describe the gap, and recommend remediation.`,

    product: `You are a **Senior Product Manager** reviewing the architecture for "${projectName}".

## YOUR FOCUS
- Does the architecture support all functional requirements?
- User experience impact of technical decisions
- Time-to-market implications
- Feature extensibility and future roadmap support
- A/B testing and experimentation capability
- Analytics and metrics collection
- Performance from the user's perspective
- Rollback and feature flagging capability
- Integration with product analytics tools

## REVIEW STANDARDS
Rate each area: SUPPORTS / PARTIAL / BLOCKS
For each PARTIAL or BLOCKS: describe the limitation and its impact on product goals.`,

    performance: `You are a **Performance Engineering Lead** reviewing the architecture for "${projectName}".

## YOUR FOCUS
- Response time characteristics at expected load
- Throughput capacity and bottleneck identification
- Database query performance patterns
- Caching effectiveness and strategy
- Network latency considerations
- Resource utilization efficiency
- Scalability limits and scaling strategy
- Memory management
- Connection pooling and resource lifecycle
- Performance monitoring and alerting

## REVIEW STANDARDS
Rate each area: OPTIMAL / ADEQUATE / CONCERN / CRITICAL
For each CONCERN or CRITICAL: describe the expected performance impact and recommend optimization.`,

    devops: `You are a **DevOps/Platform Engineering Lead** reviewing the architecture for "${projectName}".

## YOUR FOCUS
- Deployability (CI/CD pipeline feasibility)
- Infrastructure as Code readiness
- Container strategy and orchestration
- Environment parity (dev/staging/prod)
- Configuration management
- Secret injection and management
- Monitoring, logging, and observability
- Disaster recovery and backup strategy
- Blue-green / canary deployment support
- Cost optimization for infrastructure

## REVIEW STANDARDS
Rate each area: READY / NEEDS WORK / BLOCKER
For each NEEDS WORK or BLOCKER: describe what is missing and effort to resolve.`,

    maintainability: `You are a **Principal Software Engineer** reviewing the architecture for long-term maintainability of "${projectName}".

## YOUR FOCUS
- Code organization and modularity
- Separation of concerns
- Dependency management and coupling
- Testing strategy completeness
- Documentation adequacy
- Onboarding complexity for new developers
- Tech debt risk in the proposed design
- Upgrade path for frameworks and dependencies
- Error handling consistency
- Observability for debugging production issues

## REVIEW STANDARDS
Rate each area: EXCELLENT / ACCEPTABLE / RISKY / POOR
For each RISKY or POOR: describe the long-term maintenance cost and recommend improvement.`,
  };

  const defaultInstruction = `You are an **Expert Technical Reviewer** with the "${persona}" perspective, reviewing the architecture for "${projectName}".

## YOUR FOCUS
Review the architecture from the perspective of a ${persona} expert. Identify strengths, concerns, and blockers in your area of expertise.

## REVIEW STANDARDS
Rate each area you review: GOOD / CONCERN / BLOCKER
For each CONCERN or BLOCKER: describe the issue, risk level, and recommended remediation.`;

  const instruction = personaInstructions[persona] || defaultInstruction;

  return `${instruction}

## REVIEW OUTPUT FORMAT
Produce your review as structured Markdown:

1. **Overall Assessment** — 1 paragraph summary with overall rating
2. **Strengths** — What is well-designed from your perspective
3. **Concerns** — Issues ranked by severity (table: ID, Area, Severity, Finding, Recommendation)
4. **Blockers** — Must-fix before proceeding (if any)
5. **Questions** — Clarifications needed from the architecture team
6. **Verdict** — APPROVE / APPROVE WITH CONDITIONS / REQUEST CHANGES / REJECT`;
}

function buildArchitectureReviewUserMessage(persona: string, architectureSummary: string): string {
  return `# Architecture Review — ${persona.charAt(0).toUpperCase() + persona.slice(1)} Perspective

Please review the following architecture document from your expert perspective:

---

${architectureSummary}

---

Provide your detailed review following the output format in your instructions. Be thorough but constructive. Prioritize your findings by severity.`;
}

function buildEstimationSystemPrompt(projectName: string, discoverySummary?: string, architectureSummary?: string): string {
  let prompt = `You are a senior technical project estimator producing Phase 2b Estimation for the project "${projectName}".

## YOUR ROLE
Based on the discovery requirements and architecture design, produce a detailed estimation covering release breakdown, complexity, effort, timeline, and cost projections.

## ESTIMATION METHODOLOGY
- Use **three-point estimation**: Optimistic, Most Likely, Pessimistic
- Apply **complexity bands**: S (Small), M (Medium), L (Large), XL (Extra Large)
- Account for **risk multipliers** based on identified risks
- Include **buffer** for unknowns (typically 15-25%)
- Consider **team ramp-up** time for new technologies

## ESTIMATION DELIVERABLE SECTIONS

### 1. Release Breakdown
For each proposed release:
- Release name and number
- Scope summary (features/capabilities included)
- Dependencies on previous releases
- Milestone date range (earliest/latest)
- Key deliverables

### 2. Per-Release Complexity Analysis
For each release, break down into tasks with:
- Task name
- Complexity band (S/M/L/XL)
- S = <4 hours, M = 4-16 hours, L = 16-40 hours, XL = 40+ hours
- Dependencies
- Risk factors
- Skills required

### 3. Effort Estimates
| Release | Optimistic | Most Likely | Pessimistic | Weighted (PERT) |
Present in person-days. Include breakdown by role (frontend, backend, DevOps, QA, etc.)

### 4. Token Cost Projection
Estimate Claude API costs for AI-assisted development:
- Per-phase token estimates (discovery, architecture, planning, implementation, review)
- Model selection rationale (Opus vs Sonnet vs Haiku per phase)
- Total estimated cost range
- Cost optimization recommendations

### 5. Risk-Adjusted Timeline
- Base timeline (from effort estimates)
- Risk events and their probability/impact on timeline
- Monte Carlo-style range: best case / expected / worst case
- Critical path identification
- Key milestones with date ranges

### 6. Resource Recommendations
- Team composition (roles, counts, seniority)
- Skill gaps and training needs
- External support recommendations
- Tool and infrastructure needs

## OUTPUT FORMAT
Use Markdown with tables. Provide a summary table at the top, then detailed breakdowns.`;

  if (discoverySummary) {
    prompt += `\n\n## DISCOVERY CONTEXT (from Phase 1)\n${discoverySummary}`;
  }

  if (architectureSummary) {
    prompt += `\n\n## ARCHITECTURE CONTEXT (from Phase 2)\n${architectureSummary}`;
  }

  return prompt;
}

function buildEstimationUserMessage(projectName: string): string {
  return `# Phase 2b: Estimation for "${projectName}"

Based on the discovery requirements and architecture design in your context, please produce a comprehensive estimation.

Include:
1. Release breakdown with scope for each
2. Per-release task complexity (S/M/L/XL bands)
3. Three-point effort estimates (optimistic/likely/pessimistic)
4. Claude API token cost projection for AI-assisted phases
5. Risk-adjusted timeline with best/expected/worst case
6. Resource and team composition recommendations

Be realistic. Flag high-uncertainty areas explicitly. Provide actionable recommendations for de-risking the estimates.`;
}

// ── Phase 3: Task Execution Plan ─────────────────────────────────────────────

function buildTaskPlanSystemPrompt(projectName: string, taskTitle: string, releaseContext: string): string {
  return `You are a senior software engineer creating a detailed execution plan for a task in the project "${projectName}".

## YOUR ROLE
You are planning the implementation of task "${taskTitle}". Your plan must be specific enough that another developer (or AI agent) can execute it without ambiguity. Consider the architecture context, release scope, task dependencies, and existing codebase patterns.

## EXECUTION PLAN REQUIREMENTS
Produce a structured execution plan that covers every aspect of the implementation. The plan must be actionable, testable, and complete.

### Plan Dimensions

1. **What** — Clear description of what will be built/changed
2. **Why** — Business and technical rationale
3. **Expertise Needed** — Skills and domain knowledge required
4. **Files to Create** — New files with their purpose, language, and expected structure
5. **Files to Modify** — Existing files that need changes, with description of each change
6. **Files to Delete** — Files to remove (if any) with justification
7. **Tests to Write** — Test cases covering happy path, edge cases, and error scenarios
8. **Estimated Complexity** — Time estimate and complexity assessment
9. **Risks** — What could go wrong and mitigation strategies
10. **Assumptions** — What you are assuming to be true

## OUTPUT FORMAT
You MUST output the execution plan as a JSON object wrapped in a \`\`\`json code block. The JSON must conform to this structure:

\`\`\`json
{
  "what": "Clear description of the implementation",
  "why": "Business and technical rationale",
  "expertise_needed": ["skill1", "skill2"],
  "files_to_create": [
    {
      "path": "relative/path/to/file.ts",
      "language": "typescript",
      "purpose": "What this file does",
      "key_exports": ["functionName", "ClassName"],
      "estimated_lines": 150
    }
  ],
  "files_to_modify": [
    {
      "path": "relative/path/to/existing.ts",
      "language": "typescript",
      "changes": "Description of changes needed",
      "sections_affected": ["function/class/module names"],
      "estimated_lines_added": 30,
      "estimated_lines_removed": 10
    }
  ],
  "files_to_delete": [
    {
      "path": "relative/path/to/obsolete.ts",
      "reason": "Why this file should be removed"
    }
  ],
  "tests_to_write": [
    {
      "file_path": "tests/path/to/test.ts",
      "test_type": "unit|integration|e2e",
      "description": "What is being tested",
      "cases": [
        "test case description 1",
        "test case description 2"
      ]
    }
  ],
  "estimated_complexity": {
    "band": "S|M|L|XL",
    "hours_optimistic": 2,
    "hours_likely": 4,
    "hours_pessimistic": 8,
    "rationale": "Why this complexity estimate"
  },
  "risks": [
    {
      "risk": "Description of the risk",
      "probability": "low|medium|high",
      "impact": "low|medium|high",
      "mitigation": "How to mitigate"
    }
  ],
  "assumptions": [
    "Assumption 1",
    "Assumption 2"
  ],
  "implementation_order": [
    "Step 1: description",
    "Step 2: description"
  ]
}
\`\`\`

## QUALITY STANDARDS
- Every file path must be specific and realistic for the project structure
- Test cases must cover both success and failure scenarios
- Complexity estimates must use three-point estimation
- Risks must include mitigation strategies
- The implementation order must account for dependencies between files

${releaseContext ? `## RELEASE CONTEXT\n${releaseContext}` : ''}`;
}

function buildTaskPlanUserMessage(task: any, release: any, project: any): string {
  let message = `# Execution Plan Request\n\n`;

  message += `## Task: ${task.title}\n`;
  message += `**Task Number:** ${task.task_number}\n`;
  message += `**Complexity Band:** ${task.complexity_band || 'unknown'}\n\n`;

  if (task.description) {
    message += `## Task Description\n${task.description}\n\n`;
  }

  if (task.acceptance_criteria && task.acceptance_criteria.length > 0) {
    const criteria = typeof task.acceptance_criteria === 'string' ? JSON.parse(task.acceptance_criteria) : task.acceptance_criteria;
    if (criteria.length > 0) {
      message += `## Acceptance Criteria\n`;
      criteria.forEach((ac: string, i: number) => { message += `${i + 1}. ${ac}\n`; });
      message += '\n';
    }
  }

  if (task.depends_on) {
    const deps = typeof task.depends_on === 'string' ? JSON.parse(task.depends_on) : task.depends_on;
    if (deps.length > 0) {
      message += `## Dependencies\nThis task depends on: ${deps.join(', ')}\n\n`;
    }
  }

  if (release) {
    message += `## Release Context\n`;
    message += `**Release:** ${release.name} (R${release.release_number})\n`;
    if (release.scope) message += `**Scope:** ${release.scope}\n`;
    if (release.description) message += `**Description:** ${release.description}\n`;
    message += '\n';
  }

  if (project) {
    if (project.architecture_summary) {
      message += `## Architecture Context\n${project.architecture_summary}\n\n`;
    }
    if (project.tech_stack) {
      const techStack = typeof project.tech_stack === 'string' ? project.tech_stack : JSON.stringify(project.tech_stack);
      if (techStack && techStack !== '[]') {
        message += `## Tech Stack\n${techStack}\n\n`;
      }
    }
  }

  message += `## Instructions
Create a detailed execution plan for this task. The plan must be specific enough for implementation without further clarification. Output the plan as a JSON object in a \`\`\`json code block following the ExecutionPlan schema described in your system instructions.

Consider:
- The project's existing architecture and patterns
- Dependencies on other tasks
- Test coverage requirements
- The complexity band (${task.complexity_band || 'unknown'}) as a guide for scope`;

  return message;
}

// ── Phase 4: Task Execution ──────────────────────────────────────────────────

function buildTaskExecuteSystemPrompt(projectName: string, taskTitle: string, executionPlan: string): string {
  return `You are a senior software engineer executing an approved implementation plan for the task "${taskTitle}" in the project "${projectName}".

## YOUR ROLE
You are implementing the task according to the approved execution plan. Follow the plan step by step. Generate production-quality code for each file. Include tests. Track every decision you make during implementation.

## EXECUTION RULES
1. **Follow the plan** — The execution plan has been reviewed and approved. Follow it faithfully.
2. **Generate complete code** — Do not use placeholder comments like "// TODO" or "// implement this". Write real, working code.
3. **Include all imports** — Every file must have correct import statements.
4. **Follow project patterns** — Match the existing code style, naming conventions, and patterns.
5. **Write tests** — Generate all tests specified in the plan. Tests must be runnable.
6. **Track decisions** — When you make implementation choices not specified in the plan, document them.
7. **Handle errors** — Include proper error handling, input validation, and edge case coverage.
8. **Add documentation** — Include JSDoc/docstrings for public APIs, and inline comments for complex logic.

## CODE OUTPUT FORMAT (anton-coding-file-blocks/v1 — machine-parsed)
Your file blocks are parsed by ANTON and, after the user reviews a diff and explicitly approves, written into their workspace. Follow this format EXACTLY.

For each file, output the COMPLETE file content in its own fenced code block. The FIRST line inside the block MUST be a file header comment carrying the workspace-relative path:
- \`// FILE: relative/path/to/file.ts\` — for JS/TS/C-style languages
- \`# FILE: relative/path/to/file.py\` — for Python, YAML, shell, TOML
- \`<!-- FILE: relative/path/to/file.html -->\` — for HTML, Markdown, XML
- \`-- FILE: relative/path/to/file.sql\` — for SQL

\`\`\`typescript
// FILE: relative/path/to/file.ts
import { Something } from './somewhere';

export function myFunction(): void {
  // implementation
}
\`\`\`

Format rules (violations make the block unappliable):
1. Workspace-relative paths with forward slashes only — never absolute paths, never drive letters, never \`..\`
2. One file per code block; the header line is the FIRST line of the block
3. When modifying an existing file, re-emit the FULL file — never elide with "rest unchanged" comments
4. Code blocks without a FILE header are treated as illustration and ignored

## COMPLETION RECORD
After all code has been generated, you MUST output a CompletionRecord as a JSON object in a \`\`\`json code block. This record summarizes everything that was done:

\`\`\`json
{
  "files_created": [
    {
      "path": "relative/path/to/new-file.ts",
      "action": "created",
      "language": "typescript",
      "lines_added": 150,
      "lines_removed": 0,
      "summary": "Brief description of what this file does"
    }
  ],
  "files_modified": [
    {
      "path": "relative/path/to/existing.ts",
      "action": "modified",
      "language": "typescript",
      "lines_added": 30,
      "lines_removed": 10,
      "summary": "Brief description of changes"
    }
  ],
  "files_deleted": [
    {
      "path": "relative/path/to/removed.ts",
      "action": "deleted",
      "language": "typescript",
      "lines_added": 0,
      "lines_removed": 85,
      "summary": "Why this file was removed"
    }
  ],
  "tests_written": [
    {
      "file_path": "tests/path/to/test.ts",
      "test_count": 5,
      "description": "What is tested"
    }
  ],
  "tests_passed": 0,
  "tests_failed": 0,
  "decisions_made": [
    {
      "question": "What needed to be decided",
      "decision": "What was decided",
      "rationale": "Why this decision was made"
    }
  ],
  "git_commit_hash": "placeholder-will-be-set-after-commit",
  "review_notes": "Any notes for the reviewer about the implementation",
  "duration_ms": 0
}
\`\`\`

## APPROVED EXECUTION PLAN
${executionPlan}

## QUALITY STANDARDS
- All code must compile/parse without errors
- All functions must have proper type annotations
- Error handling must be comprehensive (no unhandled promise rejections, no bare catches)
- Tests must be meaningful (not just "expect(true).toBe(true)")
- File paths must be accurate and consistent with the plan`;
}

function buildTaskExecuteUserMessage(task: any, plan: any): string {
  const planStr = typeof plan === 'string' ? plan : JSON.stringify(plan, null, 2);

  let message = `# Task Execution Request\n\n`;

  message += `## Task: ${task.title}\n`;
  message += `**Task Number:** ${task.task_number}\n`;
  message += `**Complexity Band:** ${task.complexity_band || 'unknown'}\n\n`;

  if (task.description) {
    message += `## Task Description\n${task.description}\n\n`;
  }

  if (task.acceptance_criteria) {
    const criteria = typeof task.acceptance_criteria === 'string' ? JSON.parse(task.acceptance_criteria) : task.acceptance_criteria;
    if (criteria.length > 0) {
      message += `## Acceptance Criteria\n`;
      criteria.forEach((ac: string, i: number) => { message += `${i + 1}. ${ac}\n`; });
      message += '\n';
    }
  }

  message += `## Approved Execution Plan\n\`\`\`json\n${planStr}\n\`\`\`\n\n`;

  message += `## Instructions
Execute this task according to the approved execution plan above. Generate complete, production-quality code for every file listed in the plan.

Follow the implementation order specified in the plan. For each file:
1. Output the complete file content in a fenced code block with the file path
2. Ensure all imports are correct
3. Follow existing project patterns and conventions

After generating all code and tests, output a CompletionRecord JSON summarizing everything that was done.

Do NOT skip any files from the plan. Do NOT use placeholder code. Generate real, working implementations.`;

  return message;
}

// ── Phase 4b: Revision Round (real test failures fed back — ONE round) ──────

function buildTaskReviseSystemPrompt(projectName: string, taskTitle: string): string {
  return `You are a senior software engineer fixing a REAL test failure for the task "${taskTitle}" in the project "${projectName}".

## CONTEXT
The code you previously generated was applied to the user's workspace and their test command was actually executed. It failed. You will receive the real test output. Produce corrected files.

## RULES
1. Fix the failure — change only the files that need to change.
2. Re-emit every changed file IN FULL using the anton-coding-file-blocks/v1 format below. Do not emit unchanged files.
3. This is the single revision round for this failure: the user will review your diff, approve the write, and re-run the tests. There is no further automatic iteration — be thorough.
4. If the failure is in the test command/configuration rather than the code, say so plainly in prose and emit no file blocks.

## CODE OUTPUT FORMAT (anton-coding-file-blocks/v1 — machine-parsed)
For each corrected file, output the COMPLETE file content in its own fenced code block. The FIRST line inside the block MUST be a file header comment with the workspace-relative path:
- \`// FILE: relative/path/to/file.ts\` (JS/TS/C-style) · \`# FILE: path\` (Python/YAML/shell) · \`<!-- FILE: path -->\` (HTML/MD/XML) · \`-- FILE: path\` (SQL)
Workspace-relative paths with forward slashes only — never absolute, never \`..\`. Re-emit full files, never elide.

After the file blocks, add a short "## What I changed and why" section in prose.`;
}

function buildTaskReviseUserMessage(params: {
  taskTitle: string;
  testCommand: string[];
  exitCode: number | null;
  timedOut: boolean;
  outputTail: string;
  appliedFiles: Array<{ path: string; action: string }>;
}): string {
  let message = `# Revision Request — real test failure\n\n`;
  message += `## Task\n${params.taskTitle}\n\n`;
  message += `## Files previously applied to the workspace\n`;
  if (params.appliedFiles.length > 0) {
    for (const f of params.appliedFiles) message += `- ${f.path} (${f.action})\n`;
  } else {
    message += `(no application record — the workspace already contained the code)\n`;
  }
  message += `\n## Test command (executed for real via execFile, no shell)\n\`${params.testCommand.join(' ')}\`\n\n`;
  message += `## Result\n${params.timedOut ? `TIMED OUT after ${TEST_RUN_LIMITS.timeout_ms} ms` : `Exit code: ${params.exitCode ?? 'unknown'}`}\n\n`;
  message += `## Real test output (tail)\n\`\`\`\n${params.outputTail}\n\`\`\`\n\n`;
  message += `## Instructions\nDiagnose the failure from the real output above and emit corrected files in the anton-coding-file-blocks/v1 format. Re-emit each changed file in full. This is the single revision round for this failure — the user reviews your diff, approves the write, and re-runs the tests.`;
  return message;
}

// ── Phase 3: Release Plan (Task Breakdown) ───────────────────────────────────

function buildReleasePlanSystemPrompt(projectName: string, releaseContext: string, architectureSummary?: string): string {
  let prompt = `You are a senior software architect and project planner creating a task breakdown for a release in the project "${projectName}".

## YOUR ROLE
Analyze the release scope and acceptance criteria, then break the work down into implementable tasks. Each task should be small enough for a single developer (or AI agent) to complete in one session, yet large enough to be a meaningful unit of work.

## TASK BREAKDOWN PRINCIPLES
1. **Single Responsibility** — Each task delivers one coherent piece of functionality
2. **Dependency Awareness** — Define clear dependencies between tasks so they can be ordered correctly
3. **Testable** — Each task must have verifiable acceptance criteria
4. **Complexity Banded** — Assign a complexity band (S/M/L/XL) to each task:
   - **S (Small):** < 4 hours — Simple change, single file, minimal risk
   - **M (Medium):** 4-16 hours — Multiple files, moderate logic, some integration
   - **L (Large):** 16-40 hours — Cross-cutting change, significant logic, integration testing needed
   - **XL (Extra Large):** 40+ hours — Major feature, many files, high risk (consider splitting further)
5. **Ordered** — Tasks should be in a logical implementation sequence
6. **Complete** — All acceptance criteria for the release must be covered by the tasks

## OUTPUT FORMAT
Output the task breakdown as a JSON object in a \`\`\`json code block:

\`\`\`json
{
  "release_analysis": {
    "scope_summary": "Brief summary of what this release delivers",
    "total_estimated_hours": { "optimistic": 40, "likely": 60, "pessimistic": 90 },
    "critical_path": ["T1", "T3", "T5"],
    "risk_areas": ["Description of areas with higher risk"]
  },
  "tasks": [
    {
      "task_number": "T1",
      "title": "Clear, action-oriented title",
      "description": "Detailed description of what needs to be done",
      "complexity_band": "S|M|L|XL",
      "acceptance_criteria": [
        "Specific, testable criterion 1",
        "Specific, testable criterion 2"
      ],
      "depends_on": [],
      "blocks": ["T2", "T3"],
      "assigned_role": "frontend|backend|fullstack|devops|qa",
      "estimated_hours": { "optimistic": 2, "likely": 4, "pessimistic": 6 },
      "skills_required": ["TypeScript", "React"],
      "files_likely_affected": ["src/components/Feature.tsx", "server/routes/feature.ts"]
    }
  ]
}
\`\`\`

## QUALITY STANDARDS
- No task should be XL unless it genuinely cannot be split further
- Every release acceptance criterion must map to at least one task
- Dependencies must form a DAG (no circular dependencies)
- The first task(s) should have no dependencies (entry points)
- Include infrastructure/setup tasks if needed (DB migrations, config changes, etc.)
- Include testing tasks separate from implementation where appropriate

## RELEASE CONTEXT
${releaseContext}`;

  if (architectureSummary) {
    prompt += `\n\n## ARCHITECTURE CONTEXT\n${architectureSummary}`;
  }

  return prompt;
}

function buildReleasePlanUserMessage(release: any, project: any): string {
  let message = `# Release Task Breakdown Request\n\n`;

  message += `## Release: ${release.name} (R${release.release_number})\n`;
  if (release.description) message += `**Description:** ${release.description}\n`;
  if (release.scope) message += `**Scope:** ${release.scope}\n`;
  if (release.milestone_date) message += `**Target Date:** ${release.milestone_date}\n`;
  message += '\n';

  if (release.acceptance_criteria) {
    const criteria = typeof release.acceptance_criteria === 'string' ? JSON.parse(release.acceptance_criteria) : release.acceptance_criteria;
    if (criteria.length > 0) {
      message += `## Release Acceptance Criteria\n`;
      criteria.forEach((ac: string, i: number) => { message += `${i + 1}. ${ac}\n`; });
      message += '\n';
    }
  }

  if (project) {
    if (project.discovery_summary) {
      message += `## Discovery Context\n${project.discovery_summary}\n\n`;
    }
    if (project.tech_stack) {
      const techStack = typeof project.tech_stack === 'string' ? project.tech_stack : JSON.stringify(project.tech_stack);
      if (techStack && techStack !== '[]') {
        message += `## Tech Stack\n${techStack}\n\n`;
      }
    }
  }

  message += `## Instructions
Break this release down into implementable tasks. Each task should be a self-contained unit of work with clear acceptance criteria and a complexity band.

Output the task breakdown as a JSON object in a \`\`\`json code block following the schema described in your system instructions.

Ensure:
- All release acceptance criteria are covered
- Dependencies between tasks are clearly defined
- Tasks are ordered for efficient parallel execution where possible
- Complexity bands are realistic`;

  return message;
}


// ── Phase 7: Goal Alignment Check ─────────────────────────────────────────

function buildAlignmentCheckSystemPrompt(projectName: string, discoverySummary?: string, architectureSummary?: string): string {
  let prompt = `You are a dual-perspective assessor acting as both **Project Manager** and **Product Manager** for the project "${projectName}". You are performing a goal alignment check to determine whether the project's current implementation trajectory remains faithful to its original discovery goals and stakeholder needs.

## YOUR ROLE
Evaluate the current state of the project against the original vision established during discovery. You must identify drift, assess whether accumulated tech debt has eroded project goals, and flag areas where implementation has diverged from stakeholder expectations.

## ASSESSMENT FRAMEWORK

### 1. Goal Area Review
For each goal area identified during discovery, assess:
- **Original Goal:** What was intended
- **Current State:** What has actually been built/achieved
- **Alignment Status:** Green (on track), Amber (minor drift, recoverable), Red (significant drift, intervention needed)
- **Evidence:** Specific tasks, releases, or decisions that support your assessment
- **Drift Analysis:** If Amber or Red, explain what caused the divergence

### 2. Tech Debt Impact Assessment
Review the tech debt register and assess:
- Which tech debt items directly threaten goal achievement
- Which items have been deferred too long and now compound risk
- Whether the rate of tech debt accumulation is sustainable
- Recommendations for which items must be addressed before continuing

### 3. Stakeholder Alignment
Assess whether the implementation still serves:
- Primary user needs as defined in discovery
- Secondary stakeholder requirements
- Non-functional requirements (performance, security, scalability)
- Success criteria and KPIs

### 4. Drift Analysis
Identify and categorize any project drift:
- **Scope drift:** Features added or removed without formal change process
- **Technical drift:** Architecture deviations from the approved design
- **Timeline drift:** Schedule slippage and its impact on goals
- **Quality drift:** Compromises made that affect deliverable quality

### 5. Questions for Project Lead
Generate targeted questions that need answers to resolve any Amber or Red items.

## OUTPUT FORMAT
You MUST output your assessment as a JSON object wrapped in a \`\`\`json code block:

\`\`\`json
{
  "overall_alignment": "green|amber|red",
  "summary": "2-3 sentence executive summary",
  "goal_areas": [
    {
      "goal_id": "G1",
      "goal_name": "Name of the goal area",
      "original_goal": "What was intended",
      "current_state": "What has been achieved",
      "alignment_status": "green|amber|red",
      "evidence": ["Evidence point 1", "Evidence point 2"],
      "drift_description": "Description of drift if amber/red, null if green",
      "recommended_action": "What to do about it"
    }
  ],
  "tech_debt_summary": {
    "total_items": 0,
    "critical_items": 0,
    "blocking_goal_achievement": ["List of tech debt items that block goals"],
    "overdue_items": ["Items deferred too long"],
    "sustainability_assessment": "Assessment of tech debt trajectory",
    "must_address_now": ["Items that must be resolved before continuing"]
  },
  "drift_analysis": {
    "scope_drift": { "status": "none|minor|significant", "details": "Description" },
    "technical_drift": { "status": "none|minor|significant", "details": "Description" },
    "timeline_drift": { "status": "none|minor|significant", "details": "Description" },
    "quality_drift": { "status": "none|minor|significant", "details": "Description" }
  },
  "stakeholder_alignment": {
    "primary_users_served": true,
    "secondary_stakeholders_served": true,
    "nfr_compliance": "full|partial|failing",
    "success_criteria_on_track": true,
    "concerns": ["Any stakeholder-related concerns"]
  },
  "questions_for_project_lead": [
    "Question 1 that needs answering",
    "Question 2 that needs answering"
  ],
  "recommendations": [
    {
      "priority": "critical|high|medium|low",
      "action": "What should be done",
      "rationale": "Why this matters",
      "effort": "Estimated effort to address"
    }
  ]
}
\`\`\``;

  if (discoverySummary) {
    prompt += `\n\n## ORIGINAL DISCOVERY CONTEXT\nUse these original goals and requirements as the baseline for your alignment check:\n\n${discoverySummary}`;
  }

  if (architectureSummary) {
    prompt += `\n\n## APPROVED ARCHITECTURE\nReference this architecture when assessing technical drift:\n\n${architectureSummary}`;
  }

  return prompt;
}

function buildAlignmentCheckUserMessage(project: any, techDebt: any[], releases: any[], tasks: any[]): string {
  let message = `# Goal Alignment Check for "${project.name}"\n\nPlease assess whether this project remains aligned with its original goals.\n\n`;

  // Project progress summary
  const completedTasks = tasks.filter((t: any) => t.status === 'completed');
  const inProgressTasks = tasks.filter((t: any) => t.status === 'in_progress');
  const pendingTasks = tasks.filter((t: any) => t.status === 'pending');

  message += `## Project Progress Summary\n`;
  message += `- **Current Phase:** ${project.current_phase || 'unknown'}\n`;
  message += `- **Status:** ${project.status || 'unknown'}\n`;
  message += `- **Total Tasks:** ${tasks.length}\n`;
  message += `- **Completed:** ${completedTasks.length} (${tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%)\n`;
  message += `- **In Progress:** ${inProgressTasks.length}\n`;
  message += `- **Pending:** ${pendingTasks.length}\n\n`;

  // Tech debt items
  if (techDebt.length > 0) {
    message += `## Tech Debt Register (${techDebt.length} open items)\n`;
    techDebt.forEach((td: any, i: number) => {
      message += `${i + 1}. **[${(td.severity || 'medium').toUpperCase()}]** ${td.title}`;
      if (td.description) message += ` — ${td.description}`;
      if (td.owner) message += ` (Owner: ${td.owner})`;
      if (td.target_release_id) message += ` (Target release: ${td.target_release_id})`;
      message += `\n`;
    });
    message += '\n';
  } else {
    message += `## Tech Debt Register\nNo open tech debt items.\n\n`;
  }

  // Release status
  if (releases.length > 0) {
    message += `## Release Status\n`;
    releases.forEach((r: any) => {
      const releaseTasks = tasks.filter((t: any) => t.coding_release_id === r.id);
      const completedInRelease = releaseTasks.filter((t: any) => t.status === 'completed');
      message += `- **R${r.release_number}: ${r.name}** — Status: ${r.status || 'planned'}, Tasks: ${completedInRelease.length}/${releaseTasks.length} completed`;
      if (r.milestone_date) message += `, Target: ${r.milestone_date}`;
      message += '\n';
    });
    message += '\n';
  }

  // Task completion details
  if (completedTasks.length > 0) {
    message += `## Completed Tasks\n`;
    completedTasks.forEach((t: any) => {
      message += `- **${t.task_number || 'T?'}: ${t.title}** — Complexity: ${t.complexity_band || 'unknown'}`;
      if (t.completed_at) message += `, Completed: ${t.completed_at}`;
      message += '\n';
    });
    message += '\n';
  }

  message += `## Instructions
Perform a thorough goal alignment check. Compare the current project state against the original discovery goals and architecture. Identify any drift, assess tech debt impact, and produce your assessment as a JSON object in a \`\`\`json code block following the schema in your system instructions.

Be honest and specific. If things are going well, say so. If there are problems, flag them clearly with evidence.`;

  return message;
}

// ── Phase 6: Operational Readiness ────────────────────────────────────────

function buildOperationalReadinessSystemPrompt(projectName: string, architectureSummary?: string): string {
  let prompt = `You are a senior DevOps engineer and release manager performing an Operational Readiness Assessment for the project "${projectName}".

## YOUR ROLE
Evaluate whether the project is ready for production deployment. Assess all operational dimensions and produce a comprehensive go-live checklist. This assessment determines whether the project can be safely deployed, maintained, and operated in a production environment.

## ASSESSMENT CATEGORIES

### 1. Deployment Readiness
- CI/CD pipeline configured and tested
- Build process documented and reproducible
- Environment configurations (dev, staging, production) defined
- Infrastructure provisioned or provisioning automated
- Rollback procedures documented and tested
- Blue-green or canary deployment capability
- Configuration management (environment variables, secrets)
- Database migration strategy tested

### 2. Documentation Completeness
- README with setup, build, and run instructions
- API documentation (OpenAPI/Swagger or equivalent)
- Architecture documentation current and accurate
- Runbooks for common operational procedures
- Incident response playbook
- On-call procedures
- Change management procedures
- User-facing documentation (if applicable)

### 3. Monitoring and Alerting
- Application performance monitoring (APM)
- Infrastructure monitoring
- Log aggregation and search
- Error tracking and alerting
- Uptime monitoring
- Business metrics dashboards
- Alert escalation paths defined
- SLO/SLA targets established

### 4. Disaster Recovery and Backup
- Backup strategy documented and tested
- Recovery Time Objective (RTO) defined and achievable
- Recovery Point Objective (RPO) defined and achievable
- Disaster recovery plan tested
- Data retention policies implemented
- Failover procedures documented

### 5. Security Hardening
- Security audit completed
- Dependency vulnerability scan clean
- Secrets management in place (no hardcoded secrets)
- Network security configured (firewalls, WAF)
- SSL/TLS certificates provisioned
- Authentication and authorization tested
- OWASP Top 10 mitigated
- Penetration testing completed (or scheduled)

### 6. Knowledge Transfer
- Operations team briefed on architecture
- Support team trained on common issues
- Escalation procedures defined
- Code ownership and maintainer roles assigned
- On-call rotation established
- Key person dependency risks mitigated

### 7. Go-Live Prerequisites
- Stakeholder sign-off obtained
- Performance testing completed and results acceptable
- Load testing completed for expected traffic
- Data migration plan tested (if applicable)
- Communication plan for launch prepared
- Rollback criteria defined
- Go/No-Go checklist completed

## OUTPUT FORMAT
You MUST output your assessment as a JSON object wrapped in a \`\`\`json code block:

\`\`\`json
{
  "overall_readiness": "ready|not_ready|partial",
  "summary": "2-3 sentence executive summary",
  "go_live_recommendation": "go|no_go|conditional_go",
  "categories": [
    {
      "category": "deployment_readiness",
      "label": "Deployment Readiness",
      "status": "ready|not_ready|partial",
      "items": [
        {
          "item": "CI/CD pipeline",
          "status": "ready|not_ready|partial",
          "evidence": "What was found",
          "action_required": "What needs to be done (null if ready)",
          "priority": "critical|high|medium|low",
          "effort_estimate": "Estimated effort to resolve"
        }
      ]
    }
  ],
  "blocking_items": [
    {
      "category": "Category name",
      "item": "What is blocking",
      "reason": "Why it blocks go-live",
      "resolution": "How to resolve",
      "effort": "Estimated effort"
    }
  ],
  "risk_acceptance_needed": [
    {
      "risk": "Description of risk to accept",
      "impact": "What could happen",
      "probability": "low|medium|high",
      "stakeholder_approval_needed": true
    }
  ],
  "recommended_actions_before_go_live": [
    {
      "priority": "critical|high|medium|low",
      "action": "What to do",
      "owner": "Suggested owner role",
      "timeline": "How long it will take"
    }
  ]
}
\`\`\``;

  if (architectureSummary) {
    prompt += `\n\n## ARCHITECTURE CONTEXT\nReference this architecture when assessing operational readiness:\n\n${architectureSummary}`;
  }

  return prompt;
}

function buildOperationalReadinessUserMessage(project: any, releases: any[], testResults: any[]): string {
  let message = `# Operational Readiness Assessment for "${project.name}"\n\nPlease assess whether this project is ready for production deployment.\n\n`;

  // Project state
  message += `## Project State\n`;
  message += `- **Current Phase:** ${project.current_phase || 'unknown'}\n`;
  message += `- **Status:** ${project.status || 'unknown'}\n`;
  if (project.directory_path) message += `- **Directory:** ${project.directory_path}\n`;
  message += '\n';

  // Tech stack
  if (project.tech_stack) {
    const techStack = typeof project.tech_stack === 'string' ? project.tech_stack : JSON.stringify(project.tech_stack);
    if (techStack && techStack !== '[]') {
      message += `## Tech Stack\n${techStack}\n\n`;
    }
  }

  // Release status
  if (releases.length > 0) {
    message += `## Releases\n`;
    releases.forEach((r: any) => {
      message += `- **R${r.release_number}: ${r.name}** — Status: ${r.status || 'planned'}`;
      if (r.milestone_date) message += `, Target: ${r.milestone_date}`;
      message += '\n';
      if (r.scope) message += `  Scope: ${r.scope}\n`;
    });
    message += '\n';
  }

  // Test results
  if (testResults.length > 0) {
    message += `## Test Results (${testResults.length} runs)\n`;
    testResults.forEach((t: any) => {
      const results = typeof t.results === 'string' ? JSON.parse(t.results || '{}') : (t.results || {});
      message += `- **${t.test_type}${t.test_suite_name ? ': ' + t.test_suite_name : ''}** — `;
      message += `Pass: ${t.pass_count || 0}, Fail: ${t.fail_count || 0}, Skip: ${t.skip_count || 0}`;
      if (t.duration_ms) message += `, Duration: ${t.duration_ms}ms`;
      message += '\n';
    });
    message += '\n';
  } else {
    message += `## Test Results\nNo test runs recorded.\n\n`;
  }

  message += `## Instructions
Perform a comprehensive operational readiness assessment. Evaluate each category from your system prompt and produce a structured checklist with Ready/Not Ready/Partial status for each item.

Be thorough — missing operational readiness items can cause production incidents. Flag anything that is unclear or needs verification. Output your assessment as a JSON object in a \`\`\`json code block following the schema in your system instructions.`;

  return message;
}

// ── Phase 7: Change Impact Analysis ───────────────────────────────────────

function buildImpactAnalysisSystemPrompt(projectName: string): string {
  return `You are a senior change management analyst assessing the impact of a proposed change to the project "${projectName}".

## YOUR ROLE
Analyze a proposed change across all relevant dimensions and produce a structured impact assessment. Your analysis must help decision-makers understand the full consequences of accepting, modifying, or rejecting the change.

## IMPACT DIMENSIONS

### 1. Technical Impact
- Affected components and modules
- Code changes required (estimated scope)
- Database or data model changes
- API changes (breaking or non-breaking)
- Integration point impacts
- Infrastructure changes needed
- Tech debt implications (creates new, resolves existing)

### 2. Timeline Impact
- Delay to current release(s)
- Effect on critical path
- Dependencies that shift
- Milestone dates affected
- Parallel work disrupted

### 3. Cost Impact
- Additional development effort (person-days)
- Additional Claude API costs (if AI-assisted)
- Infrastructure cost changes
- Opportunity cost of delayed features

### 4. Scope Impact
- Features added, modified, or removed
- Requirements affected
- Acceptance criteria changes
- Test plan modifications needed

### 5. Quality Impact
- Risk to existing functionality
- Regression testing needed
- Performance implications
- Security implications
- Documentation updates required

### 6. Stakeholder Impact
- Users affected
- Approval or communication required
- Training implications
- Contractual or compliance implications

## RISK ASSESSMENT
For the change itself:
- Probability of implementation success
- Probability of negative side effects
- Reversibility (can we undo this if it goes wrong?)
- Urgency (what happens if we delay this change?)

## OUTPUT FORMAT
You MUST output your assessment as a JSON object wrapped in a \`\`\`json code block:

\`\`\`json
{
  "change_id": "ID of the change",
  "change_title": "Title of the change",
  "overall_impact": "low|medium|high|critical",
  "recommendation": "approve|approve_with_conditions|defer|reject",
  "summary": "2-3 sentence impact summary",
  "impact_dimensions": {
    "technical": {
      "severity": "low|medium|high|critical",
      "affected_components": ["Component 1", "Component 2"],
      "code_change_scope": "Description of code changes",
      "breaking_changes": false,
      "details": "Full technical impact description"
    },
    "timeline": {
      "severity": "low|medium|high|critical",
      "delay_estimate_days": 0,
      "critical_path_affected": false,
      "milestones_affected": ["Milestone name"],
      "details": "Full timeline impact description"
    },
    "cost": {
      "severity": "low|medium|high|critical",
      "additional_effort_days": 0,
      "additional_api_cost_usd": 0,
      "infrastructure_cost_change": "none|increase|decrease",
      "details": "Full cost impact description"
    },
    "scope": {
      "severity": "low|medium|high|critical",
      "features_affected": ["Feature 1"],
      "requirements_changed": 0,
      "test_plan_changes_needed": true,
      "details": "Full scope impact description"
    },
    "quality": {
      "severity": "low|medium|high|critical",
      "regression_risk": "low|medium|high",
      "performance_impact": "none|positive|negative",
      "security_impact": "none|positive|negative",
      "details": "Full quality impact description"
    },
    "stakeholder": {
      "severity": "low|medium|high|critical",
      "users_affected": ["User group 1"],
      "approvals_needed": ["Approval 1"],
      "communication_required": true,
      "details": "Full stakeholder impact description"
    }
  },
  "affected_releases": [
    {
      "release_id": "ID",
      "release_name": "Name",
      "impact": "Description of impact on this release"
    }
  ],
  "affected_tasks": [
    {
      "task_id": "ID",
      "task_title": "Title",
      "impact": "modified|blocked|removed|new",
      "details": "Description of impact"
    }
  ],
  "risk_assessment": {
    "implementation_success_probability": "high|medium|low",
    "side_effect_probability": "high|medium|low",
    "reversibility": "easy|moderate|difficult|irreversible",
    "urgency": "immediate|soon|can_defer|no_urgency"
  },
  "mitigation_strategies": [
    {
      "risk": "What could go wrong",
      "mitigation": "How to prevent or reduce impact",
      "effort": "Effort to implement mitigation"
    }
  ],
  "conditions_for_approval": [
    "Condition 1 that must be met before approving",
    "Condition 2 that must be met before approving"
  ]
}
\`\`\``;
}

function buildImpactAnalysisUserMessage(change: any, project: any, releases: any[]): string {
  let message = `# Change Impact Analysis\n\n`;

  message += `## Proposed Change\n`;
  message += `- **Title:** ${change.title}\n`;
  message += `- **Type:** ${change.change_type || 'unspecified'}\n`;
  message += `- **Level:** ${change.change_level || 'unspecified'}\n`;
  if (change.rationale) message += `- **Rationale:** ${change.rationale}\n`;
  if (change.initiated_by) message += `- **Initiated By:** ${change.initiated_by}\n`;
  message += '\n';

  if (change.original_state && Object.keys(change.original_state).length > 0) {
    message += `## Original State\n\`\`\`json\n${JSON.stringify(change.original_state, null, 2)}\n\`\`\`\n\n`;
  }

  if (change.revised_state && Object.keys(change.revised_state).length > 0) {
    message += `## Revised State (Proposed)\n\`\`\`json\n${JSON.stringify(change.revised_state, null, 2)}\n\`\`\`\n\n`;
  }

  // Project context
  message += `## Project Context\n`;
  message += `- **Project:** ${project.name}\n`;
  message += `- **Status:** ${project.status || 'unknown'}\n`;
  message += `- **Phase:** ${project.current_phase || 'unknown'}\n`;
  if (project.architecture_summary) {
    message += `\n### Architecture Summary\n${project.architecture_summary}\n`;
  }
  message += '\n';

  // Affected releases
  if (releases.length > 0) {
    message += `## Current Releases\n`;
    releases.forEach((r: any) => {
      message += `- **R${r.release_number}: ${r.name}** — Status: ${r.status || 'planned'}`;
      if (r.milestone_date) message += `, Target: ${r.milestone_date}`;
      if (r.scope) message += `\n  Scope: ${r.scope}`;
      message += '\n';
    });
    message += '\n';
  }

  // Pre-identified affected items
  if (change.affected_release_ids && change.affected_release_ids.length > 0) {
    message += `## Pre-Identified Affected Releases\n`;
    message += `Release IDs: ${change.affected_release_ids.join(', ')}\n\n`;
  }

  if (change.affected_task_ids && change.affected_task_ids.length > 0) {
    message += `## Pre-Identified Affected Tasks\n`;
    message += `Task IDs: ${change.affected_task_ids.join(', ')}\n\n`;
  }

  message += `## Instructions
Analyze the full impact of this proposed change. Assess every dimension: technical, timeline, cost, scope, quality, and stakeholder. Identify all affected releases and tasks. Provide a clear Go/No-Go recommendation with conditions if applicable.

Output your assessment as a JSON object in a \`\`\`json code block following the schema in your system instructions.`;

  return message;
}

// ── Phase 7: Scoped Re-discovery ──────────────────────────────────────────

function buildRediscoverySystemPrompt(projectName: string, originalDiscovery?: string, scope?: string): string {
  let prompt = `You are a senior technical discovery facilitator conducting a Scoped Re-discovery for the project "${projectName}".

## YOUR ROLE
You are revisiting specific areas of the project's requirements because something has changed since the original discovery. This is NOT a full re-discovery — it is targeted at the specific scope areas identified. Your job is to produce updated requirements that integrate with the existing discovery findings.

## SCOPED RE-DISCOVERY APPROACH

### 1. Scope Acknowledgment
- Clearly state what areas are being re-examined and why
- Identify the boundaries — what is IN scope and what is OUT of scope for this re-discovery
- Reference the original discovery findings for context

### 2. Change Identification
For each scoped area, identify:
- What has changed since original discovery (new requirements, changed constraints, lessons learned)
- What caused the change (external regulation, stakeholder feedback, technical findings, market shift)
- Impact of the change on adjacent areas

### 3. Updated Requirements
For each changed requirement:
- Original requirement (if it existed)
- Updated requirement with clear changes highlighted
- Rationale for the change
- Impact on other requirements (dependencies, conflicts)
- New acceptance criteria

### 4. New Requirements
For any entirely new requirements discovered:
- Requirement ID and title
- Full description
- Priority (MoSCoW)
- Acceptance criteria
- Dependencies on existing requirements

### 5. Removed or Deprecated Requirements
If any original requirements are no longer valid:
- Which requirements are affected
- Why they are no longer valid
- Impact of removing them

### 6. Risk Assessment
- New risks identified through re-discovery
- Changes to existing risk levels
- Mitigation strategies for new risks

### 7. Impact on Architecture and Plan
- Does the architecture need to change?
- Which releases are affected?
- New tasks or modified tasks needed?

## OUTPUT FORMAT
Produce a structured Markdown document with:

1. **Re-discovery Scope Statement** — What areas are being re-examined and why
2. **Changes Since Original Discovery** — What has changed and why
3. **Updated Requirements** — Modified requirements with change tracking
4. **New Requirements** — Entirely new requirements
5. **Deprecated Requirements** — Requirements no longer valid
6. **Updated Risk Register** — New or changed risks
7. **Architecture Impact** — Whether architecture changes are needed
8. **Implementation Impact** — Affected releases, tasks, and timeline
9. **Recommendations** — What should happen next
10. **Open Questions** — Anything that still needs clarification`;

  if (originalDiscovery) {
    prompt += `\n\n## ORIGINAL DISCOVERY FINDINGS\nThese are the original discovery findings. Reference them when identifying changes:\n\n${originalDiscovery}`;
  }

  if (scope) {
    prompt += `\n\n## RE-DISCOVERY SCOPE\nFocus your re-discovery on these specific areas:\n\n${scope}`;
  }

  return prompt;
}

function buildRediscoveryUserMessage(scope: string, project: any): string {
  let message = `# Scoped Re-discovery for "${project.name}"\n\n`;

  message += `## Re-discovery Scope\n${scope}\n\n`;

  // Project context
  message += `## Current Project State\n`;
  message += `- **Status:** ${project.status || 'unknown'}\n`;
  message += `- **Phase:** ${project.current_phase || 'unknown'}\n`;
  message += '\n';

  if (project.discovery_summary) {
    message += `## Original Discovery Summary\n${project.discovery_summary}\n\n`;
  }

  if (project.architecture_summary) {
    message += `## Current Architecture Summary\n${project.architecture_summary}\n\n`;
  }

  if (project.tech_stack) {
    const techStack = typeof project.tech_stack === 'string' ? project.tech_stack : JSON.stringify(project.tech_stack);
    if (techStack && techStack !== '[]') {
      message += `## Tech Stack\n${techStack}\n\n`;
    }
  }

  message += `## Instructions
Conduct a scoped re-discovery focused on the areas described above. Reference the original discovery findings and identify what has changed. Produce updated requirements, flag new risks, and assess the impact on the existing architecture and implementation plan.

Be thorough within the scope, but do not expand beyond it. If you identify issues outside the scope that need attention, note them in the "Open Questions" section but do not attempt to re-discover those areas.`;

  return message;
}

/**
 * Optional dependency injection for ANTON Studio Phase 3. Tests pass a mock
 * DDL runner + a fake server DSN so provisioning/teardown exercise the right
 * CREATE/DROP statements WITHOUT touching a real database or running real
 * toolchains. Production omits all of these and the real PostgreSQL pool +
 * process.env.DATABASE_URL are used.
 */
export interface CodingLargeDeps {
  /** Build a raw-DDL runner from the adapter (default: the real pg pool). */
  ddlRunner?: (db: DatabaseAdapter) => RawDdlRunner;
  /** The server's own DSN (default: process.env.DATABASE_URL). */
  serverDsn?: string;
}

export async function createCodingLargeRoutes(
  db: DatabaseAdapter,
  deps: CodingLargeDeps = {},
): Promise<Router> {
  const router = Router();

  const makeDdlRunner = deps.ddlRunner ?? ddlRunnerFromAdapter;
  const getServerDsn = (): string => {
    const dsn = deps.serverDsn ?? process.env.DATABASE_URL;
    if (!dsn) throw new Error('DATABASE_URL is not set — cannot provision a per-project database');
    return dsn;
  };

  // ── Project CRUD ─────────────────────────────────────────────────────────

  // POST /api/coding/projects — Create project
  router.post('/coding/projects', async (req, res) => {
    try {
      const { name, description, tier = 'large', project_id, directory_path } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });

      // Workspace binding is security-gated: validate against ALLOWED_FOLDER_PATHS at bind time.
      if (directory_path) {
        const validation = await validateWorkspacePath(directory_path);
        if (!validation.ok) {
          return res.status(403).json({ error: `Workspace not permitted: ${validation.error}`, workspace: validation });
        }
      }

      // Create parent project if not provided
      let parentProjectId = project_id;
      if (!parentProjectId) {
        parentProjectId = randomUUID();
        await db.run(`
          INSERT INTO projects (id, name, description, status, created_at, updated_at)
          VALUES (?, ?, ?, 'active', NOW(), NOW())
        `, parentProjectId, name, description || '');
      }

      const id = randomUUID();
      await db.run(`
        INSERT INTO coding_projects (id, project_id, name, description, tier, directory_path, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, id, parentProjectId, name, description || '', tier, directory_path || null, (req as any).userId || 'system');

      res.json({ id, project_id: parentProjectId, name, tier, status: 'discovery' });
    } catch (error) {
      console.error('[coding-large] Create project error:', error);
      res.status(500).json({ error: 'Failed to create project' });
    }
  });

  // GET /api/coding/projects — List coding projects
  //
  // SECURITY: this listed EVERY tenant's coding projects. A Studio project carries
  // the kickoff charter in `discovery_summary` — problem statement, jurisdiction,
  // references, risks — so on a team install any authenticated user could read every
  // other user's charter by calling the list endpoint.
  router.get('/coding/projects', async (req, res) => {
    try {
      const status = req.query.status as string;
      const tier = req.query.tier as string;
      const limit = parseInt(req.query.limit as string) || 20;

      // `WHERE 1=1` so the owner fragment (which always begins with ' AND ') appends
      // safely no matter which optional filters are present — the shape ownership.ts
      // prescribes, precisely so removing a filter can never leave the query unscoped.
      let sql = 'SELECT cp.*, p.name as parent_project_name FROM coding_projects cp LEFT JOIN projects p ON cp.project_id = p.id WHERE 1=1';
      const params: unknown[] = [];

      if (status) { sql += ' AND cp.status = ?'; params.push(status); }
      if (tier) { sql += ' AND cp.tier = ?'; params.push(tier); }

      const scope = ownerFilter(req as OwnedRequest, 'p.user_id');
      sql += scope.sql;
      params.push(...scope.params);

      sql += ' ORDER BY cp.updated_at DESC LIMIT ?';
      params.push(limit);

      const projects = await db.all(sql, ...params);
      res.json(projects.map(parseProject));
    } catch (error) {
      console.error('[coding-large] List projects error:', error);
      res.status(500).json({ error: 'Failed to list projects' });
    }
  });

  // GET /api/coding/projects/:id — Get project with full state
  //
  // SECURITY: same leak as the list, by id — plus releases, tasks, reviews and tech
  // debt. Scoped with assertOwned so a foreign id 404s exactly like a missing one
  // (a 403 would confirm the project exists and turn ids into an enumeration oracle).
  router.get('/coding/projects/:id', async (req, res) => {
    try {
      if (!(await assertOwned(db, req as OwnedRequest, res, {
        table: CODING_PROJECT_OWNER_SOURCE, ownerColumn: 'p.user_id',
        id: req.params.id, idColumn: 'cp.id',
        notFoundMessage: 'Project not found',
      }))) return;

      const row = await db.get(`
        SELECT cp.*, p.name as parent_project_name
        FROM coding_projects cp
        LEFT JOIN projects p ON cp.project_id = p.id
        WHERE cp.id = ?
      `, req.params.id);
      if (!row) return res.status(404).json({ error: 'Project not found' });

      const project = parseProject(row);

      // Load releases
      const releases = await db.all('SELECT * FROM coding_releases WHERE coding_project_id = ? ORDER BY release_number LIMIT 500', req.params.id);

      // Load recent tasks
      const tasks = await db.all('SELECT * FROM coding_tasks WHERE coding_project_id = ? ORDER BY sort_order LIMIT 50', req.params.id);

      // Load reviews
      const reviews = await db.all('SELECT * FROM coding_reviews WHERE coding_project_id = ? ORDER BY created_at DESC LIMIT 20', req.params.id);

      // Load tech debt
      const techDebt = await db.all("SELECT * FROM coding_tech_debt WHERE coding_project_id = ? AND status != 'resolved' ORDER BY severity DESC LIMIT 500", req.params.id);

      res.json({
        ...project,
        releases: releases.map(parseRelease),
        tasks: tasks.map(parseTask),
        reviews: reviews.map(parseReview),
        techDebt: techDebt,
      });
    } catch (error) {
      console.error('[coding-large] Get project error:', error);
      res.status(500).json({ error: 'Failed to get project' });
    }
  });

  // PATCH /api/coding/projects/:id — Update project
  router.patch('/coding/projects/:id', async (req, res) => {
    try {
      // Workspace binding is security-gated: validate against ALLOWED_FOLDER_PATHS at bind time.
      if (req.body.directory_path) {
        const validation = await validateWorkspacePath(req.body.directory_path);
        if (!validation.ok) {
          return res.status(403).json({ error: `Workspace not permitted: ${validation.error}`, workspace: validation });
        }
      }

      const updates: string[] = [];
      const params: any[] = [];
      const allowed = ['name', 'description', 'status', 'directory_path', 'discovery_summary',
        'architecture_summary', 'baseline_summary', 'tech_stack', 'expert_panels',
        'cost_estimate', 'cost_actual', 'environment_status', 'environment_mode',
        'current_phase', 'current_release_id'];

      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          const val = typeof req.body[key] === 'object' ? JSON.stringify(req.body[key]) : req.body[key];
          updates.push(`${key} = ?`);
          params.push(val);
        }
      }

      if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

      updates.push("updated_at = NOW()");
      params.push(req.params.id);

      await db.run(`UPDATE coding_projects SET ${updates.join(', ')} WHERE id = ?`, ...params);
      res.json({ id: req.params.id, updated: true });
    } catch (error) {
      console.error('[coding-large] Update project error:', error);
      res.status(500).json({ error: 'Failed to update project' });
    }
  });

  // ── Phase 0 — Codebase Onboarding ────────────────────────────────────────

  router.post('/coding/projects/:id/baseline', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { code, files, source_path } = req.body;

      await db.run("UPDATE coding_projects SET status = 'onboarding', current_phase = 0, updated_at = NOW() WHERE id = ?", req.params.id);

      const systemPromptOverride = buildBaselineSystemPrompt(project.name);
      const baselinePrompt = buildBaselineUserMessage(project.name, { code, files, source_path });

      res.json({
        id: req.params.id,
        baselinePrompt,
        systemPromptOverride,
        moduleId: 'code-review-explain',
        areaId: 'coding',
        status: 'onboarding',
      });
    } catch (error) {
      console.error('[coding-large] Baseline error:', error);
      res.status(500).json({ error: 'Failed to start baseline' });
    }
  });

  // POST /api/coding/projects/:id/baseline/save — Save baseline assessment from AI
  router.post('/coding/projects/:id/baseline/save', async (req, res) => {
    try {
      const project = await db.get('SELECT id FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { baseline_summary } = req.body;
      if (!baseline_summary) return res.status(400).json({ error: 'baseline_summary is required' });

      await db.run("UPDATE coding_projects SET baseline_summary = ?, status = 'discovery', current_phase = 1, updated_at = NOW() WHERE id = ?", baseline_summary, req.params.id);

      // Fire-and-forget version tracking
      try {
        const integration = await createCodingIntegration(db);
        integration.saveVersion('coding-baseline', req.params.id, baseline_summary, 'Baseline assessment');
      } catch { /* version tracking failure should not break the main flow */ }

      res.json({ id: req.params.id, status: 'discovery', phase: 1, message: 'Baseline saved, advanced to discovery' });
    } catch (error) {
      console.error('[coding-large] Save baseline error:', error);
      res.status(500).json({ error: 'Failed to save baseline' });
    }
  });

  router.get('/coding/projects/:id/baseline', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json({ baseline_summary: project.baseline_summary });
    } catch (error) {
      console.error('[coding-large] Get baseline error:', error);
      res.status(500).json({ error: 'Failed to get baseline' });
    }
  });

  // ── Phase 1 — Discovery ──────────────────────────────────────────────────

  router.post('/coding/projects/:id/discovery', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { context, goals, stakeholders, constraints } = req.body;

      await db.run("UPDATE coding_projects SET status = 'discovery', current_phase = 1, updated_at = NOW() WHERE id = ?", req.params.id);

      const systemPromptOverride = buildDiscoverySystemPrompt(project.name, project.baseline_summary || undefined);
      const discoveryPrompt = buildDiscoveryUserMessage(project.name, { context, goals, stakeholders, constraints });

      res.json({
        discoveryPrompt,
        systemPromptOverride,
        moduleId: 'coding-large-discovery',
        areaId: 'coding',
        status: 'discovery',
        phase: 1,
      });
    } catch (error) {
      console.error('[coding-large] Discovery error:', error);
      res.status(500).json({ error: 'Failed to start discovery' });
    }
  });

  router.post('/coding/projects/:id/discovery/finalize', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { summary } = req.body;
      await db.run("UPDATE coding_projects SET discovery_summary = ?, status = 'architecture', current_phase = 2, updated_at = NOW() WHERE id = ?", summary || '', req.params.id);

      // Fire-and-forget version tracking
      try {
        const integration = await createCodingIntegration(db);
        integration.saveVersion('coding-discovery', req.params.id, summary || '', 'Discovery finalized');
      } catch { /* version tracking failure should not break the main flow */ }

      const systemPromptOverride = buildDiscoveryFinalizationSystemPrompt(project.name);
      const finalizationPrompt = buildDiscoveryFinalizationUserMessage();

      res.json({
        finalizationPrompt,
        systemPromptOverride,
        status: 'architecture',
        phase: 2,
        message: 'Discovery finalized',
      });
    } catch (error) {
      console.error('[coding-large] Finalize discovery error:', error);
      res.status(500).json({ error: 'Failed to finalize discovery' });
    }
  });

  // ── Phase 2 — Architecture ───────────────────────────────────────────────

  router.post('/coding/projects/:id/architecture', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { discovery_summary, tech_stack_preferences, constraints } = req.body;

      // Use provided summaries or load from project
      const discoverySummary = discovery_summary || project.discovery_summary || undefined;
      const baselineSummary = project.baseline_summary || undefined;

      await db.run("UPDATE coding_projects SET status = 'architecture', current_phase = 2, updated_at = NOW() WHERE id = ?", req.params.id);

      const systemPromptOverride = buildArchitectureSystemPrompt(project.name, discoverySummary, baselineSummary);
      const architecturePrompt = buildArchitectureUserMessage(project.name, { tech_stack_preferences, constraints });

      res.json({
        architecturePrompt,
        systemPromptOverride,
        moduleId: 'coding-large-architecture',
        areaId: 'coding',
        status: 'architecture',
        phase: 2,
      });
    } catch (error) {
      console.error('[coding-large] Architecture error:', error);
      res.status(500).json({ error: 'Failed to start architecture' });
    }
  });

  router.post('/coding/projects/:id/architecture/review', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { architecture_summary, personas = ['security', 'compliance', 'product'] } = req.body;
      const archSummary = architecture_summary || project.architecture_summary || '';

      if (!archSummary) {
        return res.status(400).json({ error: 'architecture_summary is required (provide it or save it to the project first)' });
      }

      const reviews = personas.map(async (persona: string) => {
        const id = randomUUID();
        await db.run(`
          INSERT INTO coding_reviews (id, coding_project_id, reviewer_persona_id, review_type, is_mandatory)
          VALUES (?, ?, ?, 'architecture', 1)
        `, id, req.params.id, persona);
        return { id, persona, status: 'pending' };
      });

      const reviewPrompts = reviews.map((review: { id: string; persona: string; status: string }) => ({
        reviewId: review.id,
        persona: review.persona,
        reviewPrompt: buildArchitectureReviewUserMessage(review.persona, archSummary),
        systemPromptOverride: buildArchitectureReviewSystemPrompt(review.persona, project.name),
      }));

      res.json({ reviews, reviewPrompts, message: 'Expert panel review initiated' });
    } catch (error) {
      console.error('[coding-large] Architecture review error:', error);
      res.status(500).json({ error: 'Failed to initiate review' });
    }
  });

  router.patch('/coding/projects/:id/architecture', async (req, res) => {
    try {
      const { summary } = req.body;
      await db.run("UPDATE coding_projects SET architecture_summary = ?, updated_at = NOW() WHERE id = ?", summary || '', req.params.id);

      // Fire-and-forget version tracking
      try {
        const integration = await createCodingIntegration(db);
        integration.saveVersion('coding-architecture', req.params.id, summary || '', 'Architecture updated');
      } catch { /* version tracking failure should not break the main flow */ }

      res.json({ message: 'Architecture updated' });
    } catch (error) {
      console.error('[coding-large] Update architecture error:', error);
      res.status(500).json({ error: 'Failed to update architecture' });
    }
  });

  // ── Phase 2b — Estimation ────────────────────────────────────────────────

  router.post('/coding/projects/:id/estimate', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { estimate, architecture_summary, discovery_summary } = req.body;

      // If a raw estimate object is provided, save it directly (backwards-compatible)
      if (estimate) {
        await db.run("UPDATE coding_projects SET cost_estimate = ?, status = 'estimation', updated_at = NOW() WHERE id = ?", JSON.stringify(estimate), req.params.id);
      } else {
        await db.run("UPDATE coding_projects SET status = 'estimation', updated_at = NOW() WHERE id = ?", req.params.id);
      }

      // Use provided summaries or load from project
      const archSummary = architecture_summary || project.architecture_summary || undefined;
      const discSummary = discovery_summary || project.discovery_summary || undefined;

      const systemPromptOverride = buildEstimationSystemPrompt(project.name, discSummary, archSummary);
      const estimationPrompt = buildEstimationUserMessage(project.name);

      res.json({
        estimationPrompt,
        systemPromptOverride,
        moduleId: 'coding-large-architecture',
        areaId: 'coding',
        status: 'estimation',
        message: 'Estimation prompt ready',
      });
    } catch (error) {
      console.error('[coding-large] Estimate error:', error);
      res.status(500).json({ error: 'Failed to generate estimate' });
    }
  });

  // ── Release Management ───────────────────────────────────────────────────

  router.get('/coding/projects/:id/releases', async (req, res) => {
    try {
      const releases = await db.all('SELECT * FROM coding_releases WHERE coding_project_id = ? ORDER BY release_number ASC', req.params.id);
      res.json(releases.map(parseRelease));
    } catch (error) {
      console.error('[coding-large] List releases error:', error);
      res.status(500).json({ error: 'Failed to list releases' });
    }
  });

  router.post('/coding/projects/:id/releases', async (req, res) => {
    try {
      const { name, description, scope, acceptance_criteria = [], milestone_date, git_branch } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });

      const maxRelease = await db.get('SELECT MAX(release_number) as max FROM coding_releases WHERE coding_project_id = ?', req.params.id) as any;
      const releaseNumber = (maxRelease?.max || 0) + 1;

      const id = randomUUID();
      await db.run(`
        INSERT INTO coding_releases (id, coding_project_id, release_number, name, description, scope, acceptance_criteria, milestone_date, git_branch)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, req.params.id, releaseNumber, name, description || '', scope || '', JSON.stringify(acceptance_criteria), milestone_date || null, git_branch || null);

      await db.run("UPDATE coding_projects SET status = 'planning', current_phase = 4, current_release_id = ?, updated_at = NOW() WHERE id = ?", id, req.params.id);

      res.json({ id, release_number: releaseNumber, name, status: 'planned' });
    } catch (error) {
      console.error('[coding-large] Create release error:', error);
      res.status(500).json({ error: 'Failed to create release' });
    }
  });

  router.get('/coding/projects/:id/releases/:rid', async (req, res) => {
    try {
      const row = await db.get('SELECT * FROM coding_releases WHERE id = ? AND coding_project_id = ?', req.params.rid, req.params.id);
      if (!row) return res.status(404).json({ error: 'Release not found' });

      const tasks = await db.all('SELECT * FROM coding_tasks WHERE coding_release_id = ? ORDER BY sort_order LIMIT 500', req.params.rid);

      res.json({ ...parseRelease(row), tasks: tasks.map(parseTask) });
    } catch (error) {
      console.error('[coding-large] Get release error:', error);
      res.status(500).json({ error: 'Failed to get release' });
    }
  });

  router.patch('/coding/projects/:id/releases/:rid', async (req, res) => {
    try {
      const updates: string[] = [];
      const params: any[] = [];
      const allowed = ['name', 'description', 'scope', 'status', 'acceptance_criteria', 'milestone_date', 'git_branch', 'complexity_estimate', 'complexity_actual'];

      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          const val = typeof req.body[key] === 'object' ? JSON.stringify(req.body[key]) : req.body[key];
          updates.push(`${key} = ?`);
          params.push(val);
        }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

      updates.push("updated_at = NOW()");
      params.push(req.params.rid, req.params.id);

      await db.run(`UPDATE coding_releases SET ${updates.join(', ')} WHERE id = ? AND coding_project_id = ?`, ...params);
      res.json({ id: req.params.rid, updated: true });
    } catch (error) {
      console.error('[coding-large] Update release error:', error);
      res.status(500).json({ error: 'Failed to update release' });
    }
  });

  // POST /api/coding/projects/:id/releases/:rid/plan — Generate task breakdown for a release
  router.post('/coding/projects/:id/releases/:rid/plan', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const releaseRow = await db.get('SELECT * FROM coding_releases WHERE id = ? AND coding_project_id = ?', req.params.rid, req.params.id);
      if (!releaseRow) return res.status(404).json({ error: 'Release not found' });

      const release = parseRelease(releaseRow);
      const parsedProject = parseProject(project);

      // Build release context for system prompt
      let releaseContext = `Release: ${release.name} (R${release.release_number})`;
      if (release.description) releaseContext += `\nDescription: ${release.description}`;
      if (release.scope) releaseContext += `\nScope: ${release.scope}`;
      if (release.milestone_date) releaseContext += `\nTarget Date: ${release.milestone_date}`;
      if (release.acceptance_criteria && release.acceptance_criteria.length > 0) {
        releaseContext += `\nAcceptance Criteria:\n${release.acceptance_criteria.map((ac: string, i: number) => `${i + 1}. ${ac}`).join('\n')}`;
      }

      const systemPromptOverride = buildReleasePlanSystemPrompt(
        project.name,
        releaseContext,
        project.architecture_summary || undefined
      );
      const releasePlanPrompt = buildReleasePlanUserMessage(release, parsedProject);

      res.json({
        releasePlanPrompt,
        systemPromptOverride,
        moduleId: 'coding-large-implementation',
        areaId: 'coding',
        releaseId: req.params.rid,
      });
    } catch (error) {
      console.error('[coding-large] Release plan error:', error);
      res.status(500).json({ error: 'Failed to generate release plan' });
    }
  });

  // ── Task Management ──────────────────────────────────────────────────────

  router.get('/coding/projects/:id/tasks', async (req, res) => {
    try {
      const releaseId = req.query.release_id as string;
      const status = req.query.status as string;

      let sql = 'SELECT * FROM coding_tasks WHERE coding_project_id = ?';
      const params: any[] = [req.params.id];

      if (releaseId) { sql += ' AND coding_release_id = ?'; params.push(releaseId); }
      if (status) { sql += ' AND status = ?'; params.push(status); }
      sql += ' ORDER BY sort_order';

      res.json((await db.all(sql, ...params)).map(parseTask));
    } catch (error) {
      console.error('[coding-large] List tasks error:', error);
      res.status(500).json({ error: 'Failed to list tasks' });
    }
  });

  router.post('/coding/projects/:id/tasks', async (req, res) => {
    try {
      const { coding_release_id, title, description, complexity_band = 'medium', acceptance_criteria = [], depends_on = [] } = req.body;
      if (!coding_release_id || !title) return res.status(400).json({ error: 'coding_release_id and title are required' });

      const maxTask = await db.get('SELECT COUNT(*) as c FROM coding_tasks WHERE coding_release_id = ?', coding_release_id) as any;
      const taskNumber = `T${(maxTask?.c || 0) + 1}`;

      const id = randomUUID();
      await db.run(`
        INSERT INTO coding_tasks (id, coding_release_id, coding_project_id, task_number, title, description, complexity_band, acceptance_criteria, depends_on, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, coding_release_id, req.params.id, taskNumber, title, description || '', complexity_band, JSON.stringify(acceptance_criteria), JSON.stringify(depends_on), (maxTask?.c || 0));

      res.json({ id, task_number: taskNumber, title, status: 'pending' });
    } catch (error) {
      console.error('[coding-large] Create task error:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  router.get('/coding/projects/:id/tasks/:tid', async (req, res) => {
    try {
      const row = await db.get('SELECT * FROM coding_tasks WHERE id = ? AND coding_project_id = ?', req.params.tid, req.params.id);
      if (!row) return res.status(404).json({ error: 'Task not found' });
      res.json(parseTask(row));
    } catch (error) {
      console.error('[coding-large] Get task error:', error);
      res.status(500).json({ error: 'Failed to get task' });
    }
  });

  router.patch('/coding/projects/:id/tasks/:tid', async (req, res) => {
    try {
      const updates: string[] = [];
      const params: any[] = [];
      const allowed = ['title', 'description', 'status', 'assigned_role', 'complexity_band', 'acceptance_criteria',
        'execution_plan', 'progress_log', 'completion_record', 'completion_notes', 'review_status',
        'git_commit_hash', 'git_branch', 'depends_on', 'blocks', 'file_manifest', 'test_results',
        'tokens_consumed', 'started_at', 'completed_at'];

      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          const val = typeof req.body[key] === 'object' ? JSON.stringify(req.body[key]) : req.body[key];
          updates.push(`${key} = ?`);
          params.push(val);
        }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

      updates.push("updated_at = NOW()");
      params.push(req.params.tid, req.params.id);

      await db.run(`UPDATE coding_tasks SET ${updates.join(', ')} WHERE id = ? AND coding_project_id = ?`, ...params);
      res.json({ id: req.params.tid, updated: true });
    } catch (error) {
      console.error('[coding-large] Update task error:', error);
      res.status(500).json({ error: 'Failed to update task' });
    }
  });

  router.post('/coding/projects/:id/tasks/:tid/plan', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const task = await db.get('SELECT * FROM coding_tasks WHERE id = ? AND coding_project_id = ?', req.params.tid, req.params.id) as any;
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const parsedTask = parseTask(task);

      // Load the release for context
      let release: any = null;
      if (task.coding_release_id) {
        const releaseRow = await db.get('SELECT * FROM coding_releases WHERE id = ?', task.coding_release_id);
        if (releaseRow) release = parseRelease(releaseRow);
      }

      const parsedProject = parseProject(project);

      // Build release context string for the system prompt
      let releaseContext = '';
      if (release) {
        releaseContext = `Release: ${release.name} (R${release.release_number})\nScope: ${release.scope || 'Not specified'}\nDescription: ${release.description || 'Not specified'}`;
        if (release.acceptance_criteria && release.acceptance_criteria.length > 0) {
          releaseContext += `\nRelease Acceptance Criteria:\n${release.acceptance_criteria.map((ac: string, i: number) => `${i + 1}. ${ac}`).join('\n')}`;
        }
      }

      const systemPromptOverride = buildTaskPlanSystemPrompt(project.name, task.title, releaseContext);
      const taskPlanPrompt = buildTaskPlanUserMessage(parsedTask, release, parsedProject);

      await db.run("UPDATE coding_tasks SET status = 'planning', updated_at = NOW() WHERE id = ?", req.params.tid);

      res.json({
        taskPlanPrompt,
        systemPromptOverride,
        moduleId: 'coding-large-implementation',
        areaId: 'coding',
        status: 'planning',
        taskId: req.params.tid,
      });
    } catch (error) {
      console.error('[coding-large] Task plan error:', error);
      res.status(500).json({ error: 'Failed to plan task' });
    }
  });

  router.post('/coding/projects/:id/tasks/:tid/execute', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const task = await db.get('SELECT * FROM coding_tasks WHERE id = ? AND coding_project_id = ?', req.params.tid, req.params.id) as any;
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const parsedTask = parseTask(task);

      // Require an execution plan before execution
      if (!parsedTask.execution_plan) {
        return res.status(400).json({ error: 'Task must have an execution_plan before execution. Run the /plan endpoint first and save the plan.' });
      }

      const executionPlanStr = typeof parsedTask.execution_plan === 'string'
        ? parsedTask.execution_plan
        : JSON.stringify(parsedTask.execution_plan, null, 2);

      const systemPromptOverride = buildTaskExecuteSystemPrompt(project.name, task.title, executionPlanStr);
      const executePrompt = buildTaskExecuteUserMessage(parsedTask, parsedTask.execution_plan);

      await db.run("UPDATE coding_tasks SET status = 'in_progress', started_at = NOW(), updated_at = NOW() WHERE id = ?", req.params.tid);
      await db.run("UPDATE coding_projects SET status = 'implementation', current_phase = 5, updated_at = NOW() WHERE id = ?", req.params.id);

      res.json({
        executePrompt,
        systemPromptOverride,
        moduleId: 'coding-large-implementation',
        areaId: 'coding',
        status: 'in_progress',
        taskId: req.params.tid,
      });
    } catch (error) {
      console.error('[coding-large] Task execute error:', error);
      res.status(500).json({ error: 'Failed to execute task' });
    }
  });

  // ── Task Completion ───────────────────────────────────────────────────────

  router.post('/coding/projects/:id/tasks/:tid/complete', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const task = await db.get('SELECT * FROM coding_tasks WHERE id = ? AND coding_project_id = ?', req.params.tid, req.params.id) as any;
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const { completion_record, completion_notes } = req.body;
      if (!completion_record) return res.status(400).json({ error: 'completion_record is required' });

      const completionRecordStr = typeof completion_record === 'string' ? completion_record : JSON.stringify(completion_record);

      // Update task to completed
      await db.run(`
        UPDATE coding_tasks
        SET status = 'completed',
            completion_record = ?,
            completion_notes = ?,
            completed_at = NOW(),
            updated_at = NOW()
        WHERE id = ? AND coding_project_id = ?
      `, completionRecordStr, completion_notes || null, req.params.tid, req.params.id);

      // Check if all tasks in the release are completed
      let releaseUpdated = false;
      if (task.coding_release_id) {
        const pendingTasks = await db.get(`
          SELECT COUNT(*) as count FROM coding_tasks
          WHERE coding_release_id = ? AND status != 'completed'
        `, task.coding_release_id) as any;

        if (pendingTasks.count === 0) {
          await db.run(`
            UPDATE coding_releases
            SET status = 'review',
                updated_at = NOW()
            WHERE id = ?
          `, task.coding_release_id);
          releaseUpdated = true;
        }
      }

      res.json({
        taskId: req.params.tid,
        status: 'completed',
        releaseStatus: releaseUpdated ? 'review' : 'unchanged',
        message: releaseUpdated
          ? 'Task completed. All tasks in release are done — release moved to review.'
          : 'Task completed.',
      });
    } catch (error) {
      console.error('[coding-large] Task complete error:', error);
      res.status(500).json({ error: 'Failed to complete task' });
    }
  });

  // ── Workspace binding (Wave 5.2 — validated against ALLOWED_FOLDER_PATHS) ─

  // GET /api/coding/projects/:id/workspace — bind + test-command status
  router.get('/coding/projects/:id/workspace', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const validation = await validateWorkspacePath(project.directory_path);
      res.json({
        directory_path: project.directory_path || null,
        bound: !!project.directory_path,
        validation,
        test_command: parseTestCommand(project),
        limits: TEST_RUN_LIMITS,
        format_version: FILE_BLOCK_FORMAT_VERSION,
      });
    } catch (error) {
      console.error('[coding-large] Workspace status error:', error);
      res.status(500).json({ error: 'Failed to get workspace status' });
    }
  });

  // PUT /api/coding/projects/:id/workspace — bind (or unbind with null)
  router.put('/coding/projects/:id/workspace', async (req, res) => {
    try {
      const project = await db.get('SELECT id FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { directory_path } = req.body;
      if (directory_path === null || directory_path === '') {
        await db.run('UPDATE coding_projects SET directory_path = NULL, updated_at = NOW() WHERE id = ?', req.params.id);
        return res.json({ bound: false, directory_path: null });
      }
      if (typeof directory_path !== 'string') {
        return res.status(400).json({ error: 'directory_path must be a string (or null to unbind)' });
      }
      const validation = await validateWorkspacePath(directory_path);
      if (!validation.ok) {
        return res.status(403).json({ error: `Workspace not permitted: ${validation.error}`, validation });
      }
      await db.run('UPDATE coding_projects SET directory_path = ?, updated_at = NOW() WHERE id = ?', validation.resolved, req.params.id);
      res.json({ bound: true, directory_path: validation.resolved, validation });
    } catch (error) {
      console.error('[coding-large] Workspace bind error:', error);
      res.status(500).json({ error: 'Failed to bind workspace' });
    }
  });

  // PUT /api/coding/projects/:id/test-command — argv ARRAY, never a shell string
  router.put('/coding/projects/:id/test-command', async (req, res) => {
    try {
      const project = await db.get('SELECT id FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { argv } = req.body;
      if (argv === null) {
        await db.run('UPDATE coding_projects SET test_command = NULL, updated_at = NOW() WHERE id = ?', req.params.id);
        return res.json({ test_command: null });
      }
      const validated = validateTestArgv(argv);
      if (!validated.ok) return res.status(400).json({ error: validated.reason });
      await db.run('UPDATE coding_projects SET test_command = ?, updated_at = NOW() WHERE id = ?', JSON.stringify(validated.argv), req.params.id);
      res.json({ test_command: validated.argv, limits: TEST_RUN_LIMITS });
    } catch (error) {
      console.error('[coding-large] Test command error:', error);
      res.status(500).json({ error: 'Failed to save test command' });
    }
  });

  // GET /api/coding/projects/:id/atoms — the "LESSONS FROM THIS PROJECT" rail
  // (ANTON Studio P4/P5). Read-only: the project-scoped atoms the build minted
  // (test failures, panel flags, CVEs, decisions), newest first. No LLM call.
  router.get('/coding/projects/:id/atoms', async (req, res) => {
    try {
      const project = await db.get('SELECT id FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const limitRaw = parseInt(String(req.query.limit ?? '20'), 10);
      const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;
      let atoms: any[] = [];
      try {
        atoms = await db.all(
          `SELECT atom_type, atom_origin, content, confidence, category, created_at
             FROM knowledge_atoms
            WHERE coding_project_id = ?
            ORDER BY created_at DESC
            LIMIT ?`,
          req.params.id, limit,
        );
      } catch { atoms = []; /* un-migrated install — no scope column */ }
      res.json({ atoms });
    } catch (error) {
      console.error('[coding-large] Project atoms error:', error);
      res.status(500).json({ error: 'Failed to list project atoms' });
    }
  });

  // ── ANTON Studio Phase 6: container isolation (Docker) ───────────────────
  //
  // The HONEST CEILING made real (opt-in). When a project sets
  // environment_mode='docker' AND the operator enabled CODING_STUDIO_DOCKER AND
  // Docker is actually present, command runs are wrapped in `docker run` with
  // the workspace bind-mounted (network off by default) — hostile build/test
  // code runs in a throwaway container, not on the host. If ANY of those is
  // false we DO NOT claim isolation: runs fall back to the local execFile path
  // and we say so plainly.

  // GET /api/coding/projects/:id/container/probe — honest current state.
  router.get('/coding/projects/:id/container/probe', async (req, res) => {
    try {
      const project = await db.get(
        'SELECT environment_mode FROM coding_projects WHERE id = ?',
        req.params.id,
      ) as { environment_mode: string | null } | undefined;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const detection = await detectDocker();
      const enabledByFlag = containerEnabled();
      const requested = project.environment_mode === 'docker';
      // The mode the NEXT run would actually use — all three gates must pass.
      const effectiveMode: 'docker' | 'local' = requested && enabledByFlag && detection.available ? 'docker' : 'local';

      let reason: string;
      if (!requested) reason = 'Project is not in docker mode — runs locally (NOT isolated).';
      else if (!enabledByFlag) reason = `Docker mode requested but the operator has not enabled it (set ${CONTAINER_ENABLE_ENV}=1) — runs locally (NOT isolated).`;
      else if (!detection.available) reason = `Docker mode requested but Docker is unavailable: ${detection.error ?? 'unknown'} — runs locally (NOT isolated).`;
      else reason = 'Docker isolation active — build/test runs in a throwaway container with the workspace bind-mounted (network off by default).';

      res.json({
        dockerAvailable: detection.available,
        dockerVersion: detection.version ?? null,
        dockerError: detection.error ?? null,
        enabledByFlag,
        enableEnvVar: CONTAINER_ENABLE_ENV,
        environmentMode: project.environment_mode ?? null,
        requested,
        effectiveMode,
        isolated: effectiveMode === 'docker',
        reason,
      });
    } catch (error) {
      console.error('[coding-large] Container probe error:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  // POST /api/coding/projects/:id/container/mode — body {mode:'docker'|'local'}.
  // Sets environment_mode to 'docker' or back to 'auto'. Setting 'docker' while
  // it can't actually isolate still returns 200, but with an HONEST warning that
  // runs will fall back to local.
  router.post('/coding/projects/:id/container/mode', async (req, res) => {
    try {
      const project = await db.get(
        'SELECT id FROM coding_projects WHERE id = ?',
        req.params.id,
      ) as { id: string } | undefined;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const mode = req.body?.mode;
      if (mode !== 'docker' && mode !== 'local') {
        return res.status(400).json({ error: "mode must be 'docker' or 'local'" });
      }

      // 'local' clears the docker opt-in by restoring the default 'auto'.
      const environmentMode = mode === 'docker' ? 'docker' : 'auto';
      await db.run(
        'UPDATE coding_projects SET environment_mode = ?, updated_at = NOW() WHERE id = ?',
        environmentMode, req.params.id,
      );

      let warning: string | null = null;
      if (mode === 'docker') {
        const detection = await detectDocker();
        const enabledByFlag = containerEnabled();
        if (!enabledByFlag) {
          warning = `Docker mode is set, but the operator has not enabled it (set ${CONTAINER_ENABLE_ENV}=1). Until then, runs FALL BACK to local — NOT isolated.`;
        } else if (!detection.available) {
          warning = `Docker mode is set, but Docker is unavailable: ${detection.error ?? 'unknown'}. Until it is, runs FALL BACK to local — NOT isolated.`;
        }
      }

      res.json({
        environmentMode,
        warning,
        verification: mode === 'docker'
          ? (warning ? 'Mode saved, but isolation is NOT yet effective — see warning.' : 'Docker isolation is set and effective.')
          : 'Switched back to the local (auto) execFile path — NOT isolated.',
      });
    } catch (error) {
      console.error('[coding-large] Container mode error:', error);
      res.status(500).json({ error: safeError(error) });
    }
  });

  // ── ANTON Studio Phase 3: workspace + per-project DB provisioning ─────────
  //
  // On activation the project gets write/exec to exactly
  // coding-studio/<project-slug>/ (the studio root is auto-allowed by
  // getAllowedBases) AND a SEPARATE Postgres DATABASE proj_<slug> owned by a
  // least-privilege role studio_<slug> (LOCKED DECISION 3 — a separate DB, not
  // a schema; a separate DB cannot see anton/fc_* by construction). The grant
  // IS the bind row (directory_path) + the encrypted scoped DSN in the vault.
  //
  // HONEST SECURITY CEILING (see coding-studio-provisioner.ts):
  //   • The sandbox network is NOT blocked; this is execFile in a local process,
  //     NOT a container. cargo/pip/npm need network and a malicious
  //     build.rs/setup.py runs arbitrary code. A true jail needs Docker/Firejail
  //     (P6 — environment_mode='docker' reserved).
  //   • No CPU/mem/disk caps yet — only the wall-clock timeout + 1 MB output cap.
  //     Follow-up: a coding-studio/ disk-usage check + CARGO_TARGET_DIR cleanup.
  //   • The generated DB password is NEVER logged.

  // POST /api/coding/projects/:id/workspace/provision
  router.post('/coding/projects/:id/workspace/provision', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      // Slug derives from the SERVER-minted project id — NEVER LLM text.
      let slug: string;
      try {
        slug = deriveProjectSlug(req.params.id);
      } catch {
        return res.status(400).json({ error: 'Cannot derive a safe workspace slug from this project id.' });
      }

      // 1. mkdir coding-studio/<slug>/ and bind it via the EXISTING validators
      //    (the studio root is auto-allowed, so this passes without the operator
      //    editing ALLOWED_FOLDER_PATHS — the one safe widening).
      const studioRoot = getCodingStudioRoot();
      const workspaceDir = path.join(studioRoot, slug);
      await mkdir(workspaceDir, { recursive: true });
      const wsValidation = await validateWorkspacePath(workspaceDir);
      if (!wsValidation.ok || !wsValidation.resolved) {
        return res.status(500).json({
          error: `Provisioned workspace failed validation: ${wsValidation.error}`,
          validation: wsValidation,
        });
      }

      // 2. Provision the SEPARATE database. CREATE DATABASE needs CREATEDB on the
      //    connecting role — if it's missing, return a CLEAR actionable error and
      //    do NOT silently fall back to a schema or the server DB.
      const cap = await probeCreatedbCapability(db);
      if (!cap.ok) {
        return res.status(412).json({
          error: CREATEDB_HINT,
          createdb_capability: cap,
          verification: 'No database was created. The folder was created and bound; the DB step is blocked until the role can CREATE DATABASE/ROLE.',
        });
      }

      const dbName = projectDbName(slug);
      const roleName = projectRoleName(slug);
      const runner = makeDdlRunner(db);
      const serverDsn = getServerDsn();

      // Idempotent re-provision: tear down any prior DB/role for this project first.
      await teardownProjectDatabase({ runner, dbName, roleName }).catch(() => { /* first run — nothing to drop */ });

      const provisioned = await provisionProjectDatabase({ runner, serverDsn, slug });

      // 3. Store the scoped DSN ENCRYPTED in the vault (never logged/echoed).
      await storeScopedDsn(db, {
        codingProjectId: req.params.id,
        dbName: provisioned.dbName,
        roleName: provisioned.roleName,
        scopedDsn: provisioned.scopedDsn,
      });

      // 4. Bind the workspace + remember the studio language hint (no secrets here).
      const language = typeof req.body?.language === 'string' && ['typescript', 'python', 'rust', 'node'].includes(req.body.language)
        ? req.body.language as ToolchainLanguage
        : null;
      await db.run(
        'UPDATE coding_projects SET directory_path = ?, studio_language = COALESCE(?, studio_language), environment_mode = COALESCE(environment_mode, ?), updated_at = NOW() WHERE id = ?',
        wsValidation.resolved, language, 'local', req.params.id,
      );

      res.json({
        provisioned: true,
        workspace: {
          directory_path: wsValidation.resolved,
          // Display-only: where it sits relative to the studio root.
          studio_root: studioRoot,
        },
        database: {
          // Metadata only — the DSN/password are NEVER returned.
          db_name: provisioned.dbName,
          role_name: provisioned.roleName,
          scope: `A private Postgres database "${provisioned.dbName}" owned by least-privilege role "${provisioned.roleName}" — it cannot connect to ANTON's own database.`,
        },
        consent: 'ANTON Studio can read/write files in coding-studio/' + slug + '/ and use a private database; it cannot touch the rest of ANTON or your home folder.',
        verification: `Folder bound + private database provisioned. The scoped DSN is encrypted in the vault and injected only as PROJECT_DATABASE_URL into command runs.`,
      });
    } catch (error) {
      console.error('[coding-large] Provision error:', error);
      res.status(500).json({ error: 'Failed to provision workspace + database' });
    }
  });

  // GET /api/coding/projects/:id/toolchain — honest per-language detect-and-report.
  router.get('/coding/projects/:id/toolchain', async (req, res) => {
    try {
      const project = await db.get('SELECT id FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const toolchains = await probeAllToolchains();
      res.json({
        toolchains,
        presets: allLanguagePresets(),
        note: 'Detect-and-report only — ANTON does not install toolchains. A red status means the runtime is genuinely absent (never faked green).',
      });
    } catch (error) {
      console.error('[coding-large] Toolchain probe error:', error);
      res.status(500).json({ error: 'Failed to probe toolchains' });
    }
  });

  // GET /api/coding/projects/:id/commands — the per-project command set + DB scope.
  router.get('/coding/projects/:id/commands', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const meta = await getProvisionMeta(db, req.params.id);
      res.json({
        commands: {
          setup: parseCommandColumn(project.setup_command),
          build: parseCommandColumn(project.build_command),
          test: parseCommandColumn(project.test_command),
        },
        studio_language: project.studio_language ?? null,
        database: meta ? { db_name: meta.db_name, role_name: meta.role_name, provisioned_at: meta.provisioned_at } : null,
        presets: allLanguagePresets(),
        limits: TEST_RUN_LIMITS,
      });
    } catch (error) {
      console.error('[coding-large] Get commands error:', error);
      res.status(500).json({ error: 'Failed to get commands' });
    }
  });

  // PUT /api/coding/projects/:id/commands/:kind — argv ARRAY (never a shell), or null.
  router.put('/coding/projects/:id/commands/:kind', async (req, res) => {
    try {
      const kind = req.params.kind;
      if (!['setup', 'build', 'test'].includes(kind)) {
        return res.status(400).json({ error: "kind must be 'setup', 'build', or 'test'" });
      }
      const column = kind === 'setup' ? 'setup_command' : kind === 'build' ? 'build_command' : 'test_command';
      const project = await db.get('SELECT id FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { argv } = req.body;
      if (argv === null) {
        await db.run(`UPDATE coding_projects SET ${column} = NULL, updated_at = NOW() WHERE id = ?`, req.params.id);
        return res.json({ kind, command: null });
      }
      const validated = validateTestArgv(argv);
      if (!validated.ok) return res.status(400).json({ error: validated.reason });
      await db.run(`UPDATE coding_projects SET ${column} = ?, updated_at = NOW() WHERE id = ?`, JSON.stringify(validated.argv), req.params.id);
      res.json({ kind, command: validated.argv, limits: TEST_RUN_LIMITS });
    } catch (error) {
      console.error('[coding-large] Save command error:', error);
      res.status(500).json({ error: 'Failed to save command' });
    }
  });

  // POST /api/coding/projects/:id/commands/:kind/apply-preset — seed from a language preset.
  router.post('/coding/projects/:id/commands/apply-preset', async (req, res) => {
    try {
      const project = await db.get('SELECT id FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const language = req.body?.language;
      if (!['typescript', 'python', 'rust', 'node'].includes(language)) {
        return res.status(400).json({ error: 'language must be typescript, python, rust, or node' });
      }
      const preset = languagePreset(language as ToolchainLanguage);
      await db.run(
        'UPDATE coding_projects SET setup_command = ?, build_command = ?, test_command = ?, studio_language = ?, updated_at = NOW() WHERE id = ?',
        preset.setup_command ? JSON.stringify(preset.setup_command) : null,
        preset.build_command ? JSON.stringify(preset.build_command) : null,
        preset.test_command ? JSON.stringify(preset.test_command) : null,
        language, req.params.id,
      );
      res.json({ applied: language, preset });
    } catch (error) {
      console.error('[coding-large] Apply preset error:', error);
      res.status(500).json({ error: 'Failed to apply preset' });
    }
  });

  // POST /api/coding/projects/:id/commands/:kind/run
  // Generalises /tests/run to setup/build/test. Same gate: explicit approval +
  // execFile (no shell). The build/test commands are arbitrary code execution
  // BY DESIGN. The build-gate guard refuses to run code while a mandatory
  // core-team role dissents at the BUILD gate (the enforced governance gate).
  router.post('/coding/projects/:id/commands/:kind/run', async (req, res) => {
    try {
      const kind = req.params.kind;
      if (!['setup', 'build', 'test'].includes(kind)) {
        return res.status(400).json({ error: "kind must be 'setup', 'build', or 'test'" });
      }
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { approved, coding_task_id = null } = req.body;
      if (approved !== true) {
        return res.status(400).json({
          error: `Explicit approval required: this executes your configured ${kind} command in the workspace (arbitrary code execution by design). Send approved: true from the confirmation UI.`,
        });
      }

      // GATE GUARD: a blocking BUILD-gate dissent halts code execution. A gate
      // that was never reviewed does NOT block (the panel has not spoken).
      try {
        await assertGatePassed(db, req.params.id, 'build');
      } catch (gateErr) {
        if (gateErr instanceof GateBlockedError) {
          return res.status(409).json({
            error: gateErr.message,
            gate: gateErr.gate,
            gate_status: gateErr.status,
            verification: 'Nothing was executed — resolve the blocking core-team dissent at the build gate and re-run the panel first.',
          });
        }
        throw gateErr;
      }

      const column = kind === 'setup' ? 'setup_command' : kind === 'build' ? 'build_command' : 'test_command';
      const argvRaw = parseCommandColumn(project[column]);
      if (!argvRaw) {
        return res.status(400).json({
          error: `No ${kind} command configured for this project. Set one (as an argv array) or apply a language preset first.`,
          verification: `${kind}: not configured.`,
        });
      }
      const validated = validateTestArgv(argvRaw);
      if (!validated.ok) return res.status(400).json({ error: `Stored ${kind} command is invalid: ${validated.reason}` });

      const validation = await validateWorkspacePath(project.directory_path);
      if (!validation.ok || !validation.resolved) {
        return res.status(403).json({ error: `Workspace not available: ${validation.error}`, validation });
      }

      // Inject ONLY the scoped PROJECT_DATABASE_URL (the server DATABASE_URL is
      // always stripped). null when the project was never provisioned.
      const projectDatabaseUrl = await resolveScopedDsn(db, req.params.id);

      // ── Phase 6: docker-or-local decision (single honest decision point) ──
      // resolveExecution returns the REAL mode. docker only when the project
      // opted in + the operator flag is on + Docker actually answers; else
      // local with a reason. setup needs network (install) → bridge; build/test
      // default to network OFF (max isolation — the honest win).
      const { resolveExecution } = await import('../services/coding-container.js');
      const decision = await resolveExecution({
        environmentMode: project.environment_mode ?? null,
        language: project.studio_language ?? null,
        workspaceAbs: validation.resolved,
        projectDatabaseUrl,
        networkMode: kind === 'setup' ? 'bridge' : 'none',
      });

      const result = await runProjectTests({
        argv: validated.argv,
        cwd: validation.resolved,
        projectDatabaseUrl,
        containerMode: decision.mode,
        containerImage: decision.image,
        language: project.studio_language ?? undefined,
        containerNetwork: kind === 'setup' ? 'bridge' : 'none',
      });
      const combinedTail = [result.stdoutTail, result.stderrTail].filter(Boolean).join('\n');
      const summary = parseTestSummary(combinedTail);
      const succeeded = result.ran && result.exitCode === 0 && !result.timedOut;

      // Persist test runs the same way /tests/run does so the loop sees them;
      // setup/build outcomes go on the task progress log only.
      let testRunId: string | null = null;
      if (kind === 'test') {
        testRunId = randomUUID();
        await db.run(`
          INSERT INTO coding_test_runs
            (id, coding_project_id, coding_task_id, test_type, test_suite_name,
             results, pass_count, fail_count, skip_count, total_count, duration_ms,
             executed, command, exit_code, timed_out, output_tail, run_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
        `, testRunId, req.params.id, coding_task_id, 'unit', validated.argv.join(' '),
          JSON.stringify({
            executed: true, kind, argv: validated.argv, cwd: validation.resolved,
            exit_code: result.exitCode, timed_out: result.timedOut,
            spawn_error: result.spawnError ?? null, output_truncated: result.outputTruncated,
            summary_recognized: summary.recognized, used_project_database_url: !!projectDatabaseUrl,
            limits: TEST_RUN_LIMITS,
          }),
          summary.pass_count, summary.fail_count, summary.skip_count,
          summary.pass_count + summary.fail_count + summary.skip_count,
          result.durationMs, JSON.stringify(validated.argv), result.exitCode,
          result.timedOut ? 1 : 0, combinedTail, (req as any).userId || 'system');
      }

      // ── Studio P4: project-scoped atom capture for the test command path ────
      // (the multi-language /commands/test runner mirrors /tests/run). Only the
      // 'test' kind is a pass/fail learning signal; setup/build are not.
      if (kind === 'test' && result.ran) {
        try {
          let afterRevision = false;
          if (succeeded && coding_task_id) {
            const rev = await db.get(
              `SELECT 1 AS x FROM coding_workspace_applications
               WHERE coding_task_id = ? AND coding_project_id = ? AND kind = 'revision' LIMIT 1`,
              coding_task_id, req.params.id) as { x: number } | undefined;
            afterRevision = !!rev;
          }
          const integration = await createCodingIntegration(db);
          integration.captureTestResult({
            projectId: req.params.id,
            taskId: coding_task_id,
            passed: succeeded,
            afterRevision,
            argv: validated.argv,
            outputTail: combinedTail,
          });
        } catch { /* atom capture must never break a command run */ }
      }

      // Honest mode suffix: docker = host-isolated; local = NOT isolated.
      const modeNote = result.executionMode === 'docker'
        ? ' [ran in a Docker container — host-isolated]'
        : ` [ran locally — NOT isolated: ${decision.reason ?? 'local mode'}]`;
      const honest = (!result.ran
        ? `${kind} command could not be started (${result.spawnError ?? 'spawn error'}). Nothing was verified.`
        : result.timedOut
          ? `${kind} TIMED OUT after ${TEST_RUN_LIMITS.timeout_ms} ms — treated as failed.`
          : succeeded
            ? `${kind} succeeded (exit 0, ${result.durationMs} ms).`
            : `${kind} FAILED (exit ${result.exitCode ?? '?'}, ${result.durationMs} ms).`) + modeNote;

      res.json({
        kind,
        testRunId,
        executed: true,
        succeeded,
        ran: result.ran,
        exit_code: result.exitCode,
        timed_out: result.timedOut,
        duration_ms: result.durationMs,
        pass_count: summary.pass_count,
        fail_count: summary.fail_count,
        skip_count: summary.skip_count,
        summary_recognized: summary.recognized,
        output_tail: combinedTail,
        spawn_error: result.spawnError ?? null,
        hint: result.hint ?? null,
        used_project_database_url: !!projectDatabaseUrl,
        // The REAL mode used + WHY local (honest — never claim isolation falsely).
        execution_mode: result.executionMode ?? 'local',
        isolated: result.executionMode === 'docker',
        mode_reason: decision.reason ?? null,
        verification: honest,
      });
    } catch (error) {
      console.error('[coding-large] Command run error:', error);
      res.status(500).json({ error: 'Failed to run command' });
    }
  });

  // DELETE /api/coding/projects/:id — tear down the per-project DB + role.
  // The FK cascade drops the vault row; the real Postgres DATABASE + ROLE must
  // be dropped explicitly (a cascade can't drop them).
  router.delete('/coding/projects/:id', async (req, res) => {
    try {
      const project = await db.get('SELECT id FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const meta = await getProvisionMeta(db, req.params.id);
      let databaseDropped = false;
      let dropError: string | null = null;
      if (meta) {
        try {
          await teardownProjectDatabase({ runner: makeDdlRunner(db), dbName: meta.db_name, roleName: meta.role_name });
          databaseDropped = true;
        } catch (err) {
          // Honest: do NOT delete the project record if we couldn't drop the DB,
          // otherwise the orphaned database + role leak with no record to clean up.
          dropError = err instanceof Error ? err.message : 'drop failed';
        }
        if (dropError) {
          return res.status(500).json({
            error: `Failed to drop the per-project database/role: ${dropError}`,
            verification: 'The project was NOT deleted so the database can be retried/cleaned up manually.',
          });
        }
        await deleteProvisionRecord(db, req.params.id);
      }

      await db.run('DELETE FROM coding_projects WHERE id = ?', req.params.id);
      res.json({
        deleted: true,
        database_dropped: databaseDropped,
        verification: databaseDropped
          ? `Project deleted; private database "${meta?.db_name}" and role "${meta?.role_name}" dropped.`
          : 'Project deleted (no provisioned database to drop).',
      });
    } catch (error) {
      console.error('[coding-large] Delete project error:', error);
      res.status(500).json({ error: 'Failed to delete project' });
    }
  });

  // ── Apply-to-workspace (Wave 5.2 — parse → diff → review → approve) ───────

  // POST /api/coding/projects/:id/tasks/:tid/apply/preview
  // Parses anton-coding-file-blocks/v1 blocks out of the LLM response and
  // returns a deterministic per-file diff. NOTHING is written here.
  router.post('/coding/projects/:id/tasks/:tid/apply/preview', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const task = await db.get('SELECT id FROM coding_tasks WHERE id = ? AND coding_project_id = ?', req.params.tid, req.params.id) as any;
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const { response_text, kind = 'initial', revision_of_test_run_id = null } = req.body;
      if (!response_text || typeof response_text !== 'string') {
        return res.status(400).json({ error: 'response_text is required' });
      }
      if (kind !== 'initial' && kind !== 'revision') {
        return res.status(400).json({ error: "kind must be 'initial' or 'revision'" });
      }

      // Workspace must be bound + valid at every use (not just bind time).
      const validation = await validateWorkspacePath(project.directory_path);
      if (!validation.ok || !validation.resolved) {
        return res.status(403).json({ error: `Workspace not available: ${validation.error}`, validation });
      }
      const workspaceAbs = validation.resolved;

      const parsed = parseFileBlocks(response_text);
      if (parsed.files.length === 0) {
        return res.status(422).json({
          error: 'No applicable file blocks found in the response.',
          format_version: parsed.formatVersion,
          rejected_blocks: parsed.rejected,
          ignored_blocks: parsed.ignoredBlocks,
          verification: 'Nothing was parsed and nothing was written.',
        });
      }

      // Deterministic diff per file against the current workspace content.
      const oldContents = new Map<string, string | null>();
      const diffs: FileDiff[] = [];
      for (const file of parsed.files) {
        const target = resolveTargetPath(workspaceAbs, file.path);
        if (!target) {
          // validateRelativePath passed but resolve escaped — refuse hard.
          parsed.rejected.push({ reason: 'resolved path escapes the workspace', path: file.path });
          continue;
        }
        let old: string | null = null;
        try { old = await readFile(target, 'utf8'); } catch { /* new file */ }
        oldContents.set(file.path, old);
        diffs.push(buildFileDiff(file.path, old, file.content));
      }
      const applicableFiles = parsed.files.filter((f) => oldContents.has(f.path));
      if (applicableFiles.length === 0) {
        return res.status(422).json({
          error: 'Every parsed file block was rejected.',
          format_version: parsed.formatVersion,
          rejected_blocks: parsed.rejected,
          verification: 'Nothing was written.',
        });
      }

      const record = buildApplicationRecord(applicableFiles, diffs, oldContents);

      const applicationId = randomUUID();
      await db.run(`
        INSERT INTO coding_workspace_applications
          (id, coding_project_id, coding_task_id, status, kind, revision_of_test_run_id,
           format_version, workspace_path, files, rejected_blocks, diff_summary, created_by)
        VALUES (?, ?, ?, 'proposed', ?, ?, ?, ?, ?, ?, ?, ?)
      `, applicationId, req.params.id, req.params.tid, kind, revision_of_test_run_id,
        parsed.formatVersion, workspaceAbs, JSON.stringify(record.files),
        JSON.stringify(parsed.rejected), JSON.stringify(record.diff_summary),
        (req as any).userId || 'system');

      res.json({
        applicationId,
        format_version: parsed.formatVersion,
        workspace: workspaceAbs,
        kind,
        files: diffs.map((d) => ({
          path: d.path,
          action: d.action,
          stats: d.stats,
          chunks: compactChunks(d.chunks),
        })),
        rejected_blocks: parsed.rejected,
        duplicates: parsed.duplicates,
        ignored_blocks: parsed.ignoredBlocks,
        totals: record.diff_summary.totals,
        verification: `Parsed ${applicableFiles.length} file block(s); ${parsed.rejected.length} rejected. No files written — review the diff and approve to apply.`,
      });
    } catch (error) {
      console.error('[coding-large] Apply preview error:', error);
      res.status(500).json({ error: 'Failed to build apply preview' });
    }
  });

  // GET /api/coding/projects/:id/applications — list (content stripped)
  router.get('/coding/projects/:id/applications', async (req, res) => {
    try {
      const taskId = req.query.task_id as string | undefined;
      let sql = 'SELECT * FROM coding_workspace_applications WHERE coding_project_id = ?';
      const params: any[] = [req.params.id];
      if (taskId) { sql += ' AND coding_task_id = ?'; params.push(taskId); }
      sql += ' ORDER BY created_at DESC LIMIT 100';
      const rows = await db.all(sql, ...params);
      res.json(rows.map(parseApplication));
    } catch (error) {
      console.error('[coding-large] List applications error:', error);
      res.status(500).json({ error: 'Failed to list applications' });
    }
  });

  // GET /api/coding/projects/:id/applications/:aid
  router.get('/coding/projects/:id/applications/:aid', async (req, res) => {
    try {
      const row = await db.get('SELECT * FROM coding_workspace_applications WHERE id = ? AND coding_project_id = ?', req.params.aid, req.params.id);
      if (!row) return res.status(404).json({ error: 'Application not found' });
      res.json(parseApplication(row));
    } catch (error) {
      console.error('[coding-large] Get application error:', error);
      res.status(500).json({ error: 'Failed to get application' });
    }
  });

  // POST /api/coding/projects/:id/applications/:aid/approve — THE write gate.
  // Explicit user approval; re-validates the workspace and every path;
  // backs originals up to .anton-coding-backup/<timestamp>/ before writing.
  router.post('/coding/projects/:id/applications/:aid/approve', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const app = await db.get('SELECT * FROM coding_workspace_applications WHERE id = ? AND coding_project_id = ?', req.params.aid, req.params.id) as any;
      if (!app) return res.status(404).json({ error: 'Application not found' });
      if (app.status !== 'proposed') {
        return res.status(409).json({ error: `Application is '${app.status}' — only proposed applications can be approved.` });
      }

      // Re-validate at use time (allowlist or binding may have changed).
      const validation = await validateWorkspacePath(project.directory_path);
      if (!validation.ok || !validation.resolved) {
        return res.status(403).json({ error: `Workspace not available: ${validation.error}`, validation });
      }
      if (validation.resolved !== app.workspace_path) {
        return res.status(409).json({
          error: 'The project workspace changed since this preview was computed. Re-run the preview against the current workspace.',
        });
      }

      const files = JSON.parse(app.files || '[]') as ApplicationFileEntry[];
      const writable = files.filter((f) => typeof f.content === 'string');
      if (writable.length === 0) {
        return res.status(409).json({ error: 'Application has no reviewable content to write (already consumed?).' });
      }

      // Serialize concurrent approves for the SAME project so two applications
      // touching overlapping files don't interleave writes/backups. A
      // transaction-scoped advisory lock (pg_advisory_xact_lock, auto-released
      // at commit, pinned to one pooled client) keyed on the project id, plus
      // an atomic status claim inside the lock (proposed→applied via a
      // conditional UPDATE) so a second concurrent approve is rejected rather
      // than double-applying.
      let result: Awaited<ReturnType<typeof applyFilesToWorkspace>>;
      let conflict = false;
      let writeError: string | null = null;
      try {
        await db.transaction(async (tx) => {
          await tx.run('SELECT pg_advisory_xact_lock(hashtext(?))', `coding-apply:${req.params.id}`);

          // Atomic claim: only the first approve flips proposed→applied.
          const claim = await tx.run(
            "UPDATE coding_workspace_applications SET status = 'applied', applied_at = NOW() WHERE id = ? AND status = 'proposed'",
            app.id,
          );
          if (!claim.changes) { conflict = true; return; }

          // Write under the lock (real FS apply).
          result = await applyFilesToWorkspace({
            workspaceAbs: validation.resolved!,
            files: writable.map((f) => ({ path: f.path, content: f.content as string })),
            applicationId: app.id,
          });

          // Persist outcome; clear content now that it has been consumed.
          const written = files.map((f) => {
            const r = result.files.find((x) => x.path === f.path);
            return {
              path: f.path, action: r?.action ?? f.action, bytes: f.bytes,
              hash_new: f.hash_new, hash_before: r?.hash_before ?? f.hash_before, hash_after: r?.hash_after,
            };
          });
          await tx.run(
            'UPDATE coding_workspace_applications SET files = ?, backup_dir = ? WHERE id = ?',
            JSON.stringify(written), result.backupDir || null, app.id,
          );
        });
      } catch (writeErr) {
        writeError = writeErr instanceof Error ? writeErr.message : 'write failed';
      }

      if (conflict) {
        return res.status(409).json({ error: "Application is no longer 'proposed' (a concurrent approve won) — nothing was written by this request." });
      }
      if (writeError) {
        await db.run("UPDATE coding_workspace_applications SET status = 'failed', error_message = ? WHERE id = ?", writeError, app.id);
        return res.status(500).json({
          error: `Apply failed: ${writeError}`,
          verification: 'Application marked failed. Some files may have been written before the failure — check the backup manifest in .anton-coding-backup/.',
        });
      }
      result = result!;

      // Honest progress entry on the task.
      if (app.coding_task_id) {
        const task = await db.get('SELECT progress_log FROM coding_tasks WHERE id = ?', app.coding_task_id) as any;
        if (task) {
          const log = JSON.parse(task.progress_log || '[]');
          log.push({
            timestamp: new Date().toISOString(),
            step: `Applied to workspace: ${result.written} file(s) written, ${result.unchanged} unchanged (backup: ${result.backupDir || 'none needed'})`,
            status: 'completed',
          });
          await db.run('UPDATE coding_tasks SET progress_log = ?, updated_at = NOW() WHERE id = ?', JSON.stringify(log), app.coding_task_id);
        }
      }

      res.json({
        applicationId: app.id,
        status: 'applied',
        written: result.written,
        unchanged: result.unchanged,
        backup_dir: result.backupDir || null,
        files: result.files,
        verification: `Files written: ${result.written} (${result.unchanged} unchanged). Originals backed up to ${result.backupDir || 'n/a (only new files)'}. Tests: not run yet.`,
      });
    } catch (error) {
      console.error('[coding-large] Apply approve error:', error);
      res.status(500).json({ error: 'Failed to apply files' });
    }
  });

  // POST /api/coding/projects/:id/applications/:aid/reject
  router.post('/coding/projects/:id/applications/:aid/reject', async (req, res) => {
    try {
      const app = await db.get('SELECT id, status FROM coding_workspace_applications WHERE id = ? AND coding_project_id = ?', req.params.aid, req.params.id) as any;
      if (!app) return res.status(404).json({ error: 'Application not found' });
      if (app.status !== 'proposed') {
        return res.status(409).json({ error: `Application is '${app.status}' — only proposed applications can be rejected.` });
      }
      // Drop the staged content too — a rejected proposal is not writable later.
      const row = await db.get('SELECT files FROM coding_workspace_applications WHERE id = ?', req.params.aid) as any;
      const files = (JSON.parse(row?.files || '[]') as ApplicationFileEntry[]).map((f) => ({
        path: f.path, action: f.action, bytes: f.bytes, hash_new: f.hash_new, hash_before: f.hash_before,
      }));
      await db.run("UPDATE coding_workspace_applications SET status = 'rejected', files = ? WHERE id = ?", JSON.stringify(files), req.params.aid);
      res.json({ applicationId: req.params.aid, status: 'rejected', verification: 'No files were written.' });
    } catch (error) {
      console.error('[coding-large] Apply reject error:', error);
      res.status(500).json({ error: 'Failed to reject application' });
    }
  });

  // ── Real test execution (Wave 5.2 — approval-gated, execFile, no shell) ───

  // POST /api/coding/projects/:id/tests/run
  // Runs the user-configured test command (argv array) in the workspace.
  // This is arbitrary code execution BY DESIGN (the user configured the
  // command), so every run requires approved:true from an explicit UI action.
  router.post('/coding/projects/:id/tests/run', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { approved, coding_task_id = null, coding_release_id = null, test_type = 'unit' } = req.body;
      if (approved !== true) {
        return res.status(400).json({
          error: 'Explicit approval required: this executes your configured test command in the workspace (arbitrary code execution by design). Send approved: true from the confirmation UI.',
        });
      }
      const VALID_TEST_TYPES = ['unit', 'integration', 'regression', 'acceptance', 'security', 'performance'];
      if (!VALID_TEST_TYPES.includes(test_type)) {
        return res.status(400).json({ error: `test_type must be one of: ${VALID_TEST_TYPES.join(', ')}` });
      }

      const argvRaw = parseTestCommand(project);
      if (!argvRaw) {
        return res.status(400).json({
          error: 'No test command configured for this project. Set one (as an argv array) in the workspace settings first.',
          verification: 'Tests: not configured.',
        });
      }
      const validated = validateTestArgv(argvRaw);
      if (!validated.ok) return res.status(400).json({ error: `Stored test command is invalid: ${validated.reason}` });

      const validation = await validateWorkspacePath(project.directory_path);
      if (!validation.ok || !validation.resolved) {
        return res.status(403).json({ error: `Workspace not available: ${validation.error}`, validation });
      }

      const result = await runProjectTests({ argv: validated.argv, cwd: validation.resolved });
      const combinedTail = [result.stdoutTail, result.stderrTail].filter(Boolean).join('\n');
      const summary = parseTestSummary(combinedTail);
      const passed = result.ran && result.exitCode === 0 && !result.timedOut;

      const id = randomUUID();
      await db.run(`
        INSERT INTO coding_test_runs
          (id, coding_project_id, coding_release_id, coding_task_id, test_type, test_suite_name,
           results, pass_count, fail_count, skip_count, total_count, duration_ms,
           executed, command, exit_code, timed_out, output_tail, run_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
      `, id, req.params.id, coding_release_id, coding_task_id, test_type, validated.argv.join(' '),
        JSON.stringify({
          executed: true,
          argv: validated.argv,
          cwd: validation.resolved,
          exit_code: result.exitCode,
          timed_out: result.timedOut,
          spawn_error: result.spawnError ?? null,
          output_truncated: result.outputTruncated,
          summary_recognized: summary.recognized,
          limits: TEST_RUN_LIMITS,
        }),
        summary.pass_count, summary.fail_count, summary.skip_count,
        summary.pass_count + summary.fail_count + summary.skip_count,
        result.durationMs, JSON.stringify(validated.argv), result.exitCode,
        result.timedOut ? 1 : 0, combinedTail, (req as any).userId || 'system');

      // Reflect the real result on the task.
      if (coding_task_id) {
        await db.run('UPDATE coding_tasks SET test_results = ?, updated_at = NOW() WHERE id = ? AND coding_project_id = ?',
          JSON.stringify({ test_run_id: id, executed: true, passed, exit_code: result.exitCode, timed_out: result.timedOut, pass_count: summary.pass_count, fail_count: summary.fail_count, run_at: new Date().toISOString() }),
          coding_task_id, req.params.id);
      }

      // ── Studio P4: project-scoped atom capture (fire-and-forget, no-LLM) ────
      // FAILED → test.failed; PASSED after a prior kind='revision' → pattern.works.
      if (result.ran) {
        try {
          let afterRevision = false;
          if (passed && coding_task_id) {
            const rev = await db.get(
              `SELECT 1 AS x FROM coding_workspace_applications
               WHERE coding_task_id = ? AND coding_project_id = ? AND kind = 'revision' LIMIT 1`,
              coding_task_id, req.params.id) as { x: number } | undefined;
            afterRevision = !!rev;
          }
          const integration = await createCodingIntegration(db);
          integration.captureTestResult({
            projectId: req.params.id,
            taskId: coding_task_id,
            passed,
            afterRevision,
            argv: validated.argv,
            outputTail: combinedTail,
          });
        } catch { /* atom capture must never break a test run */ }
      }

      const honest = !result.ran
        ? `Test command could not be started (${result.spawnError ?? 'spawn error'}). Nothing was verified.`
        : result.timedOut
          ? `Tests TIMED OUT after ${TEST_RUN_LIMITS.timeout_ms} ms — treated as failed.`
          : passed
            ? (summary.recognized
              ? `Tests PASSED — ${summary.pass_count} passed${summary.fail_count ? `, ${summary.fail_count} failed` : ''}${summary.skip_count ? `, ${summary.skip_count} skipped` : ''} (exit 0, ${result.durationMs} ms).`
              : `Tests PASSED (exit 0, ${result.durationMs} ms) — counts not parseable from output.`)
            : (summary.recognized
              ? `Tests FAILED — ${summary.fail_count} failed, ${summary.pass_count} passed (exit ${result.exitCode}, ${result.durationMs} ms).`
              : `Tests FAILED (exit ${result.exitCode ?? '?'}, ${result.durationMs} ms) — counts not parseable from output.`);

      res.json({
        testRunId: id,
        executed: true,
        passed,
        ran: result.ran,
        exit_code: result.exitCode,
        timed_out: result.timedOut,
        duration_ms: result.durationMs,
        pass_count: summary.pass_count,
        fail_count: summary.fail_count,
        skip_count: summary.skip_count,
        summary_recognized: summary.recognized,
        output_tail: combinedTail,
        spawn_error: result.spawnError ?? null,
        hint: result.hint ?? null,
        verification: honest,
      });
    } catch (error) {
      console.error('[coding-large] Test run error:', error);
      res.status(500).json({ error: 'Failed to run tests' });
    }
  });

  // POST /api/coding/projects/:id/tasks/:tid/revise — feed REAL failures back.
  // ONE revise round per failed test run; the user reviews + approves the
  // resulting diff like any other application. No unattended iteration.
  router.post('/coding/projects/:id/tasks/:tid/revise', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });
      const task = await db.get('SELECT * FROM coding_tasks WHERE id = ? AND coding_project_id = ?', req.params.tid, req.params.id) as any;
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const { test_run_id } = req.body;
      if (!test_run_id) return res.status(400).json({ error: 'test_run_id is required' });

      const run = await db.get('SELECT * FROM coding_test_runs WHERE id = ? AND coding_project_id = ?', test_run_id, req.params.id) as any;
      if (!run) return res.status(404).json({ error: 'Test run not found' });
      if (!run.executed) {
        return res.status(400).json({ error: 'That test run was never actually executed — only real failures can seed a revision.' });
      }
      const runTimedOut = run.timed_out === 1 || run.timed_out === true;
      if (run.exit_code === 0 && !runTimedOut) {
        return res.status(400).json({ error: 'That test run passed — nothing to revise.' });
      }

      // ONE round per failure — claimed atomically on the test run itself
      // (migration 233). Two concurrent /revise calls race on this conditional
      // UPDATE; only the one that flips revision_requested 0→1 proceeds. The
      // old check (a coding_workspace_applications row) was insufficient because
      // that row isn't created until apply-preview runs much later, so both
      // callers saw "no existing revision" and both seeded a round.
      const claim = await db.run(`
        UPDATE coding_test_runs
        SET revision_requested = 1
        WHERE id = ? AND coding_project_id = ? AND COALESCE(revision_requested, 0) = 0
      `, test_run_id, req.params.id);
      if (!claim.changes) {
        return res.status(409).json({
          error: 'The single revision round for this test failure was already used. Re-run the tests (or revise manually) before another AI round.',
        });
      }

      // Context: what the last applied application wrote.
      const lastApplied = await db.get(`
        SELECT files FROM coding_workspace_applications
        WHERE coding_task_id = ? AND status = 'applied'
        ORDER BY applied_at DESC LIMIT 1
      `, req.params.tid) as any;
      const appliedFiles = lastApplied
        ? (JSON.parse(lastApplied.files || '[]') as ApplicationFileEntry[]).map((f) => ({ path: f.path, action: f.action }))
        : [];

      const argv = (JSON.parse(run.command || '[]') as string[]);
      const systemPromptOverride = buildTaskReviseSystemPrompt(project.name, task.title);
      const revisePrompt = buildTaskReviseUserMessage({
        taskTitle: task.title,
        testCommand: argv.length ? argv : ['(unknown command)'],
        exitCode: run.exit_code ?? null,
        timedOut: runTimedOut,
        outputTail: (run.output_tail || '(no output captured)').slice(-12_000),
        appliedFiles,
      });

      res.json({
        revisePrompt,
        systemPromptOverride,
        moduleId: 'coding-large-implementation',
        areaId: 'coding',
        taskId: req.params.tid,
        revision_of_test_run_id: test_run_id,
        verification: 'Single revision round: the response must go through apply-preview → your approval → another approved test run. Nothing runs unattended.',
      });
    } catch (error) {
      console.error('[coding-large] Revise error:', error);
      res.status(500).json({ error: 'Failed to build revision prompt' });
    }
  });

  // ── Test Runs ────────────────────────────────────────────────────────────

  router.get('/coding/projects/:id/tests', async (req, res) => {
    try {
      const tests = await db.all('SELECT * FROM coding_test_runs WHERE coding_project_id = ? ORDER BY run_at DESC LIMIT 50', req.params.id);
      res.json(tests.map((t: any) => ({
        ...t,
        results: JSON.parse(t.results || '{}'),
        command: t.command ? JSON.parse(t.command) : null,
        executed: !!t.executed,
        timed_out: !!t.timed_out,
      })));
    } catch (error) {
      console.error('[coding-large] List tests error:', error);
      res.status(500).json({ error: 'Failed to list tests' });
    }
  });

  router.post('/coding/projects/:id/tests', async (req, res) => {
    try {
      const { test_type, test_suite_name, results = {}, pass_count = 0, fail_count = 0, skip_count = 0, duration_ms, coding_release_id, coding_task_id } = req.body;
      if (!test_type) return res.status(400).json({ error: 'test_type is required' });

      const id = randomUUID();
      await db.run(`
        INSERT INTO coding_test_runs (id, coding_project_id, coding_release_id, coding_task_id, test_type, test_suite_name, results, pass_count, fail_count, skip_count, total_count, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, req.params.id, coding_release_id || null, coding_task_id || null, test_type, test_suite_name || null, JSON.stringify(results), pass_count, fail_count, skip_count, pass_count + fail_count + skip_count, duration_ms || null);

      res.json({
        id, test_type, pass_count, fail_count,
        executed: false,
        verification: 'Self-reported record only — ANTON did not execute these tests. Use POST /tests/run for a real, verified run.',
      });
    } catch (error) {
      console.error('[coding-large] Create test run error:', error);
      res.status(500).json({ error: 'Failed to create test run' });
    }
  });

  // ── Tech Debt ────────────────────────────────────────────────────────────

  router.get('/coding/projects/:id/tech-debt', async (req, res) => {
    try {
      const status = req.query.status as string;
      let sql = 'SELECT * FROM coding_tech_debt WHERE coding_project_id = ?';
      const params: any[] = [req.params.id];
      if (status) { sql += ' AND status = ?'; params.push(status); }
      sql += ' ORDER BY CASE severity WHEN \'critical\' THEN 0 WHEN \'high\' THEN 1 WHEN \'medium\' THEN 2 ELSE 3 END';
      res.json(await db.run(sql, ...params));
    } catch (error) {
      console.error('[coding-large] List tech debt error:', error);
      res.status(500).json({ error: 'Failed to list tech debt' });
    }
  });

  router.post('/coding/projects/:id/tech-debt', async (req, res) => {
    try {
      const { title, description, rationale, severity = 'medium', owner, target_release_id, source = 'manual', source_task_id } = req.body;
      if (!title) return res.status(400).json({ error: 'title is required' });

      const id = randomUUID();
      await db.run(`
        INSERT INTO coding_tech_debt (id, coding_project_id, title, description, rationale, severity, owner, target_release_id, source, source_task_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, req.params.id, title, description || '', rationale || '', severity, owner || null, target_release_id || null, source, source_task_id || null);

      // ── Studio P4: high/critical tech-debt → risk.identified project atom ───
      try {
        const integration = await createCodingIntegration(db);
        integration.captureTechDebt({
          projectId: req.params.id, title, severity, taskId: source_task_id || null,
        });
      } catch { /* atom capture must never break tech-debt creation */ }

      res.json({ id, title, severity, status: 'open' });
    } catch (error) {
      console.error('[coding-large] Create tech debt error:', error);
      res.status(500).json({ error: 'Failed to create tech debt' });
    }
  });

  router.patch('/coding/projects/:id/tech-debt/:tdid', async (req, res) => {
    try {
      const { status, resolution_notes, owner, target_release_id, severity } = req.body;
      const updates: string[] = [];
      const params: any[] = [];

      if (status) { updates.push('status = ?'); params.push(status); }
      if (resolution_notes) { updates.push('resolution_notes = ?'); params.push(resolution_notes); }
      if (owner !== undefined) { updates.push('owner = ?'); params.push(owner); }
      if (target_release_id !== undefined) { updates.push('target_release_id = ?'); params.push(target_release_id); }
      if (severity) { updates.push('severity = ?'); params.push(severity); }
      if (status === 'resolved') { updates.push("resolved_at = NOW()"); }

      updates.push("updated_at = NOW()");
      params.push(req.params.tdid, req.params.id);

      await db.run(`UPDATE coding_tech_debt SET ${updates.join(', ')} WHERE id = ? AND coding_project_id = ?`, ...params);
      res.json({ id: req.params.tdid, updated: true });
    } catch (error) {
      console.error('[coding-large] Update tech debt error:', error);
      res.status(500).json({ error: 'Failed to update tech debt' });
    }
  });

  // ── Changes ──────────────────────────────────────────────────────────────

  router.get('/coding/projects/:id/changes', async (req, res) => {
    try {
      const changes = await db.all('SELECT * FROM coding_changes WHERE coding_project_id = ? ORDER BY created_at DESC LIMIT 500', req.params.id);
      res.json(changes.map((c: any) => ({
        ...c,
        original_state: JSON.parse(c.original_state || '{}'),
        revised_state: JSON.parse(c.revised_state || '{}'),
        impact_assessment: JSON.parse(c.impact_assessment || '{}'),
        affected_release_ids: JSON.parse(c.affected_release_ids || '[]'),
        affected_task_ids: JSON.parse(c.affected_task_ids || '[]'),
      })));
    } catch (error) {
      console.error('[coding-large] List changes error:', error);
      res.status(500).json({ error: 'Failed to list changes' });
    }
  });

  router.post('/coding/projects/:id/changes', async (req, res) => {
    try {
      const { change_type, change_level, title, rationale, original_state = {}, revised_state = {}, affected_release_ids = [], affected_task_ids = [] } = req.body;
      if (!change_type || !change_level || !title) return res.status(400).json({ error: 'change_type, change_level, and title are required' });

      const id = randomUUID();
      await db.run(`
        INSERT INTO coding_changes (id, coding_project_id, change_type, change_level, title, rationale, initiated_by, original_state, revised_state, affected_release_ids, affected_task_ids)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, id, req.params.id, change_type, change_level, title, rationale || '', (req as any).userId || 'system', JSON.stringify(original_state), JSON.stringify(revised_state), JSON.stringify(affected_release_ids), JSON.stringify(affected_task_ids));

      res.json({ id, title, status: 'proposed' });
    } catch (error) {
      console.error('[coding-large] Create change error:', error);
      res.status(500).json({ error: 'Failed to create change' });
    }
  });

  router.post('/coding/projects/:id/changes/:cid/impact', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const changeRow = await db.get('SELECT * FROM coding_changes WHERE id = ? AND coding_project_id = ?', req.params.cid, req.params.id) as any;
      if (!changeRow) return res.status(404).json({ error: 'Change not found' });

      const change = {
        ...changeRow,
        original_state: JSON.parse(changeRow.original_state || '{}'),
        revised_state: JSON.parse(changeRow.revised_state || '{}'),
        affected_release_ids: JSON.parse(changeRow.affected_release_ids || '[]'),
        affected_task_ids: JSON.parse(changeRow.affected_task_ids || '[]'),
      };

      const parsedProject = parseProject(project);

      // Load releases
      const releases = (await db.all('SELECT * FROM coding_releases WHERE coding_project_id = ? ORDER BY release_number LIMIT 500', req.params.id)).map(parseRelease);

      const systemPromptOverride = buildImpactAnalysisSystemPrompt(project.name);
      const impactPrompt = buildImpactAnalysisUserMessage(change, parsedProject, releases);

      res.json({
        impactPrompt,
        systemPromptOverride,
        moduleId: 'goal-alignment-check',
        areaId: 'coding',
      });
    } catch (error) {
      console.error('[coding-large] Impact analysis error:', error);
      res.status(500).json({ error: 'Failed to analyze impact' });
    }
  });

  router.patch('/coding/projects/:id/changes/:cid', async (req, res) => {
    try {
      const { status } = req.body;
      if (!status) return res.status(400).json({ error: 'status is required' });
      await db.run("UPDATE coding_changes SET status = ?, approved_at = CASE WHEN ? = 'approved' THEN NOW() ELSE approved_at END, updated_at = NOW() WHERE id = ? AND coding_project_id = ?", status, status, req.params.cid, req.params.id);

      // ── Studio P4: an APPROVED change → decision.approval project atom ──────
      if (status === 'approved') {
        try {
          const ch = await db.get(
            'SELECT title, change_level, rationale FROM coding_changes WHERE id = ? AND coding_project_id = ?',
            req.params.cid, req.params.id) as { title: string; change_level: string | null; rationale: string | null } | undefined;
          if (ch) {
            const integration = await createCodingIntegration(db);
            integration.captureArchDecision({
              projectId: req.params.id, title: ch.title,
              changeLevel: ch.change_level, rationale: ch.rationale,
            });
          }
        } catch { /* atom capture must never break a change approval */ }
      }

      res.json({ id: req.params.cid, status });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update change' });
    }
  });

  // ── Cost Tracking ────────────────────────────────────────────────────────

  router.get('/coding/projects/:id/cost', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });
      res.json({
        estimate: JSON.parse(project.cost_estimate || '{}'),
        actual: JSON.parse(project.cost_actual || '{"total_input_tokens":0,"total_output_tokens":0,"total_cost_usd":0,"by_phase":{}}'),
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get cost data' });
    }
  });

  // ── Activity Feed ────────────────────────────────────────────────────────

  router.get('/coding/projects/:id/activity', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 30;
      const activity = await db.get(`
        SELECT 'task' as type, id, title, status, updated_at as timestamp FROM coding_tasks WHERE coding_project_id = ?
        UNION ALL
        SELECT 'review' as type, id, reviewer_persona_id as title, status, created_at as timestamp FROM coding_reviews WHERE coding_project_id = ?
        UNION ALL
        SELECT 'change' as type, id, title, status, created_at as timestamp FROM coding_changes WHERE coding_project_id = ?
        UNION ALL
        SELECT 'test' as type, id, test_suite_name as title, CAST(pass_count as TEXT) as status, run_at as timestamp FROM coding_test_runs WHERE coding_project_id = ?
        ORDER BY timestamp DESC LIMIT ?
      `, req.params.id, req.params.id, req.params.id, req.params.id, limit);
      res.json(activity);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get activity' });
    }
  });

  // ── Goal Alignment Check ─────────────────────────────────────────────────

  router.post('/coding/projects/:id/alignment-check', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const parsedProject = parseProject(project);

      // Load tech debt
      const techDebt = await db.all("SELECT * FROM coding_tech_debt WHERE coding_project_id = ? AND status != 'resolved' ORDER BY severity DESC LIMIT 500", req.params.id);

      // Load releases
      const releases = (await db.all('SELECT * FROM coding_releases WHERE coding_project_id = ? ORDER BY release_number LIMIT 500', req.params.id)).map(parseRelease);

      // Load tasks
      const tasks = (await db.all('SELECT * FROM coding_tasks WHERE coding_project_id = ? ORDER BY sort_order LIMIT 500', req.params.id)).map(parseTask);

      const systemPromptOverride = buildAlignmentCheckSystemPrompt(
        project.name,
        project.discovery_summary || undefined,
        project.architecture_summary || undefined
      );
      const alignmentPrompt = buildAlignmentCheckUserMessage(parsedProject, techDebt, releases, tasks);

      res.json({
        alignmentPrompt,
        systemPromptOverride,
        moduleId: 'goal-alignment-check',
        areaId: 'coding',
      });
    } catch (error) {
      console.error('[coding-large] Alignment check error:', error);
      res.status(500).json({ error: 'Failed to start alignment check' });
    }
  });

  // ── Operational Readiness ────────────────────────────────────────────────

  router.post('/coding/projects/:id/operational-readiness', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const parsedProject = parseProject(project);

      // Load releases
      const releases = (await db.all('SELECT * FROM coding_releases WHERE coding_project_id = ? ORDER BY release_number LIMIT 500', req.params.id)).map(parseRelease);

      // Load test results
      const testResults = await db.all('SELECT * FROM coding_test_runs WHERE coding_project_id = ? ORDER BY run_at DESC LIMIT 50', req.params.id);

      await db.run("UPDATE coding_projects SET status = 'operational_readiness', current_phase = 7, updated_at = NOW() WHERE id = ?", req.params.id);

      const systemPromptOverride = buildOperationalReadinessSystemPrompt(
        project.name,
        project.architecture_summary || undefined
      );
      const readinessPrompt = buildOperationalReadinessUserMessage(parsedProject, releases, testResults);

      res.json({
        readinessPrompt,
        systemPromptOverride,
        moduleId: 'coding-large-implementation',
        areaId: 'coding',
      });
    } catch (error) {
      console.error('[coding-large] Operational readiness error:', error);
      res.status(500).json({ error: 'Failed to start operational readiness' });
    }
  });

  // ── Scoped Re-discovery ──────────────────────────────────────────────────

  router.post('/coding/projects/:id/rediscovery', async (req, res) => {
    try {
      const project = await db.get('SELECT * FROM coding_projects WHERE id = ?', req.params.id) as any;
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const { scope } = req.body;
      if (!scope) return res.status(400).json({ error: 'scope is required — describe the areas to re-discover' });

      const parsedProject = parseProject(project);

      const systemPromptOverride = buildRediscoverySystemPrompt(
        project.name,
        project.discovery_summary || undefined,
        scope
      );
      const rediscoveryPrompt = buildRediscoveryUserMessage(scope, parsedProject);

      res.json({
        rediscoveryPrompt,
        systemPromptOverride,
        moduleId: 'coding-large-discovery',
        areaId: 'coding',
      });
    } catch (error) {
      console.error('[coding-large] Rediscovery error:', error);
      res.status(500).json({ error: 'Failed to start re-discovery' });
    }
  });

  return router;
}

// ── Parsers ──────────────────────────────────────────────────────────────────

/** test_command column → argv array or null (tolerates bad JSON). */
function parseTestCommand(project: any): string[] | null {
  if (!project?.test_command) return null;
  try {
    const parsed = JSON.parse(project.test_command);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** A JSON-argv command column (setup/build/test) → argv array or null. */
function parseCommandColumn(raw: unknown): string[] | null {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/** Workspace-application row → API shape. Staged file content is never echoed back in lists. */
function parseApplication(row: any) {
  const files = (() => {
    try { return JSON.parse(row.files || '[]'); } catch { return []; }
  })();
  return {
    ...row,
    files: (files as ApplicationFileEntry[]).map(({ content: _content, ...rest }) => rest),
    rejected_blocks: JSON.parse(row.rejected_blocks || '[]'),
    diff_summary: JSON.parse(row.diff_summary || '{}'),
  };
}

function parseProject(row: any) {
  return {
    ...row,
    git_initialized: !!row.git_initialized,
    test_command: parseTestCommand(row),
    tech_stack: JSON.parse(row.tech_stack || '[]'),
    expert_panels: JSON.parse(row.expert_panels || '[]'),
    cost_estimate: JSON.parse(row.cost_estimate || '{}'),
    cost_actual: JSON.parse(row.cost_actual || '{"total_input_tokens":0,"total_output_tokens":0,"total_cost_usd":0,"by_phase":{}}'),
  };
}

function parseRelease(row: any) {
  return {
    ...row,
    acceptance_criteria: JSON.parse(row.acceptance_criteria || '[]'),
    test_plan: JSON.parse(row.test_plan || '{}'),
    complexity_estimate: JSON.parse(row.complexity_estimate || '{}'),
    complexity_actual: JSON.parse(row.complexity_actual || '{}'),
    review_required_personas: JSON.parse(row.review_required_personas || '[]'),
  };
}

function parseTask(row: any) {
  return {
    ...row,
    acceptance_criteria: JSON.parse(row.acceptance_criteria || '[]'),
    execution_plan: row.execution_plan ? JSON.parse(row.execution_plan) : null,
    progress_log: JSON.parse(row.progress_log || '[]'),
    completion_record: row.completion_record ? JSON.parse(row.completion_record) : null,
    depends_on: JSON.parse(row.depends_on || '[]'),
    blocks: JSON.parse(row.blocks || '[]'),
    file_manifest: JSON.parse(row.file_manifest || '{}'),
    tokens_consumed: JSON.parse(row.tokens_consumed || '{"input":0,"output":0,"cost_usd":0}'),
  };
}

function parseReview(row: any) {
  return {
    ...row,
    severity_summary: JSON.parse(row.severity_summary || '{}'),
    tokens_consumed: JSON.parse(row.tokens_consumed || '{"input":0,"output":0,"cost_usd":0}'),
    is_mandatory: !!row.is_mandatory,
  };
}
