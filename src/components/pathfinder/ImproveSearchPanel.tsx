/**
 * ImproveSearchPanel — "Improve my search" wizard for Pathfinder
 * Adapted from the "Improve my prompt" flow in Open Chat.
 *
 * Flow: Analyse → Questions → (Mode suggestions) → Build improved query
 */
import { useState, useRef } from 'react';
import { Sparkles, Loader2, X, ArrowRight, Search } from 'lucide-react';
import { streamMessage } from '@/lib/api';
import type { SearchMode, SearchDepth } from '@/lib/pathfinder-api';
import type { KnowledgeSourceConfig } from '@/lib/types';

type ImproveState = 'idle' | 'analyzing' | 'questions' | 'suggestions' | 'building';

const SEARCH_ANALYZE_PROMPT = `You are a search refinement expert helping a user get the best possible results from a multi-model AI search engine called Pathfinder.

Analyse the user's search query and ask exactly 3–4 concise clarifying questions to help refine it. Your questions should help understand:

1. What specific aspect of this topic matters most — narrow the scope
2. What context is relevant — jurisdiction, time period, industry, geography
3. What kind of answer they need — factual, comparative, step-by-step, opinion overview
4. (If applicable) Any constraints — language, recency, source type preference

Format your response as numbered questions. Be concise and specific to the user's topic. Do NOT rewrite the query — only ask questions.`;

const SEARCH_BUILD_PROMPT = `You are a search refinement expert. Based on the original search query and the user's answers to clarifying questions, create an improved, more specific search query that will produce excellent results from a multi-model AI search engine.

The improved query should:
- Be clear and specific (not vague or overly broad)
- Include relevant context terms (jurisdiction, time period, domain)
- Be a natural search query (not a prompt — keep it concise, 1-3 sentences max)
- Incorporate the user's clarifications

Also provide a one-line recommendation for search mode and depth as JSON on the LAST line:
{"mode": "knowledge|shopping|travel|food|fix|news|local", "depth": "quick|thorough|deep", "reason": "brief reason"}

Output the improved search query first, then a blank line, then the JSON recommendation.`;

const emptyKnowledgeSources: KnowledgeSourceConfig = {
  modes: {
    claudeKnowledge: { enabled: false, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [], fetchDepth: 'summary' as const },
    localFolder: { enabled: false, folderPaths: [], fileFilter: [], recursive: false },
    combinedMode: { enabled: false, priority: 'merged' as const, instructions: '' },
  },
};

interface ImproveSearchPanelProps {
  query: string;
  currentMode: SearchMode;
  currentDepth: SearchDepth;
  onImproved: (query: string, suggestedMode?: SearchMode, suggestedDepth?: SearchDepth) => void;
  onCancel: () => void;
}

export default function ImproveSearchPanel({
  query, currentMode, currentDepth, onImproved, onCancel,
}: ImproveSearchPanelProps) {
  const [state, setState] = useState<ImproveState>('analyzing');
  const [questions, setQuestions] = useState('');
  const [answers, setAnswers] = useState('');
  const [buildingText, setBuildingText] = useState('');
  const [suggestedMode, setSuggestedMode] = useState<SearchMode | null>(null);
  const [suggestedDepth, setSuggestedDepth] = useState<SearchDepth | null>(null);
  const [modeReason, setModeReason] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  // Step 1: Analyse — runs immediately on mount
  const hasStarted = useRef(false);
  if (!hasStarted.current) {
    hasStarted.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const stream = streamMessage(
          {
            model: 'claude-haiku-4-5-20251001',
            thinking: 'quick' as const,
            creativity: 'balanced' as const,
            systemPrompt: SEARCH_ANALYZE_PROMPT,
            userMessage: query,
            history: [],
            outputFormats: [],
            knowledgeSources: emptyKnowledgeSources,
            moduleInputs: {},
          },
          controller.signal,
        );

        let fullText = '';
        for await (const event of stream) {
          if (event.type === 'text_delta') {
            fullText += event.content;
            setQuestions(fullText);
          }
          if (event.type === 'error') {
            onCancel();
            return;
          }
        }
        setState('questions');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') onCancel();
      }
    })();
  }

  // Step 2: Build improved query
  async function handleBuild() {
    if (!answers.trim()) return;
    setState('building');
    setBuildingText('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const stream = streamMessage(
        {
          model: 'claude-haiku-4-5-20251001',
          thinking: 'think' as const,
          creativity: 'balanced' as const,
          systemPrompt: SEARCH_BUILD_PROMPT,
          userMessage: `Original search query:\n${query}\n\nCurrent mode: ${currentMode}\nCurrent depth: ${currentDepth}\n\nClarifying questions:\n${questions}\n\nUser's answers:\n${answers}`,
          history: [],
          outputFormats: [],
          knowledgeSources: emptyKnowledgeSources,
          moduleInputs: {},
        },
        controller.signal,
      );

      let fullText = '';
      for await (const event of stream) {
        if (event.type === 'text_delta') {
          fullText += event.content;
          setBuildingText(fullText);
        }
        if (event.type === 'error') break;
      }

      // Parse the result — improved query + optional JSON recommendation on last line
      const lines = fullText.trim().split('\n');
      let improvedQuery = fullText.trim();
      const lastLine = lines[lines.length - 1].trim();

      if (lastLine.startsWith('{') && lastLine.endsWith('}')) {
        try {
          const rec = JSON.parse(lastLine) as { mode?: string; depth?: string; reason?: string };
          // Remove the JSON line from the query
          improvedQuery = lines.slice(0, -1).join('\n').trim();
          // Remove any trailing blank lines
          improvedQuery = improvedQuery.replace(/\n+$/, '');
          if (rec.mode) setSuggestedMode(rec.mode as SearchMode);
          if (rec.depth) setSuggestedDepth(rec.depth as SearchDepth);
          if (rec.reason) setModeReason(rec.reason);
          setState('suggestions');
          return;
        } catch { /* not valid JSON, treat entire text as query */ }
      }

      // No JSON recommendation — go straight to done
      onImproved(improvedQuery);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setState('questions');
    }
  }

  function handleAccept(applyModeDepth: boolean) {
    // Extract the improved query (everything before the JSON line)
    const lines = buildingText.trim().split('\n');
    const lastLine = lines[lines.length - 1].trim();
    let improvedQuery = buildingText.trim();
    if (lastLine.startsWith('{') && lastLine.endsWith('}')) {
      improvedQuery = lines.slice(0, -1).join('\n').trim().replace(/\n+$/, '');
    }
    onImproved(
      improvedQuery,
      applyModeDepth && suggestedMode ? suggestedMode : undefined,
      applyModeDepth && suggestedDepth ? suggestedDepth : undefined,
    );
  }

  function handleCancel() {
    abortRef.current?.abort();
    onCancel();
  }

  const MODE_LABELS: Record<string, string> = {
    knowledge: 'Knowledge', shopping: 'Shopping', travel: 'Travel',
    food: 'Food', fix: 'Fix', news: 'News', local: 'Local',
  };
  const DEPTH_LABELS: Record<string, string> = {
    quick: 'Quick', thorough: 'Thorough', deep: 'Deep',
  };

  return (
    <div className="rounded-xl border border-adv-teal/30 bg-adv-teal/5 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-adv-teal" />
          <span className="text-sm font-medium text-adv-off-white">Improve My Search</span>
          {state === 'analyzing' && (
            <span className="flex items-center gap-1 text-xs text-adv-gray">
              <Loader2 className="h-3 w-3 animate-spin" /> Analysing...
            </span>
          )}
          {state === 'building' && (
            <span className="flex items-center gap-1 text-xs text-adv-gray">
              <Loader2 className="h-3 w-3 animate-spin" /> Building improved query...
            </span>
          )}
        </div>
        <button onClick={handleCancel} className="rounded p-1 text-adv-gray hover:text-adv-red transition-colors" title="Cancel">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Original query */}
      <div className="rounded-lg bg-adv-dark/50 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wider text-adv-gray">Your search</span>
        <p className="mt-0.5 text-xs text-adv-off-white/80">{query}</p>
      </div>

      {/* Questions from Claude */}
      {questions && (
        <div className="rounded-lg bg-adv-card px-3 py-2">
          <span className="text-[10px] uppercase tracking-wider text-adv-gray">Clarifying questions</span>
          <div className="mt-1 whitespace-pre-wrap text-sm text-adv-off-white">{questions}</div>
        </div>
      )}

      {/* Answer area */}
      {state === 'questions' && (
        <div className="space-y-2">
          <textarea
            value={answers}
            onChange={e => setAnswers(e.target.value)}
            placeholder="Answer briefly — helps us narrow down exactly what you need..."
            className="w-full resize-none rounded-lg border border-border bg-adv-dark p-3 text-sm text-adv-off-white placeholder:text-adv-gray/40 focus:border-adv-teal focus:outline-none"
            rows={3}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button onClick={handleCancel} className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-red transition-colors">
              Cancel
            </button>
            <button
              onClick={handleBuild}
              disabled={!answers.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors disabled:opacity-50"
            >
              Improve Search <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Building preview */}
      {state === 'building' && buildingText && (
        <div className="rounded-lg bg-adv-card px-3 py-2">
          <span className="text-[10px] uppercase tracking-wider text-adv-gray">Improved query (generating...)</span>
          <div className="mt-1 whitespace-pre-wrap text-sm text-adv-off-white">{buildingText}</div>
        </div>
      )}

      {/* Mode/depth suggestion */}
      {state === 'suggestions' && (
        <div className="space-y-3">
          {/* Show the improved query */}
          <div className="rounded-lg bg-adv-card px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-adv-gray">Improved query</span>
            <div className="mt-1 text-sm text-adv-off-white">
              {buildingText.trim().split('\n').filter(l => !l.trim().startsWith('{')).join('\n').trim()}
            </div>
          </div>

          {/* Mode/depth recommendation */}
          {(suggestedMode || suggestedDepth) && (suggestedMode !== currentMode || suggestedDepth !== currentDepth) && (
            <div className="rounded-lg border border-adv-teal/20 bg-adv-teal/5 px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-adv-teal mb-1">
                <Search className="h-3 w-3" />
                Recommended settings
              </div>
              <div className="flex items-center gap-2 text-xs text-adv-off-white">
                {suggestedMode && suggestedMode !== currentMode && (
                  <span className="rounded-lg border border-adv-teal/30 bg-adv-teal/10 px-2 py-0.5 text-adv-teal">
                    {MODE_LABELS[suggestedMode] || suggestedMode} mode
                  </span>
                )}
                {suggestedDepth && suggestedDepth !== currentDepth && (
                  <span className="rounded-lg border border-adv-teal/30 bg-adv-teal/10 px-2 py-0.5 text-adv-teal">
                    {DEPTH_LABELS[suggestedDepth] || suggestedDepth} depth
                  </span>
                )}
              </div>
              {modeReason && <p className="mt-1 text-[10px] text-adv-gray">{modeReason}</p>}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => handleAccept(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-adv-gray hover:text-adv-off-white transition-colors"
            >
              Use query only
            </button>
            <button
              onClick={() => handleAccept(true)}
              className="flex items-center gap-1.5 rounded-lg bg-adv-teal px-4 py-1.5 text-xs font-medium text-adv-dark hover:bg-adv-teal-dark transition-colors"
            >
              Apply all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
