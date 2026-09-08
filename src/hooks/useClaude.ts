import { useCallback, useState, useEffect } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useStreamStore } from '@/stores/useStreamStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { streamMessage, createSession, generateSessionTitle } from '@/lib/api';
import { buildOutputInstruction } from '@/lib/output-format-definitions';
import type { Message, StreamEvent } from '@/lib/types';

// ── AI Title Generator ──────────────────────────────────────
// After the first answer the server writes a 5-8 word title from the
// exchange. This used to be a full /claude/message turn from the browser:
// every knowledge layer assembled, an interactive engine slot taken at the
// exact moment the user is most likely to type a follow-up, and an
// FCP-flavoured prompt for every chat. It is now one small background
// utility call on the server (POST /sessions/:id/title/generate).

/** Assistant bubbles that carry an error are not part of the conversation;
 *  re-sending them as history taught the model to apologise for engine
 *  outages it never had. */
const ERROR_BUBBLE_PREFIX = '⚠️ Error:';
function conversationOnly(messages: Message[]): Message[] {
  return messages.filter((m) => !(m.role === 'assistant' && m.content.startsWith(ERROR_BUBBLE_PREFIX)));
}

export function useClaude() {
  const {
    sessionId,
    moduleId,
    areaId,
    model,
    thinking,
    creativity,
    precision,
    selectedPersonas,
    selectedSkills,
    multiPerspective,
    metaCognitiveEnabled,
    structureReference,
    referenceOutput,
    systemPrompt,
    selectedOutputFormats,
    plainTextMode,
    multiAgentEnabled,
    multiAgentTeam,
    multiAgentStyle,
    knowledgeSources,
    messages,
    moduleInputs,
    uploadedFileIds,
    transparencyLevel,
    writingTone,
    emojiEnabled,
    nativeReasoningEnabled,
    iterativeReasoningEnabled,
    atomInjectionEnabled,
    atomCollectionEnabled,
    audience,
    channel,
    outputLanguage,
    seed,
    isStreaming,
    streamingText,
    streamingThinking,
    lastInputTokens,
    lastOutputTokens,
    addMessage,
    handleStreamEvent,
    startStreaming,
    stopStreaming,
    setSessionId,
  } = useSessionStore();

  const { ireChainId, ireCurrentPhase, ireTotalPhases, ireCurrentPhaseName } = useStreamStore();

  const compactionEnabled = useSettingsStore((s) => s.compactionEnabled);
  const { isTeamMode, user } = useAuthStore();
  const [budgetWarning, setBudgetWarning] = useState<string | null>(null);

  // Check budget status on mount and when messages change
  useEffect(() => {
    if (!isTeamMode || !user || user.id === 'solo') {
      setBudgetWarning(null);
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) return;

    fetch('/api/auth/me/budget', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.budget && data.budget.budget > 0) {
          if (data.budget.isOverBudget) {
            setBudgetWarning(`Budget exceeded: ${data.budget.used.toLocaleString()}/${data.budget.budget.toLocaleString()} tokens used`);
          } else if (data.budget.isNearLimit) {
            setBudgetWarning(`Approaching budget limit: ${Math.round(data.budget.percentUsed)}% used`);
          } else {
            setBudgetWarning(null);
          }
        } else {
          setBudgetWarning(null);
        }
      })
      .catch(() => setBudgetWarning(null));
  }, [isTeamMode, user, messages.length]);

  /** Resolves true when an answer was produced; false when the turn failed
   *  (engine busy/disabled, network, budget) so the caller can keep the
   *  user's text for a retry. */
  const runMessage = useCallback(
    async (userMessage: string, thinkingOverride?: 'think_hard' | 'investigate' | 'plan_first'): Promise<boolean> => {
      if (!userMessage.trim() || isStreaming) return false;

      // Budget pre-check (frontend warning only - backend enforces hard limit)
      if (budgetWarning && budgetWarning.includes('exceeded')) {
        handleStreamEvent({
          type: 'error',
          message: 'Monthly budget exceeded. Please contact your administrator.',
        });
        return false;
      }

      // Track whether this is the very first message — used to trigger AI title generation
      const isFirstMessage = messages.length === 0;

      // Open chat's expert lens, read at call time (the page sets it right
      // before this call on the first turn — a captured value would be stale).
      // With a lens, the request carries the module and area so the composer
      // loads that module's prompt, area context and skills instead of the
      // generic override; the session stays an open chat.
      const lens = useConfigStore.getState().lens;

      // Add user message to local state immediately
      const userMsg: Message = {
        id: crypto.randomUUID(),
        sessionId: sessionId || '',
        role: 'user',
        content: userMessage,
        createdAt: new Date().toISOString(),
      };
      addMessage(userMsg);

      // Ensure a session exists in the DB (create on first message)
      let activeSessionId = sessionId;
      if (!activeSessionId && moduleId) {
        try {
          const session = await createSession({
            moduleId,
            title: userMessage.slice(0, 80) + (userMessage.length > 80 ? '…' : ''),
            config: {
              model,
              thinking,
              creativity,
              transparencyLevel,
              selectedOutputFormats,
              selectedPersonas,
              selectedSkills,
              moduleInputs,
              knowledgeSources,
              plainTextMode,
              writingTone,
              audience: audience || undefined,
              outputLanguage: outputLanguage || undefined,
              lens: lens ?? undefined,
            },
          });
          activeSessionId = session.id;
          setSessionId(session.id);
        } catch {
          // Non-fatal — continue without persistence if session creation fails
        }
      }

      // Build the output format instruction string server-side at request time
      const outputInstruction = buildOutputInstruction(selectedOutputFormats);

      // Start streaming
      const controller = startStreaming();

      let responseText = '';
      let failed = false;

      try {
        const stream = streamMessage(
          {
            model,
            thinking: thinkingOverride ?? thinking,
            creativity,
            precision,
            moduleId: lens ? lens.moduleId : (moduleId || undefined),
            areaId: lens ? (lens.areaId || undefined) : (areaId || undefined),
            transparencyLevel,
            // An empty override lets the composer load the lens module's own prompt.
            systemPrompt: lens ? '' : systemPrompt,
            outputInstruction: outputInstruction || undefined,
            plainTextMode,
            multiAgentEnabled,
            multiAgentTeam,
            multiAgentStyle,
            userMessage,
            history: conversationOnly(messages),
            outputFormats: selectedOutputFormats,
            knowledgeSources,
            moduleInputs,
            uploadedFileIds: uploadedFileIds.filter((id) => id), // only completed uploads
            selectedPersonas,
            selectedSkills,
            multiPerspective,
            metaCognitiveEnabled,
            structureReference,
            referenceOutput: referenceOutput || undefined,
            writingTone,
            emojiEnabled,
            nativeReasoningEnabled,
            iterativeReasoningEnabled: iterativeReasoningEnabled || undefined,
            atomInjectionEnabled,
            atomCollectionEnabled,
            audience: audience || undefined,
            channel: channel || undefined,
            outputLanguage: outputLanguage || undefined,
            seed: seed !== undefined ? seed : undefined,
            sessionId: activeSessionId || undefined,
            compactionEnabled,
          },
          controller.signal
        );

        for await (const event of stream) {
          handleStreamEvent(event);
          if (event.type === 'text_delta') responseText += event.content;
          if (event.type === 'error') {
            console.error('[useClaude] stream error event:', event.message);
            failed = true;
            // Surface the error as an assistant message so it's visible
            addMessage({
              id: crypto.randomUUID(),
              sessionId: activeSessionId || '',
              role: 'assistant',
              content: `⚠️ Error: ${event.message}`,
              createdAt: new Date().toISOString(),
            });
            break;
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          console.error('[useClaude] stream catch error:', msg);
          failed = true;
          handleStreamEvent({ type: 'error', message: msg });
          addMessage({
            id: crypto.randomUUID(),
            sessionId: activeSessionId || '',
            role: 'assistant',
            content: `⚠️ Error: ${msg}`,
            createdAt: new Date().toISOString(),
          });
        }
      }

      // After the first successful response, the server writes a title in the background
      if (isFirstMessage && activeSessionId && responseText) {
        void generateSessionTitle(activeSessionId, userMessage, responseText);
      }
      return !failed && responseText.length > 0;
    },
    [
      sessionId, moduleId, areaId, model, thinking, creativity, precision, selectedPersonas, selectedSkills, multiPerspective,
      metaCognitiveEnabled, structureReference, systemPrompt, selectedOutputFormats, plainTextMode,
      multiAgentEnabled, multiAgentTeam, multiAgentStyle,
      knowledgeSources, messages, moduleInputs, uploadedFileIds, isStreaming,
      writingTone, emojiEnabled, nativeReasoningEnabled, iterativeReasoningEnabled, audience, channel, outputLanguage, seed,
      transparencyLevel, addMessage, handleStreamEvent, startStreaming, setSessionId, budgetWarning,
    ]
  );

  return {
    runMessage,
    stopStreaming,
    isStreaming,
    streamingText,
    streamingThinking,
    messages,
    lastInputTokens,
    lastOutputTokens,
    model,
    budgetWarning,
    // IRE state
    ireChainId,
    ireCurrentPhase,
    ireTotalPhases,
    ireCurrentPhaseName,
  };
}
