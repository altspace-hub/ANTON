import { useCallback, useState, useEffect } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { streamMessage, createSession, updateSessionTitle } from '@/lib/api';
import { buildOutputInstruction } from '@/lib/output-format-definitions';
import type { Message, ModelId, StreamEvent } from '@/lib/types';

// ── AI Title Generator ──────────────────────────────────────
// Fires a quick background call after the first response in a session
// to produce a concise 5-8 word title, then PATCHes the session record.

const EMPTY_KS = {
  modes: {
    claudeKnowledge: { enabled: false, webSearchEnabled: false, description: '' },
    onlineReference: { enabled: false, urls: [] as string[], fetchDepth: 'full' as const },
    localFolder: { enabled: false, folderPaths: [] as string[], fileFilter: undefined, recursive: false },
    combinedMode: { enabled: false, priority: 'merged' as const, instructions: '' },
  },
};

const TITLE_SYSTEM_PROMPT =
  'You generate concise session titles for FCP compliance consultations. ' +
  'Given the user request and a preview of the AI response, output ONLY a 5-8 word title that captures the core topic. ' +
  'No quotes, no trailing punctuation, no explanation. Start with an action word or topic noun.';

async function generateAndSaveTitle(
  sessionId: string,
  userMessage: string,
  responsePreview: string,
  model: ModelId
): Promise<void> {
  try {
    const titleStream = streamMessage({
      model,
      thinking: 'quick',
      creativity: 'strict',
      systemPrompt: TITLE_SYSTEM_PROMPT,
      userMessage: `User request: "${userMessage.slice(0, 200)}"\nResponse preview: "${responsePreview.slice(0, 400)}"`,
      history: [],
      outputFormats: [],
      knowledgeSources: EMPTY_KS,
      moduleInputs: {},
    });

    let raw = '';
    for await (const event of titleStream) {
      if (event.type === 'text_delta') raw += event.content;
      if (event.type === 'stream_end' || event.type === 'error') break;
    }

    const title = raw.trim().replace(/^["']|["']$/g, '').replace(/[.!?]$/, '');
    if (title) await updateSessionTitle(sessionId, title);
  } catch {
    // Non-fatal — original 80-char title stays
  }
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

  const runMessage = useCallback(
    async (userMessage: string) => {
      if (!userMessage.trim() || isStreaming) return;

      // Budget pre-check (frontend warning only - backend enforces hard limit)
      if (budgetWarning && budgetWarning.includes('exceeded')) {
        handleStreamEvent({
          type: 'error',
          message: 'Monthly budget exceeded. Please contact your administrator.',
        });
        return;
      }

      // Track whether this is the very first message — used to trigger AI title generation
      const isFirstMessage = messages.length === 0;

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

      try {
        const stream = streamMessage(
          {
            model,
            thinking,
            creativity,
            precision,
            moduleId: moduleId || undefined,
            areaId: areaId || undefined,
            transparencyLevel,
            systemPrompt,
            outputInstruction: outputInstruction || undefined,
            plainTextMode,
            multiAgentEnabled,
            multiAgentTeam,
            multiAgentStyle,
            userMessage,
            history: messages,
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
            audience: audience || undefined,
            channel: channel || undefined,
            outputLanguage: outputLanguage || undefined,
            seed: seed !== undefined ? seed : undefined,
            sessionId: activeSessionId || undefined,
          },
          controller.signal
        );

        for await (const event of stream) {
          handleStreamEvent(event);
          if (event.type === 'text_delta') responseText += event.content;
          if (event.type === 'error') break;
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          handleStreamEvent({
            type: 'error',
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // After the first successful response, generate an AI title in the background
      if (isFirstMessage && activeSessionId && responseText) {
        generateAndSaveTitle(activeSessionId, userMessage, responseText, model);
      }
    },
    [
      sessionId, moduleId, areaId, model, thinking, creativity, precision, selectedPersonas, selectedSkills, multiPerspective,
      metaCognitiveEnabled, structureReference, systemPrompt, selectedOutputFormats, plainTextMode,
      multiAgentEnabled, multiAgentTeam, multiAgentStyle,
      knowledgeSources, messages, moduleInputs, uploadedFileIds, isStreaming,
      writingTone, emojiEnabled, nativeReasoningEnabled, audience, channel, outputLanguage, seed,
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
  };
}
