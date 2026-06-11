/**
 * smart-actions-analyzer.ts
 * Extracts structured actions from Pathfinder synthesis text.
 * Uses Haiku for fast, cheap extraction — returns typed action objects.
 */

export interface SmartAction {
  type: 'call' | 'directions' | 'website' | 'save_contact' | 'save_org' | 'create_task' | 'start_civic' | 'start_procure' | 'save_knowledge' | 'open_module' | 'task_agent';
  label: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  data: Record<string, string>;
}

const ACTION_EXTRACTION_PROMPT = `You extract actionable items from search results. Given a synthesis and search context, return a JSON array of actions the user might want to take.

Action types:
- "call": Phone number found. data: { phone, name }
- "directions": Address found. data: { address, name }
- "website": Relevant URL found. data: { url, name }
- "save_contact": Person identified. data: { name, title, email, phone, organisation }
- "save_org": Business/org identified. data: { name, industry, website, address }
- "create_task": Actionable step or deadline found. data: { title, description, dueDate }
- "start_civic": Government process identified. data: { title, jurisdiction, domain }
- "start_procure": Procurement need identified. data: { title, category, description }
- "save_knowledge": Key fact or finding worth saving. data: { title, content }
- "open_module": Would benefit from deeper ANTON analysis. data: { moduleId, context }
- "task_agent": Multi-step action that ANTON Task Agent could handle. data: { title, description, steps }

Rules:
- Return 2-6 actions maximum, prioritized by usefulness
- Only include actions that make sense for the search mode
- For "local" and "food" modes: prioritize call, directions, website, save_org
- For "knowledge" and "news" modes: prioritize save_knowledge, create_task, open_module, task_agent
- For "shopping" modes: prioritize website, save_org, start_procure
- For "travel" modes: prioritize directions, website, create_task
- For "fix" modes: prioritize create_task, task_agent, save_knowledge
- Set priority: "high" for immediately actionable, "medium" for useful, "low" for nice-to-have

Return ONLY valid JSON: { "actions": [...] }`;

export async function analyzeForActions(
  synthesis: string,
  searchMode: string,
  query: string,
): Promise<SmartAction[]> {
  try {
    const { sendRequest } = await import('./unified-llm-client.js');
    const { getRoutedUtilityModelSync } = await import('./utility-model.js');
    const result = await sendRequest({
      // The configured utility model, routed to the active provider's small
      // model so the Smart Action Bar also works on non-Claude installs.
      model: getRoutedUtilityModelSync() as import('../../src/lib/types.js').ModelId,
      thinking: 'quick' as import('../../src/lib/types.js').ThinkingLevel,
      system: ACTION_EXTRACTION_PROMPT,
      messages: [{
        role: 'user',
        content: `Search mode: ${searchMode}\nQuery: "${query}"\n\nSynthesis:\n${synthesis.slice(0, 3000)}`,
      }],
      maxTokens: 1500,
    });

    const cleaned = result.text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const actions: SmartAction[] = Array.isArray(parsed.actions) ? parsed.actions : [];

    // Validate each action has required fields
    return actions.filter(a =>
      a.type && a.label && typeof a.data === 'object'
    ).slice(0, 6);
  } catch (err) {
    console.error('[smart-actions] Extraction failed:', err);
    return [];
  }
}
