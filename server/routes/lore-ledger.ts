/**
 * LONE-09: World-building Lore Ledger
 *
 * Per-session/per-project JSON ledger for fiction and creative writing.
 * Stores named entities (characters, locations, factions, events, items, world rules)
 * and provides a Claude-powered consistency checker.
 *
 * Routes:
 *   GET    /api/lore-ledger/entries          — list entries (filterable by project/session/type)
 *   POST   /api/lore-ledger/entries          — create entry
 *   PUT    /api/lore-ledger/entries/:id      — update entry
 *   DELETE /api/lore-ledger/entries/:id      — delete entry
 *   GET    /api/lore-ledger/entries/:id      — single entry
 *   POST   /api/lore-ledger/check            — consistency check (SSE)
 *   GET    /api/lore-ledger/export           — export full ledger as JSON
 *   POST   /api/lore-ledger/import           — import ledger JSON
 */

import { Router } from 'express';
import type { Database } from 'better-sqlite3';
import type Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { streamChat, mapModelToProvider } from '../services/provider-router.js';

export type EntryType = 'character' | 'location' | 'faction' | 'event' | 'item' | 'world_rule';

interface LoreEntry {
  id: string;
  user_id: string;
  session_id: string | null;
  project_id: string | null;
  entry_type: EntryType;
  name: string;
  summary: string;
  properties: string; // JSON
  tags: string;       // JSON
  created_at: string;
  updated_at: string;
}

interface LoreEntryOut extends Omit<LoreEntry, 'properties' | 'tags'> {
  properties: Record<string, unknown>;
  tags: string[];
}

function parseEntry(row: LoreEntry): LoreEntryOut {
  return {
    ...row,
    properties: JSON.parse(row.properties || '{}'),
    tags: JSON.parse(row.tags || '[]'),
  };
}

export function createLoreLedgerRoutes(db: Database, anthropic: Anthropic | null | undefined) {
  const router = Router();

  // GET /api/lore-ledger/entries
  router.get('/lore-ledger/entries', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { project_id, session_id, entry_type, q } = req.query as Record<string, string>;
      const conditions = ['user_id = ?'];
      const params: unknown[] = [userId];

      if (project_id) { conditions.push('project_id = ?'); params.push(project_id); }
      if (session_id) { conditions.push('session_id = ?'); params.push(session_id); }
      if (entry_type) { conditions.push('entry_type = ?'); params.push(entry_type); }
      if (q) { conditions.push("(name LIKE ? OR summary LIKE ?)"); params.push(`%${q}%`, `%${q}%`); }

      const rows = db.prepare(
        `SELECT * FROM lore_ledger_entries WHERE ${conditions.join(' AND ')} ORDER BY entry_type, name`
      ).all(...params) as LoreEntry[];

      return res.json(rows.map(parseEntry));
    } catch (err) {
      console.error('[lore-ledger/entries GET]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // GET /api/lore-ledger/entries/:id
  router.get('/lore-ledger/entries/:id', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });
      const row = db.prepare(
        `SELECT * FROM lore_ledger_entries WHERE id = ? AND user_id = ?`
      ).get(req.params.id, userId) as LoreEntry | undefined;
      if (!row) return res.status(404).json({ error: 'Entry not found' });
      return res.json(parseEntry(row));
    } catch (err) {
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // POST /api/lore-ledger/entries
  router.post('/lore-ledger/entries', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { entry_type = 'character', name, summary = '', properties = {}, tags = [], project_id, session_id } =
        req.body as Partial<{ entry_type: EntryType; name: string; summary: string; properties: Record<string, unknown>; tags: string[]; project_id: string; session_id: string }>;

      if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

      const VALID_TYPES: EntryType[] = ['character', 'location', 'faction', 'event', 'item', 'world_rule'];
      if (!VALID_TYPES.includes(entry_type)) {
        return res.status(400).json({ error: `entry_type must be one of: ${VALID_TYPES.join(', ')}` });
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO lore_ledger_entries (id, user_id, session_id, project_id, entry_type, name, summary, properties, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(id, userId, session_id ?? null, project_id ?? null, entry_type, name.trim(), summary, JSON.stringify(properties), JSON.stringify(tags), now, now);

      return res.status(201).json({ id, ok: true });
    } catch (err) {
      console.error('[lore-ledger/entries POST]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // PUT /api/lore-ledger/entries/:id
  router.put('/lore-ledger/entries/:id', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const existing = db.prepare(
        `SELECT id FROM lore_ledger_entries WHERE id = ? AND user_id = ?`
      ).get(req.params.id, userId);
      if (!existing) return res.status(404).json({ error: 'Entry not found' });

      const { entry_type, name, summary, properties, tags, project_id, session_id } =
        req.body as Partial<{ entry_type: EntryType; name: string; summary: string; properties: Record<string, unknown>; tags: string[]; project_id: string; session_id: string }>;

      const fields: string[] = [];
      const params: unknown[] = [];

      if (name !== undefined) { fields.push('name = ?'); params.push(name.trim()); }
      if (entry_type !== undefined) { fields.push('entry_type = ?'); params.push(entry_type); }
      if (summary !== undefined) { fields.push('summary = ?'); params.push(summary); }
      if (properties !== undefined) { fields.push('properties = ?'); params.push(JSON.stringify(properties)); }
      if (tags !== undefined) { fields.push('tags = ?'); params.push(JSON.stringify(tags)); }
      if (project_id !== undefined) { fields.push('project_id = ?'); params.push(project_id); }
      if (session_id !== undefined) { fields.push('session_id = ?'); params.push(session_id); }
      fields.push('updated_at = ?'); params.push(new Date().toISOString());

      params.push(req.params.id, userId);
      db.prepare(
        `UPDATE lore_ledger_entries SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`
      ).run(...params);

      return res.json({ ok: true });
    } catch (err) {
      console.error('[lore-ledger/entries PUT]', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // DELETE /api/lore-ledger/entries/:id
  router.delete('/lore-ledger/entries/:id', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });
      const result = db.prepare(
        `DELETE FROM lore_ledger_entries WHERE id = ? AND user_id = ?`
      ).run(req.params.id, userId);
      if (result.changes === 0) return res.status(404).json({ error: 'Entry not found' });
      return res.json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: 'Internal error' });
    }
  });

  // POST /api/lore-ledger/check  (SSE)
  // Body: { text: string, project_id?: string, session_id?: string }
  // Streams Claude analysis of consistency against the ledger
  router.post('/lore-ledger/check', async (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { text, project_id, session_id } = req.body as { text?: string; project_id?: string; session_id?: string };
      if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
      if (text.length > 10_000) return res.status(400).json({ error: 'text must be under 10,000 characters' });

      // Load ledger for this user/project
      const conditions = ['user_id = ?'];
      const params: unknown[] = [userId];
      if (project_id) { conditions.push('project_id = ?'); params.push(project_id); }
      else if (session_id) { conditions.push('session_id = ?'); params.push(session_id); }

      const entries = db.prepare(
        `SELECT entry_type, name, summary, properties FROM lore_ledger_entries WHERE ${conditions.join(' AND ')} ORDER BY entry_type, name LIMIT 200`
      ).all(...params) as { entry_type: string; name: string; summary: string; properties: string }[];

      if (entries.length === 0) {
        return res.status(400).json({ error: 'No ledger entries found. Add characters, locations, and world rules first.' });
      }

      // Build ledger context
      const ledgerContext = entries.map(e => {
        const props = JSON.parse(e.properties || '{}');
        const propLines = Object.entries(props).map(([k, v]) => `  - ${k}: ${v}`).join('\n');
        return `**${e.entry_type.toUpperCase()}: ${e.name}**\n${e.summary}${propLines ? '\n' + propLines : ''}`;
      }).join('\n\n');

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const systemPrompt = `You are a world-building consistency editor. You have been given a Lore Ledger — a structured record of all established facts, characters, locations, factions, and world rules for a fictional project.

Your job is to review a passage of writing and identify any **inconsistencies, contradictions, or continuity errors** relative to the established lore.

## Output Format
1. **Consistency Score**: X/10 (10 = perfectly consistent)
2. **Issues Found** — list each issue with:
   - Type: Contradiction | Continuity Error | Undefined Entity | World Rule Violation
   - Quote from text (the problematic phrase)
   - What the ledger says
   - Suggested fix
3. **Undefined Entities** — names/places/things in the text not yet in the ledger (potential additions)
4. **Summary** — 1-2 sentences overall assessment

If no issues are found, say so clearly and provide a brief confirmation of what was checked.`;

      const userPrompt = `## Lore Ledger

${ledgerContext}

---

## Text to Check

${text}

---

Please analyse the text for consistency with the lore ledger above.`;

      const hasProvider = !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY || process.env.MISTRAL_API_KEY || process.env.OLLAMA_BASE_URL);
      if (!hasProvider) { res.status(503).json({ error: 'No AI provider configured' }); return; }

      const result = await streamChat({
        model: mapModelToProvider('claude-sonnet-4-6'),
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        maxTokens: 2048,
      }, res);

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (err) {
      console.error('[lore-ledger/check]', err);
      if (!res.headersSent) return res.status(500).json({ error: 'Consistency check failed' });
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Consistency check failed' })}\n\n`);
      res.end();
    }
  });

  // GET /api/lore-ledger/export?project_id=...
  router.get('/lore-ledger/export', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });
      const { project_id } = req.query as { project_id?: string };

      const conditions = ['user_id = ?'];
      const params: unknown[] = [userId];
      if (project_id) { conditions.push('project_id = ?'); params.push(project_id); }

      const rows = db.prepare(
        `SELECT * FROM lore_ledger_entries WHERE ${conditions.join(' AND ')} ORDER BY entry_type, name`
      ).all(...params) as LoreEntry[];

      const output = {
        version: 1,
        exported_at: new Date().toISOString(),
        project_id: project_id ?? null,
        entries: rows.map(parseEntry),
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="lore-ledger-${Date.now()}.json"`);
      return res.json(output);
    } catch (err) {
      return res.status(500).json({ error: 'Export failed' });
    }
  });

  // POST /api/lore-ledger/import
  router.post('/lore-ledger/import', (req, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Unauthorised' });

      const { entries, project_id } = req.body as {
        entries?: Array<Partial<LoreEntryOut>>;
        project_id?: string;
      };

      if (!Array.isArray(entries) || entries.length === 0) {
        return res.status(400).json({ error: 'entries array required' });
      }
      if (entries.length > 500) return res.status(400).json({ error: 'Max 500 entries per import' });

      const now = new Date().toISOString();
      const insert = db.prepare(
        `INSERT OR IGNORE INTO lore_ledger_entries (id, user_id, session_id, project_id, entry_type, name, summary, properties, tags, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      let imported = 0;
      for (const entry of entries) {
        if (!entry.name?.trim()) continue;
        insert.run(
          crypto.randomUUID(), userId,
          entry.session_id ?? null,
          project_id ?? entry.project_id ?? null,
          entry.entry_type ?? 'character',
          entry.name.trim(),
          entry.summary ?? '',
          JSON.stringify(entry.properties ?? {}),
          JSON.stringify(entry.tags ?? []),
          now, now
        );
        imported++;
      }

      return res.json({ ok: true, imported });
    } catch (err) {
      console.error('[lore-ledger/import]', err);
      return res.status(500).json({ error: 'Import failed' });
    }
  });

  return router;
}
