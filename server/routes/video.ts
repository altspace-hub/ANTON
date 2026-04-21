// ── video.ts ────────────────────────────────────────────────────────────────
// Visitor Layer v0.8 — Video routes. Covers upload init/complete, stream
// URL, view logging, playlist CRUD, and uploader-channel listing.
// Comments deferred to v0.8.2 per Q9 answer C.

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import fs from 'fs';
import { requireAuth } from '../middleware/auth.js';
import type { DatabaseAdapter } from '../db/database.js';
import { safeError } from '../lib/error-response.js';
import {
  getVideoStorageAdapter,
  VIDEO_MAX_BYTES,
  verifyLocalSignedUrl,
  resolveLocalPath,
} from '../services/video/storage-adapter.js';

const uploadInitSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  visibility: z.enum(['public', 'friends-circle', 'unlisted', 'private']).default('private'),
  source_size_bytes: z.number().int().positive().max(VIDEO_MAX_BYTES),
  duration_seconds: z.number().int().positive().optional(),
});

const uploadBodySchema = z.object({
  upload_id: z.string().uuid(),
  chunk_base64: z.string(),
});

const playlistSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  visibility: z.enum(['public', 'friends-circle', 'unlisted', 'private']).default('private'),
});

const playlistItemSchema = z.object({
  upload_id: z.string().uuid(),
  position: z.number().int().min(0).optional(),
});

export function createVideoRoutes(db: DatabaseAdapter): Router {
  const router = Router();
  const storage = getVideoStorageAdapter();

  // Init: reserves an upload row, returns upload_id + target storage key.
  router.post('/video/uploads', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = uploadInitSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const key = `u/${req.user!.id}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.bin`;
      const row = await db.get<{ id: string }>(
        `INSERT INTO video_uploads
          (uploader_user_id, title, description, visibility, duration_seconds, source_size_bytes, storage_key, state)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
         RETURNING id`,
        req.user!.id, parsed.data.title, parsed.data.description ?? null,
        parsed.data.visibility, parsed.data.duration_seconds ?? null,
        parsed.data.source_size_bytes, key,
      );
      res.status(201).json({ id: row?.id, storage_key: key, max_bytes: VIDEO_MAX_BYTES });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // Body upload (base64 single-chunk for v1; multipart arrives later).
  router.post('/video/uploads/body', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = uploadBodySchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const upload = await db.get<{ storage_key: string; uploader_user_id: string; source_size_bytes: number }>(
        `SELECT storage_key, uploader_user_id, source_size_bytes FROM video_uploads WHERE id = ?`,
        parsed.data.upload_id,
      );
      if (!upload || upload.uploader_user_id !== req.user!.id) {
        res.status(404).json({ error: 'Upload not found' }); return;
      }
      const buf = Buffer.from(parsed.data.chunk_base64, 'base64');
      if (buf.byteLength > VIDEO_MAX_BYTES) {
        res.status(413).json({ error: 'File exceeds 2 GB limit' }); return;
      }
      await storage.putObject(upload.storage_key, buf, 'application/octet-stream');
      await db.run(
        `UPDATE video_uploads SET state = 'uploaded', updated_at = NOW() WHERE id = ?`,
        parsed.data.upload_id,
      );
      // v1: skip transcoding — serve the source through hls.js native MP4
      // fallback. Transcoding worker wires in a follow-up (see video/
      // transcoder.ts scaffold).
      await db.run(
        `UPDATE video_uploads SET state = 'ready', updated_at = NOW() WHERE id = ?`,
        parsed.data.upload_id,
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // Public / semi-public feed for the Video home.
  router.get('/video/feed', requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.all(
        `SELECT v.id, v.title, v.description, v.duration_seconds, v.uploader_user_id,
                v.created_at, v.poster_storage_key,
                u.name AS uploader_name
         FROM video_uploads v
         LEFT JOIN users u ON u.id = v.uploader_user_id
         WHERE v.state = 'ready'
           AND v.visibility IN ('public', 'unlisted')
         ORDER BY v.created_at DESC
         LIMIT 50`,
      );
      res.json({ videos: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Playback descriptor: the URL goes through signed short-lived URL.
  router.get('/video/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const video = await db.get<Record<string, unknown>>(
        `SELECT v.id, v.title, v.description, v.visibility, v.duration_seconds,
                v.uploader_user_id, v.storage_key, v.created_at, u.name AS uploader_name
         FROM video_uploads v
         LEFT JOIN users u ON u.id = v.uploader_user_id
         WHERE v.id = ? AND v.state = 'ready'`,
        req.params.id,
      );
      if (!video) { res.status(404).json({ error: 'Not found' }); return; }
      const playbackUrl = await storage.getSignedGetUrl(String(video.storage_key));
      delete (video as Record<string, unknown>).storage_key;
      res.json({ video: { ...video, playback_url: playbackUrl } });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Log a view (for the uploader-channel analytics card).
  router.post('/video/:id/view', requireAuth, async (req: Request, res: Response) => {
    try {
      const body = z.object({ completion_pct: z.number().int().min(0).max(100).optional() }).safeParse(req.body ?? {});
      await db.run(
        `INSERT INTO video_views (upload_id, viewer_user_id, completion_pct)
         VALUES (?, ?, ?)`,
        req.params.id, req.user!.id, body.success ? body.data.completion_pct ?? null : null,
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  // Local-disk streaming fallback. MinIO deployments skip this route and use
  // a MinIO-signed URL straight from the frontend.
  router.get('/video/stream', async (req: Request, res: Response) => {
    try {
      const k = String(req.query.k ?? '');
      const e = Number(req.query.e ?? 0);
      const s = String(req.query.s ?? '');
      if (!k || !e || !s || !verifyLocalSignedUrl(k, e, s)) {
        res.status(403).end(); return;
      }
      const full = resolveLocalPath(k);
      const stat = fs.statSync(full);
      const range = req.headers.range;
      if (range) {
        const match = range.match(/bytes=(\d+)-(\d*)/);
        if (match) {
          const start = Number(match[1]);
          const end = match[2] ? Number(match[2]) : stat.size - 1;
          res.writeHead(206, {
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Content-Type': 'video/mp4',
          });
          fs.createReadStream(full, { start, end }).pipe(res);
          return;
        }
      }
      res.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'video/mp4' });
      fs.createReadStream(full).pipe(res);
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // Uploader channel: their own videos + basic view totals.
  router.get('/video/channel/mine', requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.all(
        `SELECT v.id, v.title, v.visibility, v.state, v.duration_seconds, v.created_at,
                (SELECT COUNT(*) FROM video_views vv WHERE vv.upload_id = v.id) AS view_count
         FROM video_uploads v
         WHERE v.uploader_user_id = ?
         ORDER BY v.created_at DESC`,
        req.user!.id,
      );
      res.json({ videos: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  // ── Playlists ─────────────────────────────────────────────────────────
  router.get('/video/playlists', requireAuth, async (req: Request, res: Response) => {
    try {
      const rows = await db.all(
        `SELECT p.id, p.title, p.description, p.visibility, p.bundle_id, p.created_at,
                (SELECT COUNT(*) FROM video_playlist_items i WHERE i.playlist_id = p.id) AS item_count
         FROM video_playlists p
         WHERE p.owner_user_id = ?
         ORDER BY p.created_at DESC`,
        req.user!.id,
      );
      res.json({ playlists: rows });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/video/playlists', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = playlistSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const row = await db.get<{ id: string }>(
        `INSERT INTO video_playlists (owner_user_id, title, description, visibility)
         VALUES (?, ?, ?, ?) RETURNING id`,
        req.user!.id, parsed.data.title, parsed.data.description ?? null, parsed.data.visibility,
      );
      res.status(201).json({ id: row?.id });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  router.get('/video/playlists/:id', requireAuth, async (req: Request, res: Response) => {
    try {
      const playlist = await db.get<Record<string, unknown>>(
        `SELECT * FROM video_playlists WHERE id = ? AND owner_user_id = ?`,
        req.params.id, req.user!.id,
      );
      if (!playlist) { res.status(404).json({ error: 'Not found' }); return; }
      const items = await db.all(
        `SELECT i.position, v.id AS upload_id, v.title, v.duration_seconds
         FROM video_playlist_items i
         JOIN video_uploads v ON v.id = i.upload_id
         WHERE i.playlist_id = ?
         ORDER BY i.position ASC`,
        req.params.id,
      );
      res.json({ playlist, items });
    } catch (err) {
      res.status(500).json({ error: safeError(err) });
    }
  });

  router.post('/video/playlists/:id/items', requireAuth, async (req: Request, res: Response) => {
    try {
      const parsed = playlistItemSchema.safeParse(req.body ?? {});
      if (!parsed.success) { res.status(400).json({ error: 'Validation failed' }); return; }
      const owned = await db.get<{ id: string }>(
        `SELECT id FROM video_playlists WHERE id = ? AND owner_user_id = ?`,
        req.params.id, req.user!.id,
      );
      if (!owned) { res.status(404).json({ error: 'Playlist not found' }); return; }
      const next = parsed.data.position ?? ((await db.get<{ next: number }>(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM video_playlist_items WHERE playlist_id = ?`,
        req.params.id,
      ))?.next ?? 0);
      await db.run(
        `INSERT INTO video_playlist_items (playlist_id, upload_id, position)
         VALUES (?, ?, ?)
         ON CONFLICT (playlist_id, upload_id) DO UPDATE SET position = EXCLUDED.position`,
        req.params.id, parsed.data.upload_id, next,
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: safeError(err) });
    }
  });

  return router;
}
