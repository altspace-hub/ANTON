import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart2, FileText, ClipboardList, ArrowRight } from 'lucide-react';
import { getModuleSuggestions, type ModuleSuggestion } from '@/lib/module-suggestions';

// Local fallback in case module-suggestions import fails at runtime
function getLocalSuggestions(moduleId: string): ModuleSuggestion[] {
  // Intentionally empty — actual suggestions are provided by module-suggestions.ts
  return [];
}

interface OutputChainActionsProps {
  outputContent: string;
  moduleId?: string;
  areaId?: string;
  sessionId?: string;
}

const EXECUTIVE_SUMMARY_PROMPT = `You are a senior compliance advisor tasked with distilling complex analysis into a concise executive summary.

## TASK
Produce a tight, board-ready executive summary (maximum 1 page) from the content provided.

## STRUCTURE
1. **Situation** — What is the issue or context? (2-3 sentences)
2. **Key Findings** — The 3-5 most important findings or conclusions, in plain language.
3. **Risk / Impact** — What happens if no action is taken?
4. **Recommended Actions** — 3 concrete next steps with clear ownership.
5. **Decision Required** — What does the reader need to decide or approve?

Use formal, precise language suitable for a board or senior management audience. Lead with the conclusion, not the method.`;

const ACTION_PLAN_PROMPT = `You are a project delivery expert converting analytical findings into a structured, executable action plan.

## TASK
Produce a prioritised action plan from the content provided.

## STRUCTURE
For each action item provide:
- **Action** — Clear, verb-led description of what must be done
- **Owner** — Role responsible for delivery (e.g. MLRO, IT Lead, Head of Compliance)
- **Priority** — Critical / High / Medium / Low
- **Effort** — Estimated effort (e.g. 1 day, 1 week, 1 month)
- **Deadline** — Suggested completion date or relative timeframe
- **Dependencies** — Any prerequisites or blockers

Group actions by workstream where applicable. Flag any items that unblock others.`;

export function OutputChainActions({
  outputContent,
  moduleId = '',
  areaId,
  sessionId,
}: OutputChainActionsProps) {
  const navigate = useNavigate();

  // Resolve module suggestions with safe fallback
  let suggestions: ModuleSuggestion[] = [];
  try {
    suggestions =
      typeof getModuleSuggestions === 'function'
        ? getModuleSuggestions(moduleId, areaId)
        : getLocalSuggestions(moduleId);
  } catch {
    suggestions = getLocalSuggestions(moduleId);
  }

  function handleCreatePresentation() {
    navigate('/presentations', {
      state: {
        contextContent: outputContent,
        sourceSessionId: sessionId,
        sourceModuleId: moduleId,
      },
    });
  }

  function handleCreateExecutiveSummary() {
    navigate('/prompt', {
      state: {
        contextContent: outputContent,
        systemPromptOverride: EXECUTIVE_SUMMARY_PROMPT,
        sourceSessionId: sessionId,
        sourceModuleId: moduleId,
      },
    });
  }

  function handleCreateActionPlan() {
    navigate('/prompt', {
      state: {
        contextContent: outputContent,
        systemPromptOverride: ACTION_PLAN_PROMPT,
        sourceSessionId: sessionId,
        sourceModuleId: moduleId,
      },
    });
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-adv-card p-4 space-y-4">
      {/* Header */}
      <div>
        <h3 className="text-sm font-semibold text-adv-off-white mb-1">
          Continue working with this output
        </h3>
        <p className="text-xs text-adv-gray">
          Create a new deliverable from the analysis above — Claude will use this output as context.
        </p>
      </div>

      {/* Quick action buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleCreatePresentation}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-adv-dark border border-border hover:border-adv-teal/50 hover:bg-adv-teal/10 text-adv-off-white text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal/50"
          aria-label="Create presentation from this output"
        >
          <BarChart2 className="w-3.5 h-3.5 text-adv-teal flex-shrink-0" />
          Create Presentation
        </button>

        <button
          onClick={handleCreateExecutiveSummary}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-adv-dark border border-border hover:border-adv-teal/50 hover:bg-adv-teal/10 text-adv-off-white text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal/50"
          aria-label="Create executive summary from this output"
        >
          <FileText className="w-3.5 h-3.5 text-adv-teal flex-shrink-0" />
          Create Executive Summary
        </button>

        <button
          onClick={handleCreateActionPlan}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-adv-dark border border-border hover:border-adv-teal/50 hover:bg-adv-teal/10 text-adv-off-white text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal/50"
          aria-label="Create action plan from this output"
        >
          <ClipboardList className="w-3.5 h-3.5 text-adv-teal flex-shrink-0" />
          Create Action Plan
        </button>
      </div>

      {/* Module suggestions */}
      {suggestions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-adv-gray mb-2">
            Based on this output, suggested next steps:
          </p>
          <ul className="space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.moduleId}>
                <button
                  onClick={() =>
                    navigate(`/modules/${s.moduleId}`, {
                      state: {
                        contextContent: outputContent,
                        sourceSessionId: sessionId,
                      },
                    })
                  }
                  className="w-full flex items-start gap-2 text-left px-3 py-2 rounded-md bg-adv-dark border border-border hover:border-adv-teal/40 hover:bg-adv-teal/5 transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4A8] focus-visible:ring-offset-1 focus:ring-2 focus:ring-adv-teal/50"
                  aria-label={`Open ${s.label} module`}
                >
                  <ArrowRight className="w-3.5 h-3.5 text-adv-teal mt-0.5 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  <span>
                    <span className="text-xs font-medium text-adv-off-white">{s.label}</span>
                    {s.reason && (
                      <span className="block text-xs text-adv-gray leading-tight mt-0.5">
                        {s.reason}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default OutputChainActions;
