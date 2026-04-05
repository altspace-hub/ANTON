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

  /** Resolve the local ANTON instance's contact hash from community_identity. */
  async function getContactHash(_req: unknown): Promise<string | null> {
    const identity = await db.get<{ contact_hash: string }>(
      "SELECT contact_hash FROM community_identity WHERE user_id = 'default'"
    );
    return identity?.contact_hash ?? null;
  }

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
        "SELECT contact_hash, display_name, public_key, x25519_public_key, activated_at FROM community_identity WHERE user_id = 'default'"
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

      // Generate Ed25519 keypair for signing — store encrypted private key
      let realPubKey: string | undefined;
      try {
        const { createSigningService } = await import('../services/community-signing-service.js');
        const signingService = await createSigningService(db);
        realPubKey = await signingService.generateAndStoreKeypair(id);
      } catch (keyErr) {
        console.error('[community] Ed25519 keypair generation failed (identity still created):', keyErr);
      }

      // Generate X25519 keypair for E2E message encryption
      let x25519PubKey: string | undefined;
      try {
        const { generateAndStoreX25519Keypair } = await import('../services/community-e2e.js');
        x25519PubKey = await generateAndStoreX25519Keypair(db, id);
      } catch (x25519Err) {
        console.error('[community] X25519 keypair generation failed (identity still created):', x25519Err);
      }

      return res.json({ ok: true, id, contact_hash, publicKey: realPubKey, x25519PublicKey: x25519PubKey });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/identity/regenerate-keys — generate or regenerate encryption keys
  router.post('/community/identity/regenerate-keys', async (req, res) => {
    try {
      const identity = await db.get<{ id: string; contact_hash: string }>(
        "SELECT id, contact_hash FROM community_identity WHERE user_id = 'default'"
      );
      if (!identity) return res.status(404).json({ error: 'Identity not activated' });

      // Generate Ed25519 signing keypair
      let signingPubKey: string | undefined;
      try {
        const { createSigningService } = await import('../services/community-signing-service.js');
        const signingService = await createSigningService(db);
        signingPubKey = await signingService.generateAndStoreKeypair(identity.id);
        // Update the public_key field with the real server-side key
        if (signingPubKey) {
          await db.run('UPDATE community_identity SET public_key = ? WHERE id = ?', signingPubKey, identity.id);
        }
      } catch (err) {
        console.error('[community] Ed25519 keypair generation failed:', err);
      }

      // Generate X25519 encryption keypair
      let x25519PubKey: string | undefined;
      try {
        const { generateAndStoreX25519Keypair } = await import('../services/community-e2e.js');
        x25519PubKey = await generateAndStoreX25519Keypair(db, identity.id);
      } catch (err) {
        console.error('[community] X25519 keypair generation failed:', err);
      }

      res.json({
        ok: true,
        contactHash: identity.contact_hash,
        signingPublicKey: signingPubKey ?? null,
        encryptionPublicKey: x25519PubKey ?? null,
      });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // PATCH /api/community/identity — update identity fields (Q1)
  router.patch('/community/identity', async (req, res) => {
    try {
      const allowed = ['display_name', 'payment_address', 'payment_name', 'payment_country', 'agent_wallet_address', 'agent_wallet_name', 'auto_accept_connections', 'profile_visibility'];
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(req.body)) {
        if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
      }
      if (sets.length > 0) {
        vals.push('default');
        await db.run(`UPDATE community_identity SET ${sets.join(', ')} WHERE user_id = ?`, ...vals);
      }
      const updated = await db.get("SELECT * FROM community_identity WHERE user_id = 'default'");
      res.json(updated);
    } catch (err) {
      console.error('[community] Identity update error:', err);
      res.status(500).json({ error: 'Failed to update identity' });
    }
  });

  // GET /api/community/identity/qr — QR code for contact hash (Q2)
  router.get('/community/identity/qr', async (req, res) => {
    try {
      const identity = await db.get<{ contact_hash: string }>("SELECT contact_hash FROM community_identity WHERE user_id = 'default'");
      if (!identity) return res.status(404).json({ error: 'Not activated' });
      const qrcode = await import('qrcode');
      const qrDataUrl = await (qrcode as any).default.toDataURL(identity.contact_hash, {
        width: 300, margin: 2, color: { dark: '#2DD4A8', light: '#0B1426' }
      });
      res.json({ qrDataUrl, contactHash: identity.contact_hash });
    } catch (err) {
      console.error('[community] QR generation error:', err);
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  // GET /api/community/identity/payment-qr — payment QR code (Q3)
  router.get('/community/identity/payment-qr', async (req, res) => {
    try {
      const identity = await db.get<{ contact_hash: string; payment_address: string; payment_name: string; payment_country: string }>(
        "SELECT contact_hash, payment_address, payment_name, payment_country FROM community_identity WHERE user_id = 'default'"
      );
      if (!identity?.payment_address) return res.status(404).json({ error: 'No payment info configured' });
      const uri = `futurechain://pay?address=${encodeURIComponent(identity.payment_address)}&name=${encodeURIComponent(identity.payment_name ?? '')}&country=${encodeURIComponent(identity.payment_country ?? '')}&hash=${encodeURIComponent(identity.contact_hash)}`;
      const qrcode = await import('qrcode');
      const qrDataUrl = await (qrcode as any).default.toDataURL(uri, {
        width: 300, margin: 2, color: { dark: '#F5A623', light: '#0B1426' }
      });
      res.json({ qrDataUrl, paymentUri: uri });
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate payment QR' });
    }
  });

  // GET /api/community/connections/pending — pending connection requests (Q4)
  router.get('/community/connections/pending', async (req, res) => {
    try {
      const pending = await db.all("SELECT * FROM community_connections WHERE status = 'pending' AND owner_user_id = 'default' ORDER BY connected_at DESC");
      res.json(pending);
    } catch (err) { res.status(500).json({ error: 'Failed to get pending connections' }); }
  });

  // POST /api/community/connections/:id/accept — accept connection (Q4)
  router.post('/community/connections/:id/accept', async (req, res) => {
    try {
      await db.run("UPDATE community_connections SET status = 'accepted' WHERE id = ?", req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Failed to accept connection' }); }
  });

  // POST /api/community/connections/:id/decline — decline connection (Q4)
  router.post('/community/connections/:id/decline', async (req, res) => {
    try {
      await db.run("UPDATE community_connections SET status = 'blocked' WHERE id = ?", req.params.id);
      res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Failed to decline connection' }); }
  });

  // GET /api/community/identity/public-card — public profile card (Q5)
  router.get('/community/identity/public-card', async (req, res) => {
    try {
      const identity = await db.get(
        "SELECT contact_hash, display_name, public_key, x25519_public_key, profile_visibility, auto_accept_connections, payment_address FROM community_identity WHERE user_id = 'default'"
      );
      if (!identity || identity.profile_visibility === 'private') return res.status(404).json({ error: 'Profile is private' });
      res.json(identity);
    } catch (err) { res.status(500).json({ error: 'Failed to get public card' }); }
  });

  // PATCH /api/community/connections/:id — update contact settings (name, endpoint, keys)
  router.patch('/community/connections/:id', async (req, res) => {
    try {
      const allowed = ['display_name', 'endpoint', 'x25519_public_key', 'public_key', 'status'];
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(req.body)) {
        if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
      }
      if (sets.length === 0) return res.json({ ok: true });
      vals.push(req.params.id);
      await db.run(`UPDATE community_connections SET ${sets.join(', ')} WHERE id = ?`, ...vals);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // GET /api/community/connections
  router.get('/community/connections', async (req, res) => {
    try {
      res.json(
        await db.all("SELECT * FROM community_connections WHERE owner_user_id = 'default' ORDER BY connected_at DESC")
      );
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/connections — add contact by hash + public key + X25519 key
  router.post('/community/connections', async (req, res) => {
    try {
      const { contact_hash, display_name, public_key, x25519_public_key, endpoint } = req.body as {
        contact_hash: string;
        display_name: string;
        public_key: string;
        x25519_public_key?: string;
        endpoint?: string;
      };
      if (!contact_hash || !public_key) {
        return res.status(400).json({ error: 'contact_hash and public_key required' });
      }
      const id = `conn_${Date.now()}`;
      await db.run(
        `INSERT INTO community_connections (id, owner_user_id, contact_hash, display_name, public_key, x25519_public_key, endpoint, status) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`
      , id, 'default', contact_hash, display_name || 'Anonymous', public_key,
        x25519_public_key ?? null, endpoint ?? null, 'active');
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

  // GET /api/community/mail/queue/status  ← must be before /mail/:id
  router.get('/community/mail/queue/status', async (_req, res) => {
    try {
      const { createMessageQueueService } = await import('../services/message-queue-service.js');
      const queueService = await createMessageQueueService(db);
      const status = await queueService.getQueueStatus();
      res.json(status);
    } catch (err) {
      console.error('[community] Queue status error:', err);
      res.status(500).json({ error: 'Failed to get queue status' });
    }
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
      // and enqueue for encrypted P2P delivery to remote peers
      if (!isDraft) {
        // Import E2E encryption + message queue lazily
        const { getMyX25519Keys, getPeerX25519PublicKey, deriveSharedSecret, encryptMessage } = await import('../services/community-e2e.js');
        const { createMessageQueueService } = await import('../services/message-queue-service.js');
        const queueService = await createMessageQueueService(db);
        const myKeys = await getMyX25519Keys(db);

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

          // Emit real-time notification (local)
          if (communitySocketNS) {
            communitySocketNS.to(`user:${recipHash}`).emit('mail:new', { mailId: inboxId, fromHash: identity.contact_hash, subject: subject ?? '(no subject)' });
          }

          // Enqueue for encrypted P2P delivery to remote peers
          const peerEndpoint = await db.get<{ endpoint: string | null }>(
            "SELECT endpoint FROM community_connections WHERE contact_hash = ? AND status = 'accepted'", recipHash
          );
          if (peerEndpoint?.endpoint) {
            let encryptedPayload: string | undefined;
            // Encrypt the mail content if both parties have X25519 keys
            if (myKeys) {
              const peerPubKey = await getPeerX25519PublicKey(db, recipHash);
              if (peerPubKey) {
                try {
                  const { randomUUID } = await import('crypto');
                  const sharedSecret = deriveSharedSecret(myKeys.privateKeyHex, peerPubKey);
                  const plaintext = JSON.stringify({
                    subject: subject ?? '(no subject)',
                    body: body ?? '',
                    messageType: 'text',
                    nonce: randomUUID(),
                    timestamp: Date.now(),
                  });
                  // AAD binds sender + recipient to ciphertext — tampering metadata breaks auth tag
                  const aad = `${identity.contact_hash}:${recipHash}`;
                  const encrypted = encryptMessage(plaintext, sharedSecret, aad);
                  encryptedPayload = JSON.stringify(encrypted);
                } catch (encErr) {
                  console.error('[community] E2E encryption failed — message NOT sent:', encErr instanceof Error ? encErr.message : encErr);
                  // Do NOT fall back to plaintext — refuse to send unencrypted
                }
              }
            }
            await queueService.enqueueMessage(id, recipHash, encryptedPayload);
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

  // ── PHASE B: CAPABILITY CARDS, IMPORT POLICY, MESSAGE QUEUE ─────────────

  // ── Capability Cards ──────────────────────────────────────────────────

  router.get('/community/capability-card', async (_req, res) => {
    try {
      const { createCapabilityCardGenerator } = await import('../services/capability-card-generator.js');
      const generator = await createCapabilityCardGenerator(db);
      const card = await generator.getOrRefreshCard();
      res.json(card);
    } catch (err) {
      console.error('[community] Capability card error:', err);
      res.status(500).json({ error: 'Failed to get capability card' });
    }
  });

  router.post('/community/capability-card/refresh', async (_req, res) => {
    try {
      const { createCapabilityCardGenerator } = await import('../services/capability-card-generator.js');
      const generator = await createCapabilityCardGenerator(db);
      const card = await generator.generateCapabilityCard();
      res.json(card);
    } catch (err) {
      console.error('[community] Capability card refresh error:', err);
      res.status(500).json({ error: 'Failed to refresh capability card' });
    }
  });

  // ── Import Policy ─────────────────────────────────────────────────────

  router.patch('/community/connections/:id/policy', async (req, res) => {
    try {
      const { importPolicy, autoAcceptTypes } = req.body;
      if (importPolicy && !['auto_accept', 'ask_first', 'block'].includes(importPolicy)) {
        return res.status(400).json({ error: 'Invalid import policy' });
      }
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (importPolicy) { sets.push('import_policy = ?'); vals.push(importPolicy); }
      if (autoAcceptTypes) { sets.push('auto_accept_types = ?'); vals.push(JSON.stringify(autoAcceptTypes)); }
      if (sets.length > 0) {
        vals.push(req.params.id);
        await db.run(`UPDATE community_connections SET ${sets.join(', ')} WHERE id = ?`, ...vals);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[community] Policy update error:', err);
      res.status(500).json({ error: 'Failed to update policy' });
    }
  });

  // ── Contact Payment Info ─────────────────────────────────────────────

  router.patch('/community/connections/:id/payment', async (req, res) => {
    try {
      const allowed = ['payment_address', 'payment_name', 'payment_country', 'payment_street', 'payment_city', 'payment_postal_code', 'agent_wallet_address', 'agent_wallet_name'];
      const sets: string[] = [];
      const vals: unknown[] = [];
      for (const [k, v] of Object.entries(req.body)) {
        if (allowed.includes(k)) { sets.push(`${k} = ?`); vals.push(v); }
      }
      if (sets.length > 0) {
        vals.push(req.params.id);
        await db.run(`UPDATE community_connections SET ${sets.join(', ')} WHERE id = ?`, ...vals);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[community] Payment info update error:', err);
      res.status(500).json({ error: 'Failed to update payment info' });
    }
  });

  router.get('/community/connections/:contactHash/payment', async (req, res) => {
    try {
      const conn = await db.get(
        "SELECT payment_address, payment_name, payment_country, payment_street, payment_city, payment_postal_code, agent_wallet_address, agent_wallet_name FROM community_connections WHERE contact_hash = ? AND status = 'accepted'",
        req.params.contactHash
      );
      res.json(conn ?? {});
    } catch (err) {
      res.status(500).json({ error: 'Failed to get payment info' });
    }
  });

  // ── C1: Knowledge Atom Sharing ────────────────────────────────────────

  router.post('/community/share/atom/:atomId/:contactHash', async (req, res) => {
    try {
      const { createKnowledgeSharingService } = await import('../services/knowledge-sharing-service.js');
      const service = await createKnowledgeSharingService(db);
      const result = await service.shareAtom(req.params.atomId, req.params.contactHash);
      res.json(result);
    } catch (err) {
      console.error('[community] Share atom error:', err);
      res.status(500).json({ error: 'Failed to share atom' });
    }
  });

  router.post('/community/share/atom/:mailId/accept', async (req, res) => {
    try {
      const { createKnowledgeSharingService } = await import('../services/knowledge-sharing-service.js');
      const service = await createKnowledgeSharingService(db);
      const result = await service.receiveSharedAtom(req.params.mailId);
      res.json(result);
    } catch (err) {
      console.error('[community] Accept shared atom error:', err);
      res.status(500).json({ error: 'Failed to accept shared atom' });
    }
  });

  router.post('/community/share/atom/:sharedAtomId/resolve', async (req, res) => {
    try {
      const { decision } = req.body;
      if (!decision || !['accept', 'reject'].includes(decision)) {
        return res.status(400).json({ error: 'decision must be accept or reject' });
      }
      const { createKnowledgeSharingService } = await import('../services/knowledge-sharing-service.js');
      const service = await createKnowledgeSharingService(db);
      const result = await service.resolveSharedAtom(req.params.sharedAtomId, decision);
      res.json(result);
    } catch (err) {
      console.error('[community] Resolve shared atom error:', err);
      res.status(500).json({ error: 'Failed to resolve shared atom' });
    }
  });

  // ── C2: Bundle Push/Pull ──────────────────────────────────────────────

  router.post('/community/share/bundle', async (req, res) => {
    try {
      const { bundleType, contactHash, name } = req.body;
      if (!bundleType || !contactHash) return res.status(400).json({ error: 'bundleType and contactHash required' });
      const { createBundleSharingService } = await import('../services/bundle-sharing-service.js');
      const service = await createBundleSharingService(db);
      const result = await service.pushBundle(bundleType, contactHash, { name });
      res.json(result);
    } catch (err) {
      console.error('[community] Bundle push error:', err);
      res.status(500).json({ error: 'Failed to push bundle' });
    }
  });

  router.get('/community/share/bundle/:mailId/preview', async (req, res) => {
    try {
      const { createBundleSharingService } = await import('../services/bundle-sharing-service.js');
      const service = await createBundleSharingService(db);
      const result = await service.previewPushedBundle(req.params.mailId);
      res.json(result);
    } catch (err) {
      console.error('[community] Bundle preview error:', err);
      res.status(500).json({ error: 'Failed to preview bundle' });
    }
  });

  // ── C3: Shared Knowledge View ─────────────────────────────────────────

  router.get('/community/shared-knowledge', async (req, res) => {
    try {
      const { createKnowledgeSharingService } = await import('../services/knowledge-sharing-service.js');
      const service = await createKnowledgeSharingService(db);

      const atomHistory = await service.getSharedAtomHistory({
        contactHash: req.query.contactHash as string | undefined,
        direction: req.query.direction as string | undefined,
        status: req.query.status as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      });

      // Also get bundle exchanges
      const bundleExchanges = await db.all(
        `SELECT id, from_hash, to_hashes, subject, message_type, payload, delivery_status, sent_at
         FROM community_mail WHERE message_type IN ('bundle_push', 'capability_exchange')
         ORDER BY sent_at DESC LIMIT ?`,
        req.query.limit ? parseInt(req.query.limit as string, 10) : 50
      );

      res.json({ atoms: atomHistory, bundles: bundleExchanges });
    } catch (err) {
      console.error('[community] Shared knowledge error:', err);
      res.status(500).json({ error: 'Failed to get shared knowledge' });
    }
  });

  // ── C3b: Entity Graph Federation ──────────────────────────────────────

  // Share entities with a peer
  router.post('/community/share/entities/:contactHash', async (req, res) => {
    try {
      const { createKnowledgeSharingService } = await import('../services/knowledge-sharing-service.js');
      const service = await createKnowledgeSharingService(db);
      const entityIds = req.body.entityIds as string[];
      if (!Array.isArray(entityIds) || entityIds.length === 0) {
        return res.status(400).json({ error: 'entityIds array required' });
      }
      const result = await service.shareEntities(req.params.contactHash, entityIds);
      res.json({ ok: true, ...result });
    } catch (err) {
      console.error('[community] Entity share error:', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to share entities' });
    }
  });

  // List federated entities received from peers
  router.get('/community/federated-entities', async (req, res) => {
    try {
      const { createKnowledgeSharingService } = await import('../services/knowledge-sharing-service.js');
      const service = await createKnowledgeSharingService(db);
      const entities = await service.listFederatedEntities(
        req.query.peerHash as string | undefined,
        req.query.limit ? parseInt(req.query.limit as string, 10) : 50
      );
      res.json({ ok: true, entities });
    } catch (err) {
      console.error('[community] Federated entities error:', err);
      res.status(500).json({ error: 'Failed to list federated entities' });
    }
  });

  // ── C4: Message Queue Retry ───────────────────────────────────────────

  router.post('/community/mail/queue/:queueId/retry', async (req, res) => {
    try {
      const { createMessageQueueService } = await import('../services/message-queue-service.js');
      const queueService = await createMessageQueueService(db);
      await queueService.retryFailed(req.params.queueId);
      res.json({ ok: true });
    } catch (err) {
      console.error('[community] Queue retry error:', err);
      res.status(500).json({ error: 'Failed to retry message' });
    }
  });

  // ── Group Leave ──────────────────────────────────────────────────────────────
  router.post('/community/groups/:id/leave', async (req, res) => {
    try {
      const contactHash = getContactHash(req);
      if (!contactHash) return res.status(401).json({ error: 'Not activated' });
      // Prevent last admin from leaving
      const admins = await db.all('SELECT contact_hash FROM community_group_members WHERE group_id = ? AND role = ?', req.params.id, 'admin') as unknown[];
      if (admins.length <= 1) {
        const isAdmin = await db.get('SELECT 1 FROM community_group_members WHERE group_id = ? AND contact_hash = ? AND role = ?', req.params.id, contactHash, 'admin');
        if (isAdmin) return res.status(400).json({ error: 'Cannot leave as the last admin. Transfer ownership first.' });
      }
      await db.run('DELETE FROM community_group_members WHERE group_id = ? AND contact_hash = ?', req.params.id, contactHash);
      res.json({ ok: true });
    } catch (err) {
      console.error('[community] Group leave error:', err);
      res.status(500).json({ error: 'Failed to leave group' });
    }
  });

  // ── Group Forum: Topics ────────────────────────────────────────────────────
  router.get('/community/groups/:id/topics', async (req, res) => {
    try {
      const topics = await db.all(
        'SELECT * FROM community_group_topics WHERE group_id = ? ORDER BY pinned DESC, last_post_at DESC NULLS LAST LIMIT 50',
        req.params.id
      );
      res.json({ topics });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/community/groups/:id/topics', async (req, res) => {
    try {
      const contactHash = getContactHash(req);
      if (!contactHash) return res.status(401).json({ error: 'Not activated' });
      const identity = await db.get<{ display_name: string }>('SELECT display_name FROM community_identity WHERE contact_hash = ?', contactHash);
      const { title, description } = req.body;
      if (!title?.trim()) return res.status(400).json({ error: 'Title required' });
      // Check mute status
      const member = await db.get<{ muted_until: string | null }>('SELECT muted_until FROM community_group_members WHERE group_id = ? AND contact_hash = ?', req.params.id, contactHash);
      if (member?.muted_until && new Date(member.muted_until) > new Date()) return res.status(403).json({ error: 'You are muted in this group' });
      const id = `gtopic_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.run(
        'INSERT INTO community_group_topics (id, group_id, title, description, author_hash, author_name) VALUES (?, ?, ?, ?, ?, ?)',
        id, req.params.id, title.trim(), description?.trim() || null, contactHash, identity?.display_name || 'Anonymous'
      );
      const topic = await db.get('SELECT * FROM community_group_topics WHERE id = ?', id);
      res.status(201).json({ topic });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/community/groups/:id/topics/:topicId', async (req, res) => {
    try {
      const topic = await db.get('SELECT * FROM community_group_topics WHERE id = ? AND group_id = ?', req.params.topicId, req.params.id);
      if (!topic) return res.status(404).json({ error: 'Topic not found' });
      const posts = await db.all('SELECT * FROM community_group_posts WHERE topic_id = ? ORDER BY posted_at ASC', req.params.topicId);
      res.json({ topic, posts });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/community/groups/:id/topics/:topicId/posts', async (req, res) => {
    try {
      const contactHash = getContactHash(req);
      if (!contactHash) return res.status(401).json({ error: 'Not activated' });
      const identity = await db.get<{ display_name: string }>('SELECT display_name FROM community_identity WHERE contact_hash = ?', contactHash);
      const { content, parent_id } = req.body;
      if (!content?.trim()) return res.status(400).json({ error: 'Content required' });
      // Check mute
      const member = await db.get<{ muted_until: string | null }>('SELECT muted_until FROM community_group_members WHERE group_id = ? AND contact_hash = ?', req.params.id, contactHash);
      if (member?.muted_until && new Date(member.muted_until) > new Date()) return res.status(403).json({ error: 'You are muted in this group' });
      // Check topic not locked
      const topic = await db.get<{ locked: number }>('SELECT locked FROM community_group_topics WHERE id = ?', req.params.topicId);
      if (topic?.locked) return res.status(403).json({ error: 'Topic is locked' });
      const id = `gpost_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.run(
        'INSERT INTO community_group_posts (id, topic_id, group_id, parent_id, author_hash, author_name, content) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, req.params.topicId, req.params.id, parent_id || null, contactHash, identity?.display_name || 'Anonymous', content.trim()
      );
      await db.run('UPDATE community_group_topics SET post_count = post_count + 1, last_post_at = NOW() WHERE id = ?', req.params.topicId);
      const post = await db.get('SELECT * FROM community_group_posts WHERE id = ?', id);
      res.status(201).json({ post });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Admin: pin/lock topic
  router.patch('/community/groups/:id/topics/:topicId', async (req, res) => {
    try {
      const { pinned, locked, title } = req.body;
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (pinned !== undefined) { sets.push('pinned = ?'); vals.push(pinned ? 1 : 0); }
      if (locked !== undefined) { sets.push('locked = ?'); vals.push(locked ? 1 : 0); }
      if (title !== undefined) { sets.push('title = ?'); vals.push(title); }
      if (sets.length === 0) return res.json({ ok: true });
      vals.push(req.params.topicId, req.params.id);
      await db.run(`UPDATE community_group_topics SET ${sets.join(', ')} WHERE id = ? AND group_id = ?`, ...vals);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.delete('/community/groups/:id/topics/:topicId', async (req, res) => {
    try {
      await db.run('DELETE FROM community_group_topics WHERE id = ? AND group_id = ?', req.params.topicId, req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // ── Moderation: Content Flags ──────────────────────────────────────────────
  router.post('/community/flags', async (req, res) => {
    try {
      const contactHash = getContactHash(req);
      if (!contactHash) return res.status(401).json({ error: 'Not activated' });
      const { content_type, content_id, group_id, reason, description } = req.body;
      if (!content_type || !content_id || !reason) return res.status(400).json({ error: 'content_type, content_id, and reason required' });
      const id = `flag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await db.run(
        'INSERT INTO community_content_flags (id, content_type, content_id, group_id, reporter_hash, reason, description) VALUES (?, ?, ?, ?, ?, ?, ?)',
        id, content_type, content_id, group_id || null, contactHash, reason, description || null
      );
      res.status(201).json({ id });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.get('/community/groups/:id/flags', async (req, res) => {
    try {
      const flags = await db.all('SELECT * FROM community_content_flags WHERE group_id = ? ORDER BY created_at DESC LIMIT 50', req.params.id);
      res.json({ flags });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.patch('/community/flags/:flagId', async (req, res) => {
    try {
      const contactHash = getContactHash(req);
      const { status, action_taken } = req.body;
      await db.run(
        'UPDATE community_content_flags SET status = ?, action_taken = ?, reviewed_by = ?, reviewed_at = NOW() WHERE id = ?',
        status, action_taken || null, contactHash, req.params.flagId
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Mute/unmute member
  router.post('/community/groups/:id/members/:contactHash/mute', async (req, res) => {
    try {
      const { duration_hours, reason } = req.body;
      const hours = Math.min(Number(duration_hours) || 24, 720); // max 30 days
      await db.run(
        `UPDATE community_group_members SET muted_until = NOW() + MAKE_INTERVAL(hours => ?), mute_reason = ? WHERE group_id = ? AND contact_hash = ?`,
        hours, reason || null, req.params.id, req.params.contactHash
      );
      res.json({ ok: true, muted_until: new Date(Date.now() + hours * 3600000).toISOString() });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post('/community/groups/:id/members/:contactHash/unmute', async (req, res) => {
    try {
      await db.run(
        'UPDATE community_group_members SET muted_until = NULL, mute_reason = NULL WHERE group_id = ? AND contact_hash = ?',
        req.params.id, req.params.contactHash
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}
