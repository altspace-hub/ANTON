import { Router } from 'express';
import type Database from 'better-sqlite3';

export function createCommunityRoutes(db: Database.Database) {
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
  ];

  for (const sql of communityTables) {
    try { db.exec(sql); } catch (e) { console.warn('[community] table migration warning:', e); }
  }

  // GET /api/community/status — activation check
  router.get('/community/status', (req, res) => {
    try {
      const identity = db.prepare(
        "SELECT contact_hash, display_name, activated_at FROM community_identity WHERE user_id = 'default'"
      ).get();
      res.json({ activated: !!identity, identity: identity ?? null });
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/activate — register a new identity
  router.post('/community/activate', (req, res) => {
    try {
      const { display_name, contact_hash, public_key } = req.body as {
        display_name: string;
        contact_hash: string;
        public_key: string;
      };
      if (!display_name || !contact_hash || !public_key) {
        return res.status(400).json({ error: 'display_name, contact_hash, and public_key required' });
      }

      const existing = db.prepare("SELECT id FROM community_identity WHERE user_id = 'default'").get();
      if (existing) return res.status(409).json({ error: 'Identity already activated' });

      const id = `ci_${Date.now()}`;
      db.prepare(
        `INSERT INTO community_identity (id, user_id, contact_hash, display_name, public_key) VALUES (?,?,?,?,?)`
      ).run(id, 'default', contact_hash, display_name, public_key);
      return res.json({ ok: true, id, contact_hash });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // GET /api/community/connections
  router.get('/community/connections', (req, res) => {
    try {
      res.json(
        db.prepare("SELECT * FROM community_connections WHERE owner_user_id = 'default' ORDER BY connected_at DESC").all()
      );
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/connections — add contact by hash + public key
  router.post('/community/connections', (req, res) => {
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
      db.prepare(
        `INSERT OR IGNORE INTO community_connections (id, owner_user_id, contact_hash, display_name, public_key, status) VALUES (?,?,?,?,?,?)`
      ).run(id, 'default', contact_hash, display_name || 'Anonymous', public_key, 'active');
      return res.json({ id, ok: true });
    } catch (e) { return res.status(500).json({ error: String(e) }); }
  });

  // GET /api/community/forum/:forumId/posts — top-level posts only
  router.get('/community/forum/:forumId/posts', (req, res) => {
    try {
      const posts = db.prepare(
        'SELECT * FROM community_forum_posts WHERE forum_id = ? AND parent_id IS NULL ORDER BY posted_at DESC LIMIT 50'
      ).all(req.params.forumId);
      res.json(posts);
    } catch (e) { res.status(500).json({ error: String(e) }); }
  });

  // POST /api/community/forum/:forumId/posts — create post or reply
  router.post('/community/forum/:forumId/posts', (req, res) => {
    try {
      const { author_hash, author_name, title, content, parent_id } = req.body as Record<string, string>;
      if (!content || !author_hash) {
        return res.status(400).json({ error: 'content and author_hash required' });
      }
      const id = `post_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      db.prepare(
        `INSERT INTO community_forum_posts (id, forum_id, author_hash, author_name, title, content, parent_id) VALUES (?,?,?,?,?,?,?)`
      ).run(
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

  return router;
}
