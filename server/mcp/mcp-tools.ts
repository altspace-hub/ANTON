/**
 * mcp-tools.ts
 * Tool definitions and handlers for the ANTON HTTP MCP endpoint.
 *
 * Three tools are exposed:
 *   run_module       — execute an ANTON expert module (placeholder — directs to web UI)
 *   score_quality    — heuristic quality scoring without needing Claude API
 *   suggest_modules  — keyword-based module recommendations
 */

import type { DatabaseAdapter } from '../db/database.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
}

export interface McpToolResult {
  result: unknown;
}

// ── Tool definitions ─────────────────────────────────────────────────────────

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'run_module',
    description: 'Execute any of ANTON\'s expert modules with given input',
    inputSchema: {
      type: 'object',
      properties: {
        area: {
          type: 'string',
          description: 'Area ID (e.g., "fcp", "legal", "audit")',
        },
        module: {
          type: 'string',
          description: 'Module ID (e.g., "gap-analysis", "contract-review")',
        },
        input: {
          type: 'string',
          description: 'User input / question for the module',
        },
      },
      required: ['module', 'input'],
    },
  },
  {
    name: 'score_quality',
    description: 'Get Trust Score (quality assessment) for any content',
    inputSchema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The text content to evaluate',
        },
        module_type: {
          type: 'string',
          description: 'Optional module type for context (e.g., "gap-analysis", "policy-document")',
        },
      },
      required: ['content'],
    },
  },
  {
    name: 'suggest_modules',
    description: 'Get module recommendations for a task description',
    inputSchema: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'A description of the task or question you want help with',
        },
      },
      required: ['description'],
    },
  },
];

// ── Heuristic quality scorer (mirrors quality-ratchet.ts heuristicScore) ────

interface HeuristicScoreResult {
  overall: number;
  completeness: number;
  accuracy: number;
  structure: number;
  actionability: number;
  citations: number;
}

function heuristicScore(content: string): HeuristicScoreResult {
  const wordCount = content.split(/\s+/).length;
  const hasHeadings = (content.match(/^#{1,3} /gm) ?? []).length;
  const hasBullets = (content.match(/^[-*•] /gm) ?? []).length;
  const hasNumbers = (content.match(/\b(article|regulation|directive|section)\s+\d/gi) ?? []).length;

  const structure = Math.min(10, 5 + hasHeadings * 0.5 + hasBullets * 0.1);
  const citations = Math.min(10, 5 + hasNumbers * 1.5);
  const completeness = Math.min(10, 5 + Math.log2(Math.max(wordCount, 100)) * 0.8);
  const overall = (structure + citations + completeness + 7 + 7) / 5;

  return {
    overall: Math.round(overall * 10) / 10,
    completeness: Math.round(completeness * 10) / 10,
    accuracy: 7.0,
    structure: Math.round(structure * 10) / 10,
    actionability: 7.0,
    citations: Math.round(citations * 10) / 10,
  };
}

// ── Module suggestion keywords ───────────────────────────────────────────────

interface ModuleSuggestion {
  area: string;
  module: string;
  name: string;
  relevance: string;
}

const MODULE_KEYWORD_MAP: Array<{
  keywords: string[];
  area: string;
  module: string;
  name: string;
}> = [
  {
    keywords: ['gap', 'gap analysis', 'amlr', 'compliance gap', 'regulation comparison', 'requirements'],
    area: 'fcp',
    module: 'gap-analysis',
    name: 'AMLR Gap Analysis',
  },
  {
    keywords: ['policy', 'procedure', 'document', 'aml policy', 'kyc', 'sanctions policy', 'governance'],
    area: 'fcp',
    module: 'document-creation',
    name: 'Document Creation',
  },
  {
    keywords: ['sanctions', 'screening', 'ofac', 'eu sanctions', 'un sanctions', 'de-risking', 'embargo'],
    area: 'fcp',
    module: 'sanctions-advisory',
    name: 'Sanctions Advisory',
  },
  {
    keywords: ['regulatory', 'monitor', 'regulation update', 'news', 'eba', 'esma', 'fatf', 'amla'],
    area: 'fcp',
    module: 'regulatory-monitor',
    name: 'Regulatory Monitor',
  },
  {
    keywords: ['training', 'learning', 'course', 'awareness', 'education', 'staff training', 'e-learning'],
    area: 'fcp',
    module: 'training-content',
    name: 'Training Content Creator',
  },
  {
    keywords: ['data', 'data management', 'data quality', 'amla data', 'data dictionary', 'readiness'],
    area: 'fcp',
    module: 'data-management',
    name: 'AMLA Data Management',
  },
  {
    keywords: ['risk', 'risk assessment', 'risk rating', 'maturity', 'risk model', 'risk appetite'],
    area: 'fcp',
    module: 'risk-assessment',
    name: 'Risk Assessment Support',
  },
  {
    keywords: ['investigation', 'case', 'suspicious', 'str', 'sar', 'transaction monitoring', 'alert'],
    area: 'fcp',
    module: 'investigation-support',
    name: 'Investigation & Case Support',
  },
];

function suggestModules(description: string): ModuleSuggestion[] {
  const lower = description.toLowerCase();
  const scored: Array<{ score: number; entry: typeof MODULE_KEYWORD_MAP[0] }> = [];

  for (const entry of MODULE_KEYWORD_MAP) {
    let score = 0;
    for (const keyword of entry.keywords) {
      if (lower.includes(keyword)) {
        // Longer keyword matches score higher (more specific)
        score += keyword.split(' ').length;
      }
    }
    if (score > 0) {
      scored.push({ score, entry });
    }
  }

  // Sort by relevance descending and return top 3
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3);

  // If no keywords matched, return 2 generic defaults
  if (top.length === 0) {
    return [
      {
        area: 'fcp',
        module: 'gap-analysis',
        name: 'AMLR Gap Analysis',
        relevance: 'General compliance analysis',
      },
      {
        area: 'fcp',
        module: 'regulatory-monitor',
        name: 'Regulatory Monitor',
        relevance: 'Stay updated on regulatory developments',
      },
    ];
  }

  return top.map(({ score, entry }) => ({
    area: entry.area,
    module: entry.module,
    name: entry.name,
    relevance: `Matched ${score} relevance signal${score !== 1 ? 's' : ''} in your description`,
  }));
}

// ── Tool executor ────────────────────────────────────────────────────────────

export function createMcpToolExecutor(_db: DatabaseAdapter) {
  async function execute(
    tool: string,
    parameters: Record<string, unknown>
  ): Promise<McpToolResult> {
    switch (tool) {
      case 'run_module': {
        const module = String(parameters.module ?? '');
        const area = parameters.area ? String(parameters.area) : undefined;
        const input = String(parameters.input ?? '');

        if (!module || !input) {
          return {
            result: {
              error: 'Both "module" and "input" parameters are required.',
            },
          };
        }

        // Placeholder — full execution requires authenticated web UI session
        return {
          result: {
            message:
              'Module execution via MCP requires authentication — use the ANTON web interface.',
            details: {
              requested_module: module,
              requested_area: area ?? 'auto-detect',
              hint: 'Open http://localhost:3001 in your browser, navigate to the module, and paste your input there for full AI-powered analysis.',
              web_url: `http://localhost:3001`,
            },
          },
        };
      }

      case 'score_quality': {
        const content = String(parameters.content ?? '');
        if (!content.trim()) {
          return {
            result: { error: '"content" parameter is required and must not be empty.' },
          };
        }

        const moduleType = parameters.module_type ? String(parameters.module_type) : undefined;
        const scores = heuristicScore(content);
        const wordCount = content.split(/\s+/).length;

        // Derive a simple trust label from overall score
        let trustLabel: string;
        if (scores.overall >= 8.5) trustLabel = 'Excellent';
        else if (scores.overall >= 7.5) trustLabel = 'Good';
        else if (scores.overall >= 6.0) trustLabel = 'Adequate';
        else if (scores.overall >= 4.0) trustLabel = 'Needs Improvement';
        else trustLabel = 'Poor';

        return {
          result: {
            trust_score: scores.overall,
            trust_label: trustLabel,
            module_context: moduleType ?? null,
            dimensions: {
              completeness: scores.completeness,
              accuracy: scores.accuracy,
              structure: scores.structure,
              actionability: scores.actionability,
              citations: scores.citations,
            },
            stats: {
              word_count: wordCount,
              headings_detected: (content.match(/^#{1,3} /gm) ?? []).length,
              bullet_points_detected: (content.match(/^[-*•] /gm) ?? []).length,
              regulatory_references_detected: (
                content.match(/\b(article|regulation|directive|section)\s+\d/gi) ?? []
              ).length,
            },
            note: 'Heuristic scoring only — for AI-powered scoring, use the ANTON web interface.',
          },
        };
      }

      case 'suggest_modules': {
        const description = String(parameters.description ?? '');
        if (!description.trim()) {
          return {
            result: { error: '"description" parameter is required and must not be empty.' },
          };
        }

        const suggestions = suggestModules(description);
        return {
          result: {
            suggestions,
            usage_hint:
              'Use the "module" ID and "area" values with run_module, or navigate to http://localhost:3001 to use the full ANTON web interface.',
          },
        };
      }

      default:
        return {
          result: { error: `Unknown tool: "${tool}". Available tools: run_module, score_quality, suggest_modules` },
        };
    }
  }

  return { execute };
}
