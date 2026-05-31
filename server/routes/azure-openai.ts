/**
 * Azure OpenAI Routes — /api/azure-openai/*
 *
 * CRUD for Azure OpenAI configuration and deployment mappings.
 * API keys are encrypted at rest via credential-vault.
 */

import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { AzureOpenAI } from 'openai';
import type { DatabaseAdapter } from '../db/database.js';
import { encrypt, decrypt } from '../services/credential-vault.js';
import { safeError } from '../lib/error-response.js';

// ── Zod Schemas ───────────────────────────────────────────────────────────────

const configSchema = z.object({
  endpoint: z.string().url().min(1),
  apiKey: z.string().min(1).optional(), // Optional on update — keeps existing key if omitted
  apiVersion: z.string().optional().default('2024-10-21'),
  isActive: z.boolean().optional().default(true),
  bingSearchApiKey: z.string().optional(), // Bing Web Search API key for web search grounding
});

const deploymentSchema = z.object({
  deploymentName: z.string().min(1).max(200),
  modelName: z.string().min(1).max(200),
  displayName: z.string().max(200).optional(),
  isReasoningModel: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

const updateDeploymentSchema = z.object({
  deploymentName: z.string().min(1).max(200).optional(),
  modelName: z.string().min(1).max(200).optional(),
  displayName: z.string().max(200).optional(),
  isReasoningModel: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const testSchema = z.object({
  endpoint: z.string().url().min(1),
  apiKey: z.string().min(1).optional(), // Optional — falls back to stored key
  apiVersion: z.string().optional().default('2024-10-21'),
  deploymentName: z.string().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Mask an API key, showing only the last 4 characters. */
function maskApiKey(key: string): string {
  if (!key || key.length <= 4) return '****';
  return '*'.repeat(key.length - 4) + key.slice(-4);
}

// ── Route Factory ─────────────────────────────────────────────────────────────

export async function createAzureOpenAIRoutes(db: DatabaseAdapter) {
  const router = Router();

  // ── GET /azure-openai/config — retrieve configuration ───────────────────

  router.get('/azure-openai/config', async (_req, res) => {
    try {
      const row = await db.get<{
        id: string;
        endpoint: string;
        api_key_encrypted: string;
        api_version: string;
        is_active: boolean;
        bing_search_api_key_encrypted: string | null;
        created_at: string;
        updated_at: string;
      }>(
        "SELECT id, endpoint, api_key_encrypted, api_version, is_active, bing_search_api_key_encrypted, created_at, updated_at FROM azure_openai_config WHERE id = 'default'"
      );

      if (!row) {
        res.json({ configured: false, config: null });
        return;
      }

      const decryptedKey = decrypt(row.api_key_encrypted);
      const hasBingKey = !!row.bing_search_api_key_encrypted;

      res.json({
        configured: true,
        config: {
          id: row.id,
          endpoint: row.endpoint,
          apiKey: maskApiKey(decryptedKey),
          apiVersion: row.api_version,
          isActive: row.is_active,
          bingSearchConfigured: hasBingKey,
          bingSearchApiKey: hasBingKey ? maskApiKey(decrypt(row.bing_search_api_key_encrypted!)) : undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      });
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // ── PUT /azure-openai/config — save or update configuration ─────────────

  router.put('/azure-openai/config', async (req, res) => {
    try {
      const parsed = configSchema.parse(req.body);

      const existing = await db.get<{ id: string; api_key_encrypted: string; bing_search_api_key_encrypted: string | null }>(
        "SELECT id, api_key_encrypted, bing_search_api_key_encrypted FROM azure_openai_config WHERE id = 'default'"
      );

      // Use new key if provided, otherwise keep existing encrypted key
      const encryptedKey = parsed.apiKey
        ? encrypt(parsed.apiKey)
        : existing?.api_key_encrypted;

      if (!encryptedKey) {
        res.status(400).json({ error: 'API key is required for initial setup' });
        return;
      }

      // Handle Bing Search API key — encrypt if provided, keep existing if omitted
      const encryptedBingKey = parsed.bingSearchApiKey
        ? encrypt(parsed.bingSearchApiKey)
        : existing?.bing_search_api_key_encrypted ?? null;

      if (existing) {
        await db.run(
          `UPDATE azure_openai_config
              SET endpoint = $1,
                  api_key_encrypted = $2,
                  api_version = $3,
                  is_active = $4,
                  bing_search_api_key_encrypted = $5,
                  updated_at = NOW()
            WHERE id = 'default'`,
          parsed.endpoint,
          encryptedKey,
          parsed.apiVersion,
          parsed.isActive,
          encryptedBingKey
        );
      } else {
        await db.run(
          `INSERT INTO azure_openai_config (id, endpoint, api_key_encrypted, api_version, is_active, bing_search_api_key_encrypted)
           VALUES ('default', $1, $2, $3, $4, $5)`,
          parsed.endpoint,
          encryptedKey,
          parsed.apiVersion,
          parsed.isActive,
          encryptedBingKey
        );
      }

      const displayKey = parsed.apiKey ? maskApiKey(parsed.apiKey) : '****';
      res.json({
        ok: true,
        config: {
          id: 'default',
          endpoint: parsed.endpoint,
          apiKey: displayKey,
          apiVersion: parsed.apiVersion,
          isActive: parsed.isActive,
          bingSearchConfigured: !!encryptedBingKey,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // ── GET /azure-openai/deployments — list all deployments ────────────────

  router.get('/azure-openai/deployments', async (_req, res) => {
    try {
      const rows = await db.all<{
        id: string;
        config_id: string;
        deployment_name: string;
        model_name: string;
        display_name: string | null;
        is_reasoning_model: boolean;
        is_active: boolean;
        created_at: string;
      }>(
        `SELECT id, config_id, deployment_name, model_name, display_name,
                is_reasoning_model, is_active, created_at
           FROM azure_openai_deployments
          ORDER BY created_at ASC`
      );

      res.json({
        deployments: rows.map((r) => ({
          id: r.id,
          configId: r.config_id,
          deploymentName: r.deployment_name,
          modelName: r.model_name,
          displayName: r.display_name,
          isReasoningModel: r.is_reasoning_model,
          isActive: r.is_active,
          createdAt: r.created_at,
        })),
      });
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // ── POST /azure-openai/deployments — add a new deployment ──────────────

  router.post('/azure-openai/deployments', async (req, res) => {
    try {
      const parsed = deploymentSchema.parse(req.body);
      const id = crypto.randomUUID();

      await db.run(
        `INSERT INTO azure_openai_deployments
           (id, config_id, deployment_name, model_name, display_name, is_reasoning_model, is_active)
         VALUES ($1, 'default', $2, $3, $4, $5, $6)`,
        id,
        parsed.deploymentName,
        parsed.modelName,
        parsed.displayName ?? null,
        parsed.isReasoningModel,
        parsed.isActive
      );

      res.status(201).json({
        ok: true,
        deployment: {
          id,
          configId: 'default',
          deploymentName: parsed.deploymentName,
          modelName: parsed.modelName,
          displayName: parsed.displayName ?? null,
          isReasoningModel: parsed.isReasoningModel,
          isActive: parsed.isActive,
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // ── PUT /azure-openai/deployments/:id — update a deployment ────────────

  router.put('/azure-openai/deployments/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const parsed = updateDeploymentSchema.parse(req.body);

      const existing = await db.get<{ id: string }>(
        'SELECT id FROM azure_openai_deployments WHERE id = $1',
        id
      );

      if (!existing) {
        res.status(404).json({ error: 'Deployment not found' });
        return;
      }

      // Build dynamic SET clause from provided fields
      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (parsed.deploymentName !== undefined) {
        fields.push(`deployment_name = $${paramIndex++}`);
        values.push(parsed.deploymentName);
      }
      if (parsed.modelName !== undefined) {
        fields.push(`model_name = $${paramIndex++}`);
        values.push(parsed.modelName);
      }
      if (parsed.displayName !== undefined) {
        fields.push(`display_name = $${paramIndex++}`);
        values.push(parsed.displayName);
      }
      if (parsed.isReasoningModel !== undefined) {
        fields.push(`is_reasoning_model = $${paramIndex++}`);
        values.push(parsed.isReasoningModel);
      }
      if (parsed.isActive !== undefined) {
        fields.push(`is_active = $${paramIndex++}`);
        values.push(parsed.isActive);
      }

      if (fields.length === 0) {
        res.status(400).json({ error: 'No fields to update' });
        return;
      }

      values.push(id);
      await db.run(
        `UPDATE azure_openai_deployments SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
        ...values
      );

      // Return the updated deployment
      const updated = await db.get<{
        id: string;
        config_id: string;
        deployment_name: string;
        model_name: string;
        display_name: string | null;
        is_reasoning_model: boolean;
        is_active: boolean;
        created_at: string;
      }>(
        'SELECT id, config_id, deployment_name, model_name, display_name, is_reasoning_model, is_active, created_at FROM azure_openai_deployments WHERE id = $1',
        id
      );

      res.json({
        ok: true,
        deployment: updated
          ? {
              id: updated.id,
              configId: updated.config_id,
              deploymentName: updated.deployment_name,
              modelName: updated.model_name,
              displayName: updated.display_name,
              isReasoningModel: updated.is_reasoning_model,
              isActive: updated.is_active,
              createdAt: updated.created_at,
            }
          : null,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // ── DELETE /azure-openai/deployments/:id — remove a deployment ─────────

  router.delete('/azure-openai/deployments/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await db.get<{ id: string }>(
        'SELECT id FROM azure_openai_deployments WHERE id = $1',
        id
      );

      if (!existing) {
        res.status(404).json({ error: 'Deployment not found' });
        return;
      }

      await db.run('DELETE FROM azure_openai_deployments WHERE id = $1', id);

      res.json({ ok: true, deleted: id });
    } catch (err) {
      const message = safeError(err);
      res.status(500).json({ error: message });
    }
  });

  // ── POST /azure-openai/test — test connection to Azure OpenAI ──────────

  router.post('/azure-openai/test', async (req, res) => {
    try {
      const parsed = testSchema.parse(req.body);

      // Fall back to stored key if not provided in request
      let effectiveApiKey = parsed.apiKey;
      if (!effectiveApiKey) {
        const stored = await db.get<{ api_key_encrypted: string }>(
          "SELECT api_key_encrypted FROM azure_openai_config WHERE id = 'default'"
        );
        if (stored) effectiveApiKey = decrypt(stored.api_key_encrypted);
      }
      if (!effectiveApiKey) {
        res.status(400).json({ ok: false, error: 'No API key provided and none stored' });
        return;
      }

      const client = new AzureOpenAI({
        endpoint: parsed.endpoint,
        apiKey: effectiveApiKey,
        apiVersion: parsed.apiVersion,
      });

      // If a deployment name is provided, try a tiny completion; otherwise list models
      if (parsed.deploymentName) {
        // Test with max_completion_tokens (newer models require this)
        const completion = await client.chat.completions.create({
          model: parsed.deploymentName,
          messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
          max_completion_tokens: 10,
        } as unknown as import('openai/resources/chat/completions').ChatCompletionCreateParamsNonStreaming);

        res.json({
          ok: true,
          message: 'Connection successful — deployment responded.',
          model: completion.model,
          usage: completion.usage,
          response: completion.choices?.[0]?.message?.content,
        });
      } else {
        const models = await client.models.list();
        const modelList = [];
        for await (const model of models) {
          modelList.push({ id: model.id, owned_by: model.owned_by });
        }

        res.json({
          ok: true,
          message: 'Connection successful.',
          models: modelList,
        });
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation failed', details: err.issues });
        return;
      }
      const message = safeError(err);
      res.status(500).json({
        ok: false,
        error: message,
      });
    }
  });

  // ── POST /azure-openai/diagnose — test Azure with different parameter combos
  router.post('/azure-openai/diagnose', async (req, res) => {
    try {
      const config = await db.get<{ endpoint: string; api_key_encrypted: string; api_version: string }>(
        "SELECT endpoint, api_key_encrypted, api_version FROM azure_openai_config WHERE id = 'default' AND is_active = TRUE"
      );
      if (!config) { res.json({ error: 'Azure not configured' }); return; }

      const { deploymentName } = req.body as { deploymentName?: string };
      if (!deploymentName) { res.json({ error: 'deploymentName required' }); return; }

      const apiKey = decrypt(config.api_key_encrypted);
      const results: Array<{ test: string; ok: boolean; error?: string; response?: string }> = [];

      // Test 1: Basic non-streaming
      try {
        const client = new AzureOpenAI({ endpoint: config.endpoint, apiKey, apiVersion: config.api_version, deployment: deploymentName, timeout: 30_000 });
        const r = await client.chat.completions.create({
          model: deploymentName,
          messages: [{ role: 'user', content: 'Say "test1 ok"' }],
          max_completion_tokens: 10,
        } as unknown as import('openai/resources/chat/completions').ChatCompletionCreateParamsNonStreaming);
        results.push({ test: 'basic (max_completion_tokens)', ok: true, response: r.choices?.[0]?.message?.content || '' });
      } catch (e) { results.push({ test: 'basic (max_completion_tokens)', ok: false, error: safeError(e) }); }

      // Test 2: Streaming
      try {
        const client = new AzureOpenAI({ endpoint: config.endpoint, apiKey, apiVersion: config.api_version, deployment: deploymentName, timeout: 30_000 });
        const stream = await client.chat.completions.create({
          model: deploymentName,
          messages: [{ role: 'user', content: 'Say "test2 ok"' }],
          max_completion_tokens: 10,
          stream: true,
        } as unknown as import('openai/resources/chat/completions').ChatCompletionCreateParamsStreaming);
        let text = '';
        for await (const chunk of stream) { text += chunk.choices?.[0]?.delta?.content || ''; }
        results.push({ test: 'streaming', ok: true, response: text });
      } catch (e) { results.push({ test: 'streaming', ok: false, error: safeError(e) }); }

      // Test 3: With reasoning_effort
      try {
        const client = new AzureOpenAI({ endpoint: config.endpoint, apiKey, apiVersion: config.api_version, deployment: deploymentName, timeout: 60_000 });
        const stream = await client.chat.completions.create({
          model: deploymentName,
          messages: [{ role: 'user', content: 'Say "test3 ok"' }],
          max_completion_tokens: 10,
          stream: true,
          reasoning_effort: 'low',
        } as unknown as import('openai/resources/chat/completions').ChatCompletionCreateParamsStreaming);
        let text = '';
        for await (const chunk of stream) { text += chunk.choices?.[0]?.delta?.content || ''; }
        results.push({ test: 'streaming + reasoning_effort=low', ok: true, response: text });
      } catch (e) { results.push({ test: 'streaming + reasoning_effort=low', ok: false, error: safeError(e) }); }

      // Test 4: Larger context
      try {
        const client = new AzureOpenAI({ endpoint: config.endpoint, apiKey, apiVersion: config.api_version, deployment: deploymentName, timeout: 60_000 });
        const bigSystem = 'You are a helpful assistant. '.repeat(500); // ~14K chars
        const stream = await client.chat.completions.create({
          model: deploymentName,
          messages: [{ role: 'system', content: bigSystem }, { role: 'user', content: 'Say "test4 ok"' }],
          max_completion_tokens: 10,
          stream: true,
        } as unknown as import('openai/resources/chat/completions').ChatCompletionCreateParamsStreaming);
        let text = '';
        for await (const chunk of stream) { text += chunk.choices?.[0]?.delta?.content || ''; }
        results.push({ test: 'streaming + 14K system prompt', ok: true, response: text });
      } catch (e) { results.push({ test: 'streaming + 14K system prompt', ok: false, error: safeError(e) }); }

      // Test 5: 80K system prompt + reasoning_effort=high (matches real gap assessor)
      try {
        const client5 = new AzureOpenAI({ endpoint: config.endpoint, apiKey, apiVersion: config.api_version, deployment: deploymentName, timeout: 600_000, maxRetries: 1 });
        const bigSystem5 = 'You are a compliance expert analyzing AML/CFT regulations for a Nordic credit institution. Assess compliance gaps thoroughly. '.repeat(650);
        const stream5 = await client5.chat.completions.create({
          model: deploymentName,
          messages: [{ role: 'system', content: bigSystem5 }, { role: 'user', content: 'Say "test5 ok"' }],
          max_completion_tokens: 10,
          stream: true,
          reasoning_effort: 'high',
        } as unknown as import('openai/resources/chat/completions').ChatCompletionCreateParamsStreaming);
        let text5 = '';
        for await (const chunk of stream5) { text5 += chunk.choices?.[0]?.delta?.content || ''; }
        results.push({ test: '80K system + reasoning_effort=high', ok: true, response: text5 });
      } catch (e) { results.push({ test: '80K system + reasoning_effort=high', ok: false, error: safeError(e) }); }

      res.json({ results, apiVersion: config.api_version, deployment: deploymentName });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  return router;
}
