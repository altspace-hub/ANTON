import Anthropic from '@anthropic-ai/sdk';
import Database from 'better-sqlite3';
import { callChat, mapModelToProvider } from './provider-router.js';

const COMMAND_PARSING_PROMPT = `You are a command parser for the openEXPERT platform.

Parse the user's natural language command and return structured JSON.

Supported command types:
- navigate: Navigate to a page/module/workflow
- create: Create a new session/workflow/module
- search: Search for sessions/outputs/entities
- export: Export an output in a specific format
- execute: Run a background task (quality check, graph rebuild, pattern detection)

Response format (JSON only):
{
  "commandType": "navigate|create|search|export|execute",
  "action": "specific action name",
  "parameters": { ... },
  "confidence": 0.0-1.0,
  "reasoning": "one sentence explaining how you interpreted this command",
  "clarification": "optional question if ambiguous"
}

Examples:
"Create gap analysis for Nordea" → {"commandType":"create","action":"create_session","parameters":{"moduleId":"gap-analysis","context":"Nordea"},"confidence":0.9}
"Show AMLR sessions" → {"commandType":"search","action":"search_sessions","parameters":{"query":"AMLR"},"confidence":0.95}
"Export as PDF" → {"commandType":"export","action":"export_output","parameters":{"format":"pdf"},"confidence":0.85}
"Rebuild knowledge graph" → {"commandType":"execute","action":"rebuild_graph","parameters":{},"confidence":1.0}
"Go to workflows" → {"commandType":"navigate","action":"navigate_to","parameters":{"page":"workflows"},"confidence":1.0}
"Run quality check on document-creation" → {"commandType":"execute","action":"run_quality_check","parameters":{"moduleId":"document-creation"},"confidence":0.95}
"Create sanctions advisory" → {"commandType":"create","action":"create_session","parameters":{"moduleId":"sanctions-advisory"},"confidence":0.9}
"Show me projects" → {"commandType":"navigate","action":"navigate_to","parameters":{"page":"projects"},"confidence":1.0}
"Search for compliance sessions" → {"commandType":"search","action":"search_sessions","parameters":{"query":"compliance"},"confidence":0.95}

Module IDs: gap-analysis, document-creation, sanctions-advisory, regulatory-monitor, training-content, data-management, risk-assessment, investigation-support

Pages: dashboard, workflows, projects, settings, quality, knowledge, deadlines, radar, analytics, skills, exchange, audit, apprentice, coworkers, graph, intelligence, brief, guide, fill, challenge, dual, batch, prompt, review, sounding-board, ab-test, versions

Additional examples:
"Open brief me" → {"commandType":"navigate","action":"navigate_to","parameters":{"page":"brief"},"confidence":1.0}
"Go to intelligence dashboard" → {"commandType":"navigate","action":"navigate_to","parameters":{"page":"intelligence"},"confidence":1.0}
"Show knowledge graph" → {"commandType":"navigate","action":"navigate_to","parameters":{"page":"graph"},"confidence":1.0}
"Open prompt page" → {"commandType":"navigate","action":"navigate_to","parameters":{"page":"prompt"},"confidence":1.0}`;

export interface ParsedCommand {
  commandType: string;
  action: string;
  parameters: Record<string, any>;
  confidence: number;
  reasoning?: string;
  clarification?: string;
}

export interface ExecutionResult {
  success: boolean;
  message: string;
  redirect?: string;
  data?: any;
}

export async function parseCommand(userInput: string, anthropic: Anthropic): Promise<ParsedCommand> {
  try {
    const result = await callChat({
      model: mapModelToProvider('claude-haiku-4-5-20251001'),
      maxTokens: 400,
      system: COMMAND_PARSING_PROMPT,
      messages: [{
        role: 'user',
        content: `User command: "${userInput}"\n\nJSON response:`,
      }],
    });

    const text = result.text || '{}';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        commandType: 'unknown',
        action: 'unknown',
        parameters: {},
        confidence: 0,
        clarification: 'Could not parse command. Please try rephrasing.',
      };
    }

    return JSON.parse(jsonMatch[0]);
  } catch (error) {
    console.error('[command-parser] Parse error:', error);
    return {
      commandType: 'unknown',
      action: 'unknown',
      parameters: {},
      confidence: 0,
      clarification: 'An error occurred while parsing your command.',
    };
  }
}

export async function executeCommand(
  parsed: ParsedCommand,
  context: {
    db: Database.Database;
    userId?: string;
  }
): Promise<ExecutionResult> {

  switch (parsed.action) {
    case 'create_session': {
      // Redirect to module page with pre-filled context
      const moduleId = parsed.parameters.moduleId ?? 'gap-analysis';
      const contextText = parsed.parameters.context ?? '';
      return {
        success: true,
        message: `Creating ${moduleId} session...`,
        redirect: `/module/${moduleId}${contextText ? `?context=${encodeURIComponent(contextText)}` : ''}`,
      };
    }

    case 'navigate_to': {
      // Navigate to a specific page
      const page = parsed.parameters.page ?? 'dashboard';
      const pageMap: Record<string, string> = {
        dashboard: '/',
        workflows: '/workflows',
        projects: '/projects',
        settings: '/settings',
        quality: '/quality',
        knowledge: '/knowledge',
        deadlines: '/deadlines',
        radar: '/radar',
        analytics: '/analytics',
        skills: '/skills',
        exchange: '/exchange',
        audit: '/audit',
        apprentice: '/apprentice',
        coworkers: '/coworkers',
        review: '/review',
        insights: '/insights',
        graph: '/graph',
        intelligence: '/intelligence',
        brief: '/brief',
        guide: '/guide',
        fill: '/fill',
        challenge: '/challenge',
        dual: '/dual',
        batch: '/batch',
        prompt: '/prompt',
        'sounding-board': '/sounding-board',
        'ab-test': '/ab-test',
        versions: '/versions',
      };
      const path = pageMap[page.toLowerCase()] || '/';
      return {
        success: true,
        message: `Navigating to ${page}...`,
        redirect: path,
      };
    }

    case 'search_sessions': {
      // Redirect to projects/sessions page with search query
      const query = parsed.parameters.query ?? '';
      return {
        success: true,
        message: `Searching for "${query}"...`,
        redirect: `/projects?search=${encodeURIComponent(query)}`,
      };
    }

    case 'export_output': {
      // This would need session context — return instruction
      return {
        success: false,
        message: 'Export command requires an active session. Please run from a module output page.',
      };
    }

    case 'rebuild_graph': {
      // Execute graph rebuild
      try {
        const { createKnowledgeGraph } = await import('./knowledge-graph.js');
        const graph = createKnowledgeGraph(context.db);
        const result = graph.buildGraph();
        return {
          success: true,
          message: `Graph rebuilt: ${result.nodesCreated} nodes, ${result.relationshipsCreated} relationships created.`,
          data: result,
        };
      } catch (error: any) {
        return {
          success: false,
          message: `Graph rebuild failed: ${error.message}`,
        };
      }
    }

    case 'run_quality_check': {
      const moduleId = parsed.parameters.moduleId;
      if (!moduleId) {
        return { success: false, message: 'Module ID required for quality check.' };
      }
      return {
        success: true,
        message: `Quality check for ${moduleId} will be shown on the Quality page.`,
        redirect: `/quality`,
      };
    }

    case 'run_pattern_detection': {
      try {
        const { createPatternDetection } = await import('./pattern-detection.js');
        const engine = createPatternDetection(context.db);
        const result = engine.runAllDetectors();
        return {
          success: true,
          message: `Pattern detection complete: ${result.patternsDetected} patterns found.`,
          data: result,
        };
      } catch (error: any) {
        return {
          success: false,
          message: `Pattern detection failed: ${error.message}`,
        };
      }
    }

    default:
      return {
        success: false,
        message: `Action "${parsed.action}" not yet implemented.`,
      };
  }
}
