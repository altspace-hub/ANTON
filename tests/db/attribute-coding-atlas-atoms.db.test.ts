/**
 * attribute-coding-atlas-atoms.db.test.ts — coding and Risk Atlas atoms carry
 * their owner (team-isolation round 2, gaps file "verify:atoms", first item).
 *
 * An atom with no owner is SHARED on a team server: every user lists, searches
 * and — before this round — could retire it. mintCodingAtom and the Atlas
 * knowledge bridge wrote every atom that way, so one person's Coding Studio
 * lessons and Atlas threat paths reached colleagues who cannot open the project
 * or the Atlas. Against the real schema:
 *
 *   - mintCodingAtom writes owner_user_id = the coding project's projects.user_id,
 *     and in team mode that atom is then out of a colleague's GET /knowledge/atoms;
 *   - pushAtom writes owner_user_id = risk_atlases.owner_user_id; an Atlas with
 *     no owner writes no atom on a team server, and an unowned atom in solo (as
 *     before);
 *   - migration 286 backfills both kinds by join, leaves an owner already set and
 *     a row it cannot attribute alone, and is idempotent.
 *
 * Skips without a test database (tests/setup/db-guard.ts decides which).
 */
import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Server } from 'node:http';
import { resolveTestDatabaseUrl } from '../helpers/test-database-url';
import type { DatabaseAdapter } from '../../server/db/database.js';
import type { RiskAtlasRow } from '../../server/services/risk-atlas/types.js';

const H = vi.hoisted(() => {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  let tag = '';
  for (let i = 0; i < 10; i++) tag += letters[Math.floor(Math.random() * letters.length)];
  return { tag };
});

// The embed after a mint is fire-and-forget; keep it off the network.
vi.mock('../../server/services/hybrid-search.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/hybrid-search.js')>();
  return { ...actual, embedAndStore: vi.fn(async () => undefined) };
});
vi.mock('../../server/services/provider-router.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../server/services/provider-router.js')>();
  return { ...actual, callChat: vi.fn(), streamChat: vi.fn() };
});
vi.mock('../../server/services/utility-model.js', () => ({ getRoutedUtilityModel: async () => 'sdk:claude-sonnet-5' }));

const DATABASE_URL = resolveTestDatabaseUrl();
const d = DATABASE_URL ? describe : describe.skip;

const TOKEN = `nebula${H.tag}`;
const ALICE = `u-alice-${H.tag}`;
const BOB = `u-bob-${H.tag}`;
const PROJECT = `proj-${H.tag}`;
const CODING = `cp-${H.tag}`;
const ATLAS_BOB = `atlas-bob-${H.tag}`;
const ATLAS_NONE = `atlas-none-${H.tag}`;
const MIGRATION = path.resolve(__dirname, '../../server/db/migrations-pg/286_attribute_coding_atlas_atoms.sql');

d('coding and Risk Atlas atoms are attributed (write + migration 286)', () => {
  let db: DatabaseAdapter;
  const savedMode = process.env.DEPLOYMENT_MODE;

  beforeAll(async () => {
    const { PostgresAdapter } = await import('../../server/db/adapters/postgresql-adapter.js');
    db = new PostgresAdapter({ connectionString: DATABASE_URL!, maxConnections: 3 });
    for (const u of [ALICE, BOB]) {
      await db.run(`INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, 'x', 'analyst') ON CONFLICT (id) DO NOTHING`, u, u);
    }
    await db.run(`INSERT INTO projects (id, name, user_id) VALUES (?, 'attr', ?)`, PROJECT, ALICE);
    await db.run(`INSERT INTO coding_projects (id, project_id, name) VALUES (?, ?, 'attr')`, CODING, PROJECT);
    await db.run(`INSERT INTO risk_atlases (id, name, owner_user_id) VALUES (?, 'attr', ?)`, ATLAS_BOB, BOB);
    await db.run(`INSERT INTO risk_atlases (id, name, owner_user_id) VALUES (?, 'attr', NULL)`, ATLAS_NONE);
  });

  afterEach(() => {
    if (savedMode === undefined) delete process.env.DEPLOYMENT_MODE; else process.env.DEPLOYMENT_MODE = savedMode;
  });

  afterAll(async () => {
    try {
      await db.run(`DELETE FROM knowledge_atoms WHERE content LIKE ?`, `%${TOKEN}%`);
      await db.run(`DELETE FROM knowledge_atoms WHERE coding_project_id = ?`, CODING);
      await db.run(`DELETE FROM knowledge_atoms WHERE source_workflow_id = 'risk-atlas' AND source_execution_id IN (?, ?)`, ATLAS_BOB, ATLAS_NONE);
      await db.run(`DELETE FROM risk_atlases WHERE id IN (?, ?)`, ATLAS_BOB, ATLAS_NONE);
      await db.run(`DELETE FROM coding_projects WHERE id = ?`, CODING);
      await db.run(`DELETE FROM projects WHERE id = ?`, PROJECT);
      await db.run(`DELETE FROM users WHERE id IN (?, ?)`, ALICE, BOB);
    } finally {
      await db?.close();
    }
  });

  const ownerOf = async (id: string): Promise<string | null | undefined> =>
    (await db.get<{ owner_user_id: string | null }>('SELECT owner_user_id FROM knowledge_atoms WHERE id = ?', id))?.owner_user_id;
  const atlasRow = async (id: string): Promise<RiskAtlasRow> =>
    (await db.get<RiskAtlasRow>('SELECT * FROM risk_atlases WHERE id = ?', id))!;

  describe('on write', () => {
    it('mintCodingAtom attributes the atom to the coding project\'s owner, and a colleague no longer lists it', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      const { createCodingIntegration, CODING_ATOM_TYPES, CODING_ATOM_ORIGINS } = await import('../../server/services/coding-integration.js');
      const integration = await createCodingIntegration(db);
      const id = await integration.mintCodingAtom({
        projectId: CODING, type: CODING_ATOM_TYPES.TEST_FAILED, origin: CODING_ATOM_ORIGINS.TEST_FAILURE,
        text: `${TOKEN} running the ledger suite fails`,
      });
      expect(id).toBeTruthy();
      expect(await ownerOf(id!)).toBe(ALICE);

      // End to end: GET /knowledge/atoms under team mode — Bob no longer sees it, Alice does.
      const { createKnowledgeRoutes } = await import('../../server/routes/knowledge.js');
      let caller = { id: BOB, username: BOB, role: 'analyst' as const };
      const app = express();
      app.use(express.json());
      app.use((req, _res, next) => { req.user = caller; next(); });
      app.use('/api', await createKnowledgeRoutes(db));
      const server: Server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
      try {
        const addr = server.address();
        if (!addr || typeof addr === 'string') throw new Error('no address');
        const list = async () => ((await (await fetch(`http://127.0.0.1:${addr.port}/api/knowledge/atoms?q=${TOKEN}`)).json()) as { atoms: Array<{ id: string }> })
          .atoms.map((a) => a.id);
        expect(await list()).not.toContain(id);
        caller = { id: ALICE, username: ALICE, role: 'analyst' };
        expect(await list()).toContain(id);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('solo: mintCodingAtom still mints (owner recorded, never filtered in solo)', async () => {
      delete process.env.DEPLOYMENT_MODE;
      const { createCodingIntegration, CODING_ATOM_TYPES, CODING_ATOM_ORIGINS } = await import('../../server/services/coding-integration.js');
      const id = await (await createCodingIntegration(db)).mintCodingAtom({
        projectId: CODING, type: CODING_ATOM_TYPES.PATTERN_WORKS, origin: CODING_ATOM_ORIGINS.PATTERN_WORKS,
        text: `${TOKEN} after a revision the suite passes`,
      });
      expect(await ownerOf(id!)).toBe(ALICE);
    });

    it('pushAtom attributes the atom to the Atlas owner', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      const { createAtlasKnowledgeBridge } = await import('../../server/services/risk-atlas/atlas-knowledge-bridge.js');
      const id = await createAtlasKnowledgeBridge(db).pushAtom({ atlas: await atlasRow(ATLAS_BOB), type: 'risk', content: `${TOKEN} TP-01 residual 4` });
      expect(id).toBeTruthy();
      expect(await ownerOf(id!)).toBe(BOB);
    });

    it('team mode: an Atlas with no owner writes no atom (it would be shared with everyone)', async () => {
      process.env.DEPLOYMENT_MODE = 'team';
      const { createAtlasKnowledgeBridge } = await import('../../server/services/risk-atlas/atlas-knowledge-bridge.js');
      const id = await createAtlasKnowledgeBridge(db).pushAtom({ atlas: await atlasRow(ATLAS_NONE), type: 'risk', content: `${TOKEN} unowned atlas team` });
      expect(id).toBeNull();
      expect(await db.get(`SELECT 1 AS ok FROM knowledge_atoms WHERE content = ?`, `${TOKEN} unowned atlas team`)).toBeUndefined();
    });

    it('solo negative control: an Atlas with no owner still writes its (unowned) atom, as before', async () => {
      delete process.env.DEPLOYMENT_MODE;
      const { createAtlasKnowledgeBridge } = await import('../../server/services/risk-atlas/atlas-knowledge-bridge.js');
      const id = await createAtlasKnowledgeBridge(db).pushAtom({ atlas: await atlasRow(ATLAS_NONE), type: 'risk', content: `${TOKEN} unowned atlas solo` });
      expect(id).toBeTruthy();
      expect(await ownerOf(id!)).toBeNull();
    });
  });

  describe('migration 286 backfill', () => {
    const insertAtom = async (id: string, fields: { coding?: string; atlas?: string; owner?: string | null }) => {
      await db.run(
        `INSERT INTO knowledge_atoms (id, source_workflow_id, source_execution_id, content, atom_type, category,
                                      coding_project_id, owner_user_id)
         VALUES (?, ?, ?, ?, 'risk.identified', 'risk', ?, ?)`,
        id,
        fields.atlas ? 'risk-atlas' : `coding-${CODING}`,
        fields.atlas ?? 'coding-signal-test',
        `${TOKEN} backfill ${id}`,
        fields.coding ?? null,
        fields.owner ?? null,
      );
    };

    it('attributes coding atoms by project and Atlas atoms by Atlas; keeps set owners and unattributable rows; idempotent', async () => {
      const coding = `ka-mig-coding-${H.tag}`;
      const codingOwned = `ka-mig-coding-owned-${H.tag}`;
      const atlas = `ka-mig-atlas-${H.tag}`;
      const atlasNoOwner = `ka-mig-atlas-none-${H.tag}`;
      const unrelated = `ka-mig-unrelated-${H.tag}`;
      await insertAtom(coding, { coding: CODING });
      await insertAtom(codingOwned, { coding: CODING, owner: BOB });   // owner already set: never overwritten
      await insertAtom(atlas, { atlas: ATLAS_BOB });
      await insertAtom(atlasNoOwner, { atlas: ATLAS_NONE });
      await db.run(
        `INSERT INTO knowledge_atoms (id, source_workflow_id, source_execution_id, content, atom_type, category)
         VALUES (?, 'test', 'test', ?, 'observation.finding', 'observation')`,
        unrelated, `${TOKEN} unrelated`);

      const sql = fs.readFileSync(MIGRATION, 'utf8');
      await db.exec(sql);

      const expected = { [coding]: ALICE, [codingOwned]: BOB, [atlas]: BOB, [atlasNoOwner]: null, [unrelated]: null };
      for (const [id, owner] of Object.entries(expected)) expect(await ownerOf(id), id).toBe(owner);

      await db.exec(sql);   // idempotent: a second run changes nothing
      for (const [id, owner] of Object.entries(expected)) expect(await ownerOf(id), id).toBe(owner);
    });
  });
});
