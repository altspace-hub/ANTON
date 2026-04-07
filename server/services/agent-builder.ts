/**
 * agent-builder.ts — AI-assisted agent creation
 *
 * Uses the LLM to generate agent configurations from natural language descriptions.
 * "I need a support agent for my SaaS product" → complete agent profile.
 */

import type { DatabaseAdapter } from '../db/database.js';
import { callChat } from './provider-router.js';

export async function createAgentBuilder(db: DatabaseAdapter) {

  /**
   * Generate a complete agent configuration from a natural language description.
   */
  async function generateFromDescription(description: string): Promise<{
    name: string; slug: string; roleDescription: string; systemPrompt: string;
    defaultThinking: string; routingKeywords: string[]; escalationPolicy: string;
    suggestedTemplate: string | null; avatar: string; greetingMessage: string;
  }> {
    const result = await callChat({
      tier: 'medium',
      system: `You are an expert at designing AI agent personas for business applications.
Given a description of what kind of agent is needed, generate a complete agent configuration.

Return JSON with these fields:
- name: Short, professional name (e.g., "Product Support", "Travel Coordinator")
- slug: URL-safe lowercase identifier (e.g., "product-support")
- roleDescription: One-line role summary
- systemPrompt: Detailed system prompt (200-500 words) defining the agent's persona, expertise, behavior rules, and domain knowledge. Be specific about what the agent should and shouldn't do.
- defaultThinking: "quick" for simple Q&A, "think" for analysis, "think_hard" for complex reasoning
- routingKeywords: Array of 8-15 keywords that would indicate a query should go to this agent
- escalationPolicy: "notify" (flag for human), "redirect" (send to fallback), "human_only" (always escalate for advice), "queue" (queue for later)
- suggestedTemplate: One of: support, sales, travel, hr, procurement, booking, legal, finance, compliance, general, or null
- avatar: Lucide icon name that fits (e.g., Headset, TrendingUp, Plane, Users, ShoppingCart, Calendar, Scale, Calculator)
- greetingMessage: Friendly first message when the agent starts a conversation

Return ONLY valid JSON.`,
      messages: [{ role: 'user', content: `Design an agent for: ${description}` }],
      maxTokens: 4096,
      db,
    });

    const cleaned = result.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    return JSON.parse(cleaned);
  }

  /**
   * Generate just a system prompt for a given role.
   */
  async function generateSystemPrompt(role: string, context?: string): Promise<string> {
    const result = await callChat({
      tier: 'medium',
      system: 'You are an expert at writing AI system prompts. Generate a detailed, professional system prompt for the specified role. Include: persona definition, expertise areas, behavior rules, tone guidelines, and domain-specific instructions. 200-500 words.',
      messages: [{ role: 'user', content: `Generate a system prompt for: ${role}${context ? `\n\nAdditional context: ${context}` : ''}` }],
      maxTokens: 4096,
      db,
    });
    return result.text;
  }

  /**
   * Suggest routing keywords for an agent type.
   */
  async function suggestKeywords(role: string, description: string): Promise<string[]> {
    const result = await callChat({
      tier: 'small',
      system: 'Return a JSON array of 10-15 keywords that would indicate a query should be routed to this type of agent. Only return the JSON array, nothing else.',
      messages: [{ role: 'user', content: `Agent role: ${role}\nDescription: ${description}` }],
      maxTokens: 1024,
      db,
    });
    const cleaned = result.text.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
    return JSON.parse(cleaned);
  }

  return { generateFromDescription, generateSystemPrompt, suggestKeywords };
}
