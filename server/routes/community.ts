import { Router } from 'express';
import type { DatabaseAdapter } from '../db/database.js';


// ── Helpers ──────────────────────────────────────────────────────────────────

function generateGroupHash(): string {
  const arr = new Uint8Array(6);
  // Node crypto polyfill — use randomBytes via Math.random fallback
  for (let i = 0; i < 6; i++) arr[i] = Math.floor(Math.random() * 256);
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `GRPX-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function escapeIcs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function foldIcsLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line + '\r\n';
  let result = '';
  let start = 0;
  let first = true;
  while (start < bytes.length) {
    const chunkLen = first ? 75 : 74;
    first = false;
    const chunk = bytes.slice(start, start + chunkLen);
    result += (start === 0 ? '' : ' ') + chunk.toString('utf8') + '\r\n';
    start += chunkLen;
  }
  return result;
}

function formatIcsDatetime(iso: string, allDay: boolean): string {
  const d = new Date(iso);
  if (allDay) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `VALUE=DATE:${y}${m}${day}`;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export let communitySocketNS: { to: (room: string) => { emit: (event: string, data: unknown) => void } } | null = null;
export function setCommunitySocketNS(ns: typeof communitySocketNS) { communitySocketNS = ns; }

export async function createCommunityRoutes(db: DatabaseAdapter) {
  const router = Router();

  // DB migrations
  const communityTables = [
    `CREATE TABLE IF NOT EXISTS community_identity (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      contact_hash TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      public_key TEXT NOT NULL,
      private_key_encrypted TEXT,
      activated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS community_connections (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT NOT NULL DEFAULT 'default',
      contact_hash TEXT NOT NULL,
      display_name TEXT,
      public_key TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(owner_user_id, contact_hash)
    )`,
    `CREATE TABLE IF NOT EXISTS community_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      creator_user_id TEXT NOT NULL DEFAULT 'default',
      group_key_encrypted TEXT,
      member_count INTEGER DEFAULT 1,
      is_public INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS community_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_contact_hash TEXT NOT NULL,
      content_encrypted TEXT NOT NULL,
      sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      delivered INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS community_forum_posts (
      id TEXT PRIMARY KEY,
      forum_id TEXT NOT NULL DEFAULT 'general',
      author_hash TEXT NOT NULL,
      author_name TEXT,
      title TEXT,
      content TEXT NOT NULL,
      parent_id TEXT,
      upvotes INTEGER DEFAULT 0,
      posted_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    // ── Q1: Group nodes ─────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS community_group_nodes (
      id            TEXT PRIMARY KEY,
      group_hash    TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      description   TEXT,
      avatar_color  TEXT NOT NULL DEFAULT '#2DD4A8',
      join_code     TEXT NOT NULL,
      group_key_b64 TEXT,
      node_url      TEXT NOT NULL DEFAULT 'local',
      role          TEXT NOT NULL DEFAULT 'admin' CHECK(role IN ('admin','member')),
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS community_group_members (
      id            TEXT PRIMARY KEY,
      group_id      TEXT NOT NULL,
      contact_hash  TEXT NOT NULL,
      display_name  TEXT NOT NULL DEFAULT 'Member',
      public_key    TEXT,
      role          TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')),
      joined_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(group_id, contact_hash)
    )`,
    // ── Q2: Internal async mail ──────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS community_mail (
      id         TEXT PRIMARY KEY,
      group_id   TEXT,
      from_hash  TEXT NOT NULL,
      to_hashes  TEXT NOT NULL DEFAULT '[]',
      cc_hashes  TEXT NOT NULL DEFAULT '[]',
      subject    TEXT NOT NULL DEFAULT '(no subject)',
      body       TEXT NOT NULL DEFAULT '',
      thread_id  TEXT,
      parent_id  TEXT,
      folder     TEXT NOT NULL DEFAULT 'inbox' CHECK(folder IN ('inbox','sent','drafts','starred','archive','trash')),
      starred    INTEGER NOT NULL DEFAULT 0,
      draft      INTEGER NOT NULL DEFAULT 0,
      read_by    TEXT NOT NULL DEFAULT '[]',
      sent_at    DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS idx_community_mail_folder ON community_mail(folder, sent_at DESC)`,
    // ── Q3: Calendar events ──────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS community_events (
      id            TEXT PRIMARY KEY,
      group_id      TEXT,
      creator_hash  TEXT NOT NULL,
      title         TEXT NOT NULL,
      description   TEXT,
      event_type    TEXT NOT NULL DEFAULT 'event' CHECK(event_type IN ('event','meeting','deadline','birthday')),
      start_at      DATETIME NOT NULL,
      end_at        DATETIME NOT NULL,
      all_day       INTEGER NOT NULL DEFAULT 0,
      location      TEXT,
      meeting_link  TEXT,
      recurrence    TEXT NOT NULL DEFAULT 'none' CHECK(recurrence IN ('none','daily','weekly','monthly')),
      rsvp_required INTEGER NOT NULL DEFAULT 0,
      created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS community_event_rsvps (
      id            TEXT PRIMARY KEY,
      event_id      TEXT NOT NULL,
      contact_hash  TEXT NOT NULL,
      display_name  TEXT,
      status        TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('accepted','declined','maybe','pending')),
      note          TEXT,
      responded_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(event_id, contact_hash)
    )`,
  ];

  // Migrations run inside an async IIFE since createCommunityRoutes is not async
  (async () => {
    for (const sql of communityTables) {
      try { await db.exec(sql); } catch (e) { console.warn('[community] table migration warning:', e); }
    }
  })();

  // GET /api/community/status — activation check
  router.get('/community/status', async (req, res) => {
    try {
      const identity = await db.get(
        "SELECT contact_hash, display_name, activated_at FROM community_identity WHERE user_id = 'default'"
      );
      res.json({ activated: !!identity, identity: identity ?? null });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/activate — register a new identity
  router.post('/community/activate', async (req, res) => {
    try {
      const { display_name, contact_hash, public_key } = req.body as {
        display_name: string;
        contact_hash: string;
        public_key: string;
      };
      if (!display_name || !contact_hash || !public_key) {
        return res.status(400).json({ error: 'display_name, contact_hash, and public_key required' });
      }
      // Validate contact_hash format: ANTON-XXXX-XXXX-XXXX-XXXX (hex groups)
      if (!/^ANTON-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/i.test(contact_hash)) {
        return res.status(400).json({ error: 'Invalid contact_hash format. Expected ANTON-XXXX-XXXX-XXXX-XXXX' });
      }
      // Validate display name length
      if (display_name.trim().length > 50) {
        return res.status(400).json({ error: 'display_name must be 50 characters or fewer' });
      }

      const existing = await db.get("SELECT id FROM community_identity WHERE user_id = 'default'");
      if (existing) return res.status(409).json({ error: 'Identity already activated' });

      const id = `ci_${Date.now()}`;
      await db.run(
        `INSERT INTO community_identity (id, user_id, contact_hash, display_name, public_key) VALUES (?,?,?,?,?)`
      , id, 'default', contact_hash, display_name, public_key);
      return res.json({ ok: true, id, contact_hash });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // GET /api/community/connections
  router.get('/community/connections', async (req, res) => {
    try {
      res.json(
        await db.all("SELECT * FROM community_connections WHERE owner_user_id = 'default' ORDER BY connected_at DESC")
      );
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/connections — add contact by hash + public key
  router.post('/community/connections', async (req, res) => {
    try {
      const { contact_hash, display_name, public_key } = req.body as {
        contact_hash: string;
        display_name: string;
        public_key: string;
      };
      if (!contact_hash || !public_key) {
        return res.status(400).json({ error: 'contact_hash and public_key required' });
      }
      const id = `conn_${Date.now()}`;
      await db.run(
        `INSERT INTO community_connections (id, owner_user_id, contact_hash, display_name, public_key, status) VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING`
      , id, 'default', contact_hash, display_name || 'Anonymous', public_key, 'active');
      return res.json({ id, ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // GET /api/community/forum/:forumId/posts — top-level posts only
  router.get('/community/forum/:forumId/posts', async (req, res) => {
    try {
      const posts = await db.all(
        'SELECT * FROM community_forum_posts WHERE forum_id = ? AND parent_id IS NULL ORDER BY posted_at DESC LIMIT 50'
      , req.params.forumId);
      res.json(posts);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/forum/:forumId/posts — create post or reply
  router.post('/community/forum/:forumId/posts', async (req, res) => {
    try {
      const { author_hash, author_name, title, content, parent_id } = req.body as Record<string, string>;
      if (!content || !author_hash) {
        return res.status(400).json({ error: 'content and author_hash required' });
      }
      const id = `post_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.run(
        `INSERT INTO community_forum_posts (id, forum_id, author_hash, author_name, title, content, parent_id) VALUES (?,?,?,?,?,?,?)`
      ,
        id, req.params.forumId,
        author_hash,
        author_name || 'Anonymous',
        title       || null,
        content,
        parent_id   || null
      );
      return res.json({ id, ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // ── Q1: GROUP ROUTES (9) ──────────────────────────────────────────────────

  // GET /api/community/groups
  router.get('/community/groups', async (_req, res) => {
    try {
      const groups = await db.all('SELECT * FROM community_group_nodes ORDER BY created_at DESC') as Record<string, unknown>[];
      const withCounts = [];
      for (const g of groups) {
        const countRow = await db.get('SELECT COUNT(*) as c FROM community_group_members WHERE group_id = ?', g.id) as { c: number };
        withCounts.push({ ...g, memberCount: countRow.c });
      }
      res.json(withCounts);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/groups
  router.post('/community/groups', async (req, res) => {
    try {
      const { name, description, avatarColor } = req.body as { name?: string; description?: string; avatarColor?: string };
      if (!name?.trim()) return res.status(400).json({ error: 'name required' });

      const identity = await db.get("SELECT contact_hash, display_name, public_key FROM community_identity WHERE user_id = 'default'") as { contact_hash: string; display_name: string; public_key: string } | undefined;
      if (!identity) return res.status(403).json({ error: 'Community identity not activated' });

      const id = `grpn_${Date.now()}`;
      const group_hash = generateGroupHash();
      const join_code = generateJoinCode();
      const color = avatarColor ?? '#2DD4A8';

      await db.run(
        `INSERT INTO community_group_nodes (id, group_hash, name, description, avatar_color, join_code, role) VALUES (?,?,?,?,?,?,?)`
      , id, group_hash, name.trim(), description ?? null, color, join_code, 'admin');

      // Insert creator as admin member
      const membId = `gmbr_${Date.now()}`;
      await db.run(
        `INSERT INTO community_group_members (id, group_id, contact_hash, display_name, public_key, role) VALUES (?,?,?,?,?,?)`
      , membId, id, identity.contact_hash, identity.display_name, identity.public_key, 'admin');

      return res.json({ id, groupHash: group_hash, joinCode: join_code });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // GET /api/community/groups/:id
  router.get('/community/groups/:id', async (req, res) => {
    try {
      const group = await db.get('SELECT * FROM community_group_nodes WHERE id = ?', req.params.id) as Record<string, unknown> | undefined;
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const members = await db.all('SELECT * FROM community_group_members WHERE group_id = ? ORDER BY joined_at ASC', req.params.id);
      return res.json({ ...group, members });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // PATCH /api/community/groups/:id
  router.patch('/community/groups/:id', async (req, res) => {
    try {
      const { name, description } = req.body as { name?: string; description?: string };
      if (name !== undefined) {
        await db.run('UPDATE community_group_nodes SET name = ? WHERE id = ?', name.trim(), req.params.id);
      }
      if (description !== undefined) {
        await db.run('UPDATE community_group_nodes SET description = ? WHERE id = ?', description, req.params.id);
      }
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // DELETE /api/community/groups/:id
  router.delete('/community/groups/:id', async (req, res) => {
    try {
      await db.run('DELETE FROM community_group_members WHERE group_id = ?', req.params.id);
      await db.run('DELETE FROM community_group_nodes WHERE id = ?', req.params.id);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // GET /api/community/groups/:id/invite-token
  router.get('/community/groups/:id/invite-token', async (req, res) => {
    try {
      const group = await db.get('SELECT * FROM community_group_nodes WHERE id = ?', req.params.id) as { group_hash: string; name: string; join_code: string; node_url: string } | undefined;
      if (!group) return res.status(404).json({ error: 'Group not found' });
      const payload = { groupHash: group.group_hash, groupName: group.name, joinCode: group.join_code, nodeUrl: group.node_url, ts: Date.now() };
      const token = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const url = `${req.protocol}://${req.get('host')}/community/join?token=${token}`;
      return res.json({ token, url });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/groups/join
  router.post('/community/groups/join', async (req, res) => {
    try {
      const { groupHash, joinCode, displayName } = req.body as { groupHash?: string; joinCode?: string; displayName?: string };
      if (!groupHash || !joinCode) return res.status(400).json({ error: 'groupHash and joinCode required' });

      const group = await db.get('SELECT * FROM community_group_nodes WHERE group_hash = ?', groupHash) as { id: string; join_code: string } | undefined;
      if (!group) return res.status(404).json({ error: 'Group not found' });
      if (group.join_code !== joinCode.toUpperCase()) return res.status(403).json({ error: 'Invalid join code' });

      const identity = await db.get("SELECT contact_hash, display_name, public_key FROM community_identity WHERE user_id = 'default'") as { contact_hash: string; display_name: string; public_key: string } | undefined;
      if (!identity) return res.status(403).json({ error: 'Community identity not activated' });

      const existing = await db.get('SELECT id FROM community_group_members WHERE group_id = ? AND contact_hash = ?', group.id, identity.contact_hash);
      if (existing) return res.status(409).json({ error: 'Already a member' });

      const id = `gmbr_${Date.now()}`;
      await db.run(
        `INSERT INTO community_group_members (id, group_id, contact_hash, display_name, public_key, role) VALUES (?,?,?,?,?,?)`
      , id, group.id, identity.contact_hash, displayName?.trim() || identity.display_name, identity.public_key, 'member');

      return res.json({ id, groupId: group.id });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // GET /api/community/groups/:id/members
  router.get('/community/groups/:id/members', async (req, res) => {
    try {
      const members = await db.all('SELECT * FROM community_group_members WHERE group_id = ? ORDER BY joined_at ASC', req.params.id);
      res.json(members);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // DELETE /api/community/groups/:id/members/:contactHash
  router.delete('/community/groups/:id/members/:contactHash', async (req, res) => {
    try {
      await db.run('DELETE FROM community_group_members WHERE group_id = ? AND contact_hash = ?', req.params.id, req.params.contactHash);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // ── Q2: MAIL ROUTES (7) ──────────────────────────────────────────────────

  // GET /api/community/mail/folders/counts  ← must be before /mail/:id
  router.get('/community/mail/folders/counts', async (_req, res) => {
    try {
      const identity = await db.get("SELECT contact_hash FROM community_identity WHERE user_id = 'default'") as { contact_hash: string } | undefined;
      const myHash = identity?.contact_hash ?? '';
      const inboxRow = await db.get(`SELECT COUNT(*) as c FROM community_mail WHERE folder = 'inbox' AND draft = 0 AND json_extract(read_by,'$') NOT LIKE ?`, `%${myHash}%`) as { c: number };
      const inbox = inboxRow.c;
      const draftsRow = await db.get(`SELECT COUNT(*) as c FROM community_mail WHERE folder = 'drafts' AND draft = 1`) as { c: number };
      const drafts = draftsRow.c;
      const starredRow = await db.get(`SELECT COUNT(*) as c FROM community_mail WHERE starred = 1`) as { c: number };
      const starred = starredRow.c;
      return res.json({ inbox, drafts, starred });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // GET /api/community/mail
  router.get('/community/mail', async (req, res) => {
    try {
      const { folder = 'inbox', groupId, limit = '50', offset = '0' } = req.query as Record<string, string>;
      let query = 'SELECT * FROM community_mail WHERE folder = ? AND draft = 0';
      const params: unknown[] = [folder];
      if (groupId) { query += ' AND group_id = ?'; params.push(groupId); }
      query += ' ORDER BY COALESCE(sent_at, created_at) DESC LIMIT ? OFFSET ?';
      params.push(parseInt(limit), parseInt(offset));
      const mails = await db.all(query, ...params);
      res.json(mails);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/mail
  router.post('/community/mail', async (req, res) => {
    try {
      const { toHashes, ccHashes, subject, body, groupId, parentId, draft } = req.body as {
        toHashes: string[]; ccHashes?: string[]; subject?: string; body?: string;
        groupId?: string; parentId?: string; draft?: boolean;
      };
      const identity = await db.get("SELECT contact_hash FROM community_identity WHERE user_id = 'default'") as { contact_hash: string } | undefined;
      if (!identity) return res.status(403).json({ error: 'Community identity not activated' });
      if (!Array.isArray(toHashes) || toHashes.length === 0) return res.status(400).json({ error: 'toHashes required' });

      const id = `mail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      let threadId: string | null = null;

      if (parentId) {
        const parent = await db.get('SELECT id, thread_id FROM community_mail WHERE id = ?', parentId) as { id: string; thread_id: string | null } | undefined;
        if (parent) {
          threadId = parent.thread_id ?? parent.id;
          // Patch parent thread_id if null
          if (!parent.thread_id) {
            await db.run('UPDATE community_mail SET thread_id = ? WHERE id = ?', threadId, parent.id);
          }
        }
      }

      const isDraft = draft ? 1 : 0;
      const folder = isDraft ? 'drafts' : 'sent';
      const sentAt = isDraft ? null : new Date().toISOString();

      await db.run(
        `INSERT INTO community_mail (id, group_id, from_hash, to_hashes, cc_hashes, subject, body, thread_id, parent_id, folder, draft, sent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      , 
        id, groupId ?? null, identity.contact_hash,
        JSON.stringify(toHashes), JSON.stringify(ccHashes ?? []),
        subject ?? '(no subject)', body ?? '',
        threadId, parentId ?? null,
        folder, isDraft, sentAt
      );

      // Also insert inbox copy for each recipient (non-draft only)
      if (!isDraft) {
        for (const recipHash of toHashes) {
          const inboxId = `mail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          await db.run(
            `INSERT INTO community_mail (id, group_id, from_hash, to_hashes, cc_hashes, subject, body, thread_id, parent_id, folder, draft, sent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
          , 
            inboxId, groupId ?? null, identity.contact_hash,
            JSON.stringify(toHashes), JSON.stringify(ccHashes ?? []),
            subject ?? '(no subject)', body ?? '',
            threadId, parentId ?? null,
            'inbox', 0, sentAt
          );
          // Emit real-time notification
          if (communitySocketNS) {
            communitySocketNS.to(`user:${recipHash}`).emit('mail:new', { mailId: inboxId, fromHash: identity.contact_hash, subject: subject ?? '(no subject)' });
          }
        }
      }

      return res.json({ id, ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // GET /api/community/mail/:id
  router.get('/community/mail/:id', async (req, res) => {
    try {
      const mail = await db.get('SELECT * FROM community_mail WHERE id = ?', req.params.id) as Record<string, unknown> | undefined;
      if (!mail) return res.status(404).json({ error: 'Mail not found' });
      const thread = mail.thread_id
        ? await db.all('SELECT * FROM community_mail WHERE thread_id = ? ORDER BY COALESCE(sent_at, created_at) ASC', mail.thread_id as string)
        : [];
      return res.json({ ...mail, thread });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // PATCH /api/community/mail/:id
  router.patch('/community/mail/:id', async (req, res) => {
    try {
      const { folder, starred, markRead, draft } = req.body as { folder?: string; starred?: boolean; markRead?: boolean; draft?: boolean };
      const identity = await db.get("SELECT contact_hash FROM community_identity WHERE user_id = 'default'") as { contact_hash: string } | undefined;
      const myHash = identity?.contact_hash ?? '';

      if (folder !== undefined) await db.run('UPDATE community_mail SET folder = ? WHERE id = ?', folder, req.params.id);
      if (starred !== undefined) await db.run('UPDATE community_mail SET starred = ? WHERE id = ?', starred ? 1 : 0, req.params.id);
      if (draft !== undefined) await db.run('UPDATE community_mail SET draft = ? WHERE id = ?', draft ? 1 : 0, req.params.id);
      if (markRead) {
        const m = await db.get('SELECT read_by FROM community_mail WHERE id = ?', req.params.id) as { read_by: string } | undefined;
        if (m) {
          const arr: string[] = JSON.parse(m.read_by ?? '[]');
          if (!arr.includes(myHash)) {
            arr.push(myHash);
            await db.run('UPDATE community_mail SET read_by = ? WHERE id = ?', JSON.stringify(arr), req.params.id);
          }
        }
      }
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // DELETE /api/community/mail/:id
  router.delete('/community/mail/:id', async (req, res) => {
    try {
      await db.run('DELETE FROM community_mail WHERE id = ?', req.params.id);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/mail/:id/reply
  router.post('/community/mail/:id/reply', async (req, res) => {
    try {
      const { body, toHashes, draft } = req.body as { body?: string; toHashes?: string[]; draft?: boolean };
      const identity = await db.get("SELECT contact_hash FROM community_identity WHERE user_id = 'default'") as { contact_hash: string } | undefined;
      if (!identity) return res.status(403).json({ error: 'Community identity not activated' });

      const parent = await db.get('SELECT * FROM community_mail WHERE id = ?', req.params.id) as Record<string, unknown> | undefined;
      if (!parent) return res.status(404).json({ error: 'Parent mail not found' });

      const threadId = (parent.thread_id ?? parent.id) as string;
      if (!parent.thread_id) await db.run('UPDATE community_mail SET thread_id = ? WHERE id = ?', threadId, parent.id);

      const id = `mail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const isDraft = draft ? 1 : 0;
      const folder = isDraft ? 'drafts' : 'sent';
      const sentAt = isDraft ? null : new Date().toISOString();
      const recipients = toHashes ?? JSON.parse(parent.to_hashes as string ?? '[]');

      await db.run(
        `INSERT INTO community_mail (id, group_id, from_hash, to_hashes, cc_hashes, subject, body, thread_id, parent_id, folder, draft, sent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
      , 
        id, parent.group_id ?? null, identity.contact_hash,
        JSON.stringify(recipients), parent.cc_hashes ?? '[]',
        `Re: ${parent.subject ?? '(no subject)'}`, body ?? '',
        threadId, req.params.id, folder, isDraft, sentAt
      );

      return res.json({ id, ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // ── Q3: EVENT ROUTES (7) ──────────────────────────────────────────────────

  // GET /api/community/events
  router.get('/community/events', async (req, res) => {
    try {
      const { from, to, groupId } = req.query as Record<string, string>;
      let query = 'SELECT * FROM community_events WHERE 1=1';
      const params: unknown[] = [];
      if (from) { query += ' AND start_at >= ?'; params.push(from); }
      if (to)   { query += ' AND start_at <= ?'; params.push(to); }
      if (groupId) { query += ' AND group_id = ?'; params.push(groupId); }
      query += ' ORDER BY start_at ASC';
      res.json(await db.all(query, ...params));
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/events
  router.post('/community/events', async (req, res) => {
    try {
      const { title, eventType, startAt, endAt, allDay, location, meetingLink, recurrence, rsvpRequired, groupId, description } = req.body as {
        title: string; eventType?: string; startAt: string; endAt: string; allDay?: boolean;
        location?: string; meetingLink?: string; recurrence?: string; rsvpRequired?: boolean;
        groupId?: string; description?: string;
      };
      if (!title || !startAt || !endAt) return res.status(400).json({ error: 'title, startAt, endAt required' });
      const identity = await db.get("SELECT contact_hash FROM community_identity WHERE user_id = 'default'") as { contact_hash: string } | undefined;
      if (!identity) return res.status(403).json({ error: 'Community identity not activated' });

      const id = `evt_${Date.now()}`;
      await db.run(
        `INSERT INTO community_events (id, group_id, creator_hash, title, description, event_type, start_at, end_at, all_day, location, meeting_link, recurrence, rsvp_required) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ,
        id, groupId ?? null, identity.contact_hash, title, description ?? null,
        eventType ?? 'event', startAt, endAt, allDay ? 1 : 0,
        location ?? null, meetingLink ?? null, recurrence ?? 'none', rsvpRequired ? 1 : 0
      );
      return res.json({ id, ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // GET /api/community/events/:id
  router.get('/community/events/:id', async (req, res) => {
    try {
      const event = await db.get('SELECT * FROM community_events WHERE id = ?', req.params.id) as Record<string, unknown> | undefined;
      if (!event) return res.status(404).json({ error: 'Event not found' });
      const rsvps = await db.all('SELECT * FROM community_event_rsvps WHERE event_id = ? ORDER BY responded_at ASC', req.params.id);
      return res.json({ ...event, rsvps });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // PATCH /api/community/events/:id
  router.patch('/community/events/:id', async (req, res) => {
    try {
      const fields = req.body as Record<string, unknown>;
      const allowed = ['title', 'description', 'event_type', 'start_at', 'end_at', 'all_day', 'location', 'meeting_link', 'recurrence', 'rsvp_required'];
      const map: Record<string, string> = { eventType: 'event_type', startAt: 'start_at', endAt: 'end_at', allDay: 'all_day', meetingLink: 'meeting_link', rsvpRequired: 'rsvp_required' };
      for (const [k, v] of Object.entries(fields)) {
        const col = map[k] ?? k;
        if (allowed.includes(col)) await db.run(`UPDATE community_events SET ${col} = ? WHERE id = ?`, v, req.params.id);
      }
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // DELETE /api/community/events/:id
  router.delete('/community/events/:id', async (req, res) => {
    try {
      await db.run('DELETE FROM community_event_rsvps WHERE event_id = ?', req.params.id);
      await db.run('DELETE FROM community_events WHERE id = ?', req.params.id);
      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/events/:id/rsvp
  router.post('/community/events/:id/rsvp', async (req, res) => {
    try {
      const { status, note } = req.body as { status: string; note?: string };
      const identity = await db.get("SELECT contact_hash, display_name FROM community_identity WHERE user_id = 'default'") as { contact_hash: string; display_name: string } | undefined;
      if (!identity) return res.status(403).json({ error: 'Community identity not activated' });
      if (!['accepted', 'declined', 'maybe'].includes(status)) return res.status(400).json({ error: 'status must be accepted|declined|maybe' });

      const id = `rsvp_${Date.now()}`;
      await db.run(
        `INSERT INTO community_event_rsvps (id, event_id, contact_hash, display_name, status, note, responded_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)
         ON CONFLICT(event_id, contact_hash) DO UPDATE SET status=excluded.status, note=excluded.note, responded_at=CURRENT_TIMESTAMP`
      , id, req.params.id, identity.contact_hash, identity.display_name, status, note ?? null);

      return res.json({ ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // GET /api/community/events/:id/ics
  router.get('/community/events/:id/ics', async (req, res) => {
    try {
      const event = await db.get('SELECT * FROM community_events WHERE id = ?', req.params.id) as {
        id: string; title: string; description: string | null; start_at: string; end_at: string;
        all_day: number; location: string | null; meeting_link: string | null; recurrence: string;
        creator_hash: string; created_at: string;
      } | undefined;
      if (!event) return res.status(404).json({ error: 'Event not found' });

      const allDay = event.all_day === 1;
      const startStr = allDay ? `DTSTART;${formatIcsDatetime(event.start_at, true)}` : `DTSTART:${formatIcsDatetime(event.start_at, false)}`;
      const endStr   = allDay ? `DTEND;${formatIcsDatetime(event.end_at, true)}`   : `DTEND:${formatIcsDatetime(event.end_at, false)}`;

      const rrule = event.recurrence !== 'none'
        ? `RRULE:FREQ=${event.recurrence.toUpperCase()}\r\n`
        : '';

      const descLines = [event.description ?? '', event.meeting_link ? `Join: ${event.meeting_link}` : ''].filter(Boolean).join('\\n');

      const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//ANTON Community//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${event.id}@anton.local`,
        `DTSTAMP:${formatIcsDatetime(new Date().toISOString(), false)}`,
        startStr,
        endStr,
        `SUMMARY:${escapeIcs(event.title)}`,
        descLines ? `DESCRIPTION:${escapeIcs(descLines)}` : '',
        event.location ? `LOCATION:${escapeIcs(event.location)}` : '',
        rrule.trim(),
        'END:VEVENT',
        'END:VCALENDAR',
      ].filter(Boolean);

      const icsBody = lines.map(foldIcsLine).join('');

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="event-${event.id}.ics"`);
      return res.send(icsBody);
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  return router;
}
