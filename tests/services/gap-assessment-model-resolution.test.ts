import { describe, it, expect } from 'vitest';
import { __getModelConfig } from '../../server/services/gap-assessment-engine';

/**
 * The Gap Assessor's model picker was a bespoke two-card control hardcoding
 * "Sonnet 4.6" and "Opus 4.8", with a hand-assembled list of extras fetched
 * separately. It went stale whenever the model registry moved and could never
 * offer a subscription engine, so the assessor was stuck a generation behind
 * every other area of ANTON.
 *
 * Switching it to the shared ModelSelector means the stored value is now a real
 * model id rather than one of two aliases. That is the risk this file guards:
 * the alias branch was the ONLY path to 'investigate' thinking and the larger
 * synthesis budget, so picking Claude by its actual id would have quietly
 * assessed with less reasoning than picking the same model the old way — no
 * error, just a worse assessment.
 */
describe('gap assessment — model tier resolution', () => {
  describe('legacy aliases still work', () => {
    it('resolves the sonnet alias to a concrete model at full reasoning', () => {
      const c = __getModelConfig('sonnet');
      expect(c.model).toBe('claude-sonnet-4-6');
      expect(c.thinkingLevel).toBe('investigate');
      expect(c.maxTokensSynthesis).toBe(128_000);
    });

    it('resolves the opus alias to a concrete model at full reasoning', () => {
      const c = __getModelConfig('opus');
      expect(c.model).toBe('claude-opus-4-8');
      expect(c.thinkingLevel).toBe('investigate');
      expect(c.maxTokensSynthesis).toBe(128_000);
    });
  });

  describe('real model ids get the reasoning their family deserves', () => {
    it('treats an explicit Opus id exactly like the alias', () => {
      const viaAlias = __getModelConfig('opus');
      const viaId = __getModelConfig('claude-opus-4-8');
      expect(viaId.thinkingLevel).toBe(viaAlias.thinkingLevel);
      expect(viaId.maxTokensBatch).toBe(viaAlias.maxTokensBatch);
      expect(viaId.maxTokensSynthesis).toBe(viaAlias.maxTokensSynthesis);
      expect(viaId.model).toBe('claude-opus-4-8');
    });

    it('treats an explicit Sonnet id exactly like the alias', () => {
      const viaAlias = __getModelConfig('sonnet');
      const viaId = __getModelConfig('claude-sonnet-4-6');
      expect(viaId.thinkingLevel).toBe(viaAlias.thinkingLevel);
      expect(viaId.maxTokensBatch).toBe(viaAlias.maxTokensBatch);
      expect(viaId.model).toBe('claude-sonnet-4-6');
    });

    it('honours a newer Claude id verbatim rather than pinning to a default', () => {
      // The whole point of the change is not being stuck a generation behind.
      const c = __getModelConfig('claude-opus-5');
      expect(c.model).toBe('claude-opus-5');
      expect(c.thinkingLevel).toBe('investigate');
    });
  });

  describe('subscription engines', () => {
    it('recognises an sdk:-prefixed Opus as Opus', () => {
      const c = __getModelConfig('sdk:claude-opus-5');
      // Prefix must survive — provider-router routes on it — while the family
      // still earns full reasoning depth.
      expect(c.model).toBe('sdk:claude-opus-5');
      expect(c.thinkingLevel).toBe('investigate');
      expect(c.maxTokensSynthesis).toBe(128_000);
    });

    it('recognises an sdk:-prefixed Sonnet as Sonnet', () => {
      const c = __getModelConfig('sdk:claude-sonnet-5');
      expect(c.model).toBe('sdk:claude-sonnet-5');
      expect(c.thinkingLevel).toBe('investigate');
    });

    it('gives every offered subscription model the same reasoning depth', () => {
      // The engine offers Opus 5, Sonnet 5 and Fable 5. Fable matches neither
      // the opus nor the sonnet pattern, so without a general Claude branch it
      // silently assessed shallower than its two siblings.
      const offered = ['sdk:claude-opus-5', 'sdk:claude-sonnet-5', 'sdk:claude-fable-5'];
      for (const id of offered) {
        const c = __getModelConfig(id);
        expect(c.model, id).toBe(id);
        expect(c.thinkingLevel, id).toBe('investigate');
        expect(c.maxTokensSynthesis, id).toBe(128_000);
      }
    });

    it('extends the same treatment to a Claude family that does not exist yet', () => {
      const c = __getModelConfig('claude-newfamily-9');
      expect(c.thinkingLevel).toBe('investigate');
      expect(c.maxTokensSynthesis).toBe(128_000);
    });

    it('passes a codex engine through untouched', () => {
      const c = __getModelConfig('codex:gpt-5.4');
      expect(c.model).toBe('codex:gpt-5.4');
    });
  });

  describe('other providers', () => {
    it.each([
      ['azure:my-deployment'],
      ['mistral-large-latest'],
      ['gpt-5.4'],
      ['gemini-2.0-flash'],
      ['ollama:llama3'],
      ['compat:openrouter:some/model'],
    ])('passes %s through as the model id', (id) => {
      expect(__getModelConfig(id).model).toBe(id);
    });

    it('does not claim full reasoning depth for a non-Claude model', () => {
      // 'investigate' maps to Claude-specific budgets; other providers get the
      // conservative branch.
      expect(__getModelConfig('mistral-large-latest').thinkingLevel).toBe('think_hard');
    });
  });
});
