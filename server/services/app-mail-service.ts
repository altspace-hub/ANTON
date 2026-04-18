/**
 * app-mail-service.ts — Companion-app Unified Mail.
 *
 * Provider-agnostic surface backed by two tables:
 *   • app_mail_providers   — connection metadata (1 row per provider/account)
 *   • app_mail_messages    — cached external mail messages
 *
 * ANTON-native is special: it never creates a provider row and never
 * caches messages — instead it synthesises mail entries on read from
 * the user's existing app_messages + app_checkpoints rows so the chat
 * and approvals tabs remain the single source of truth.
 *
 * External providers (M365, Gmail, IMAP, Exchange) have CRUD wired up
 * but their actual sync implementation is gracefully stubbed for v1:
 * the route tells the user what env vars / OAuth setup is needed when
 * they try to connect.
 */

import crypto from 'crypto';
import type { DatabaseAdapter } from '../db/database.js';

export type MailProviderKind = 'anton' | 'm365' | 'gmail' | 'imap' | 'exchange';
export type MailProviderStatus = 'active' | 'disconnected' | 'error' | 'pending';

export interface MailProvider {
  id: string;
  provider: MailProviderKind;
  display_name: string;
  email_address: string | null;
  status: MailProviderStatus;
  last_sync_at: string | null;
  last_sync_error: string | null;
  unread_count: number;
  is_default: boolean;
  created_at: string;
}

export type AiAction = 'DRAFTED' | 'SUMMARIZED' | 'ARCHIVE?' | 'YOUR ACTION';
export type AiActionTone = 'teal' | 'red' | 'gold' | 'neutral' | 'blue';

export interface MailMessage {
  id: string;
  provider: MailProviderKind;
  provider_id: string | null;
  thread_id: string | null;
  from_name: string;
  from_email: string | null;
  subject: string;
  preview: string;
  is_read: boolean;
  is_external: boolean;
  ai_action: AiAction | null;
  ai_action_tone: AiActionTone | null;
  received_at: string;
  deep_link: string | null;        // optional in-app navigation hint
}

export interface ProviderConnectInput {
  provider: MailProviderKind;
  display_name?: string;
  email_address?: string;
  // Provider-specific blobs — encrypted at rest if INSTANCE_KEY_ENCRYPTION_KEY is set.
  oauth_tokens?: Record<string, unknown>;
  imap_config?: {
    host: string;
    port: number;
    user: string;
    password: string;
    secure?: boolean;
  };
}

// ── AES-256-GCM helpers (mirror app-enrollment-service.ts) ──────────────

function getEncryptionKey(): Buffer | null {
  const k = process.env.INSTANCE_KEY_ENCRYPTION_KEY;
  if (!k) return null;
  const buf = Buffer.from(k, 'hex');
  return buf.length === 32 ? buf : null;
}

function encryptJSON(value: unknown): { ct: Buffer; iv: Buffer } | null {
  const key = getEncryptionKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(value), 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ct: Buffer.concat([enc, tag]), iv };
}

function decryptJSON<T>(ct: Buffer | null, iv: Buffer | null): T | null {
  if (!ct || !iv) return null;
  const key = getEncryptionKey();
  if (!key) return null;
  const tag = ct.subarray(ct.length - 16);
  const ciphertext = ct.subarray(0, ct.length - 16);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(dec.toString('utf8')) as T;
}

let warnedNoKey = false;
function warnNoEncOnce(): void {
  if (warnedNoKey) return;
  warnedNoKey = true;
  console.warn('[app-mail] WARNING: INSTANCE_KEY_ENCRYPTION_KEY is not set — mail provider credentials are stored in PLAINTEXT. Set the env var to a 32-byte hex string for production.');
}

// ── Service factory ────────────────────────────────────────────────────

export function createAppMailService(db: DatabaseAdapter) {

  /** List the user's external provider rows (ANTON-native is implicit). */
  async function listProviders(userId: string, orgId: string): Promise<MailProvider[]> {
    const rows = await db.all<MailProvider>(
      `SELECT id, provider, display_name, email_address, status,
              last_sync_at, last_sync_error, unread_count, is_default, created_at
       FROM app_mail_providers
       WHERE connected_user_id = $1 AND org_id = $2
       ORDER BY is_default DESC, created_at ASC`,
      userId, orgId
    );
    return rows;
  }

  /** Connect a new provider. For non-anton providers without env support
   * yet, we still create the row in 'pending' status so the UI can show
   * it on the source-filter strip — actual sync is a no-op until the
   * provider implementation lands. */
  async function connectProvider(
    userId: string,
    orgId: string,
    input: ProviderConnectInput
  ): Promise<MailProvider> {
    const provider = input.provider;
    if (!['anton', 'm365', 'gmail', 'imap', 'exchange'].includes(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    if (provider === 'anton') {
      throw new Error('ANTON-native is auto-active and does not need a provider row.');
    }

    // Encrypt provider-specific credentials if present
    let oauthCt: Buffer | null = null;
    let oauthIv: Buffer | null = null;
    let imapCt:  Buffer | null = null;
    let imapIv:  Buffer | null = null;

    if (input.oauth_tokens) {
      const e = encryptJSON(input.oauth_tokens);
      if (e) { oauthCt = e.ct; oauthIv = e.iv; }
      else   { warnNoEncOnce(); }
    }
    if (input.imap_config) {
      const e = encryptJSON(input.imap_config);
      if (e) { imapCt = e.ct; imapIv = e.iv; }
      else   { warnNoEncOnce(); }
    }

    // For v1: every external provider lands in 'pending' until a real
    // sync runs successfully. Tells the UI "configured but not yet pulling".
    const status: MailProviderStatus = 'pending';

    const id = crypto.randomUUID();
    const display = input.display_name
      || (provider === 'm365'     ? 'Microsoft 365'
        : provider === 'gmail'    ? 'Google Workspace'
        : provider === 'imap'     ? 'IMAP / SMTP'
        : provider === 'exchange' ? 'Exchange Server'
        : provider);

    await db.run(
      `INSERT INTO app_mail_providers
        (id, connected_user_id, org_id, provider, display_name, email_address,
         oauth_tokens_encrypted, oauth_tokens_iv, imap_config_encrypted, imap_config_iv,
         status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      id, userId, orgId, provider, display, input.email_address ?? null,
      oauthCt, oauthIv, imapCt, imapIv, status
    );

    const row = await db.get<MailProvider>(
      `SELECT id, provider, display_name, email_address, status,
              last_sync_at, last_sync_error, unread_count, is_default, created_at
       FROM app_mail_providers WHERE id = $1`, id
    );
    if (!row) throw new Error('Provider row vanished after insert');
    return row;
  }

  async function disconnectProvider(userId: string, orgId: string, providerId: string): Promise<void> {
    await db.run(
      `DELETE FROM app_mail_providers
       WHERE id = $1 AND connected_user_id = $2 AND org_id = $3`,
      providerId, userId, orgId
    );
  }

  /**
   * Read the unified inbox for this user/org. Currently merges:
   *   • ANTON-native synthetic rows (pending high-sev checkpoints +
   *     recent assistant replies) — always present
   *   • app_mail_messages rows from the user's active external providers
   */
  async function listInbox(
    userId: string,
    orgId: string,
    opts?: { limit?: number; provider?: MailProviderKind | 'all' }
  ): Promise<MailMessage[]> {
    const limit = Math.min(100, Math.max(1, opts?.limit ?? 30));
    const providerFilter = opts?.provider ?? 'all';

    const out: MailMessage[] = [];

    // ── ANTON-native: pending checkpoints surface as urgent mail ──────
    if (providerFilter === 'all' || providerFilter === 'anton') {
      const checkpoints = await db.all<{
        id: string; title: string; summary: string | null;
        severity: string; created_at: string; deep_link: string | null;
      }>(
        `SELECT id, title, summary, severity, created_at, deep_link
         FROM app_checkpoints
         WHERE status = 'pending' AND connected_user_id = $1 AND org_id = $2
         ORDER BY created_at DESC LIMIT 5`,
        userId, orgId
      ).catch(() => []);

      for (const c of checkpoints) {
        const tone: AiActionTone =
          c.severity === 'critical' ? 'red'    :
          c.severity === 'high'     ? 'red'    :
          c.severity === 'normal'   ? 'gold'   :
                                      'neutral';
        out.push({
          id: `anton:cp:${c.id}`,
          provider: 'anton',
          provider_id: null,
          thread_id: null,
          from_name: 'ANTON · Approval needed',
          from_email: null,
          subject: c.title,
          preview: c.summary || 'Tap to review and respond.',
          is_read: false,
          is_external: false,
          ai_action: 'YOUR ACTION',
          ai_action_tone: tone,
          received_at: c.created_at,
          deep_link: c.deep_link || `/approvals/${c.id}`,
        });
      }

      // Recent assistant replies (last 14 days, latest 5)
      const recentReplies = await db.all<{
        session_id: string; session_title: string | null;
        content: string; created_at: string;
      }>(
        `SELECT m.session_id,
                s.title AS session_title,
                m.content,
                m.created_at
         FROM app_messages m
         JOIN app_sessions s ON s.id = m.session_id
         WHERE s.connected_user_id = $1 AND s.org_id = $2
           AND m.role = 'assistant'
           AND m.created_at >= NOW() - INTERVAL '14 days'
         ORDER BY m.created_at DESC
         LIMIT 5`,
        userId, orgId
      ).catch(() => []);

      for (const r of recentReplies) {
        out.push({
          id: `anton:msg:${r.session_id}:${r.created_at}`,
          provider: 'anton',
          provider_id: null,
          thread_id: r.session_id,
          from_name: 'ANTON',
          from_email: null,
          subject: r.session_title || 'Conversation update',
          preview: (r.content || '').slice(0, 280),
          is_read: false,
          is_external: false,
          ai_action: 'SUMMARIZED',
          ai_action_tone: 'teal',
          received_at: r.created_at,
          deep_link: `/chat/${r.session_id}`,
        });
      }
    }

    // ── External provider cache ───────────────────────────────────────
    if (providerFilter !== 'anton') {
      const where: string[] = [`p.connected_user_id = $1`, `p.org_id = $2`];
      const args: unknown[] = [userId, orgId];
      if (providerFilter !== 'all') {
        where.push(`p.provider = $3`);
        args.push(providerFilter);
      }
      const messages = await db.all<{
        id: string; provider_id: string;
        provider: MailProviderKind; thread_id: string | null;
        from_name: string | null; from_email: string | null;
        subject: string | null; preview: string | null;
        is_read: boolean; is_external: boolean;
        ai_action: AiAction | null; ai_action_tone: AiActionTone | null;
        received_at: string;
      }>(
        `SELECT m.id, m.provider_id, p.provider, m.thread_id,
                m.from_name, m.from_email, m.subject, m.preview,
                m.is_read, m.is_external, m.ai_action, m.ai_action_tone,
                m.received_at
         FROM app_mail_messages m
         JOIN app_mail_providers p ON p.id = m.provider_id
         WHERE ${where.join(' AND ')}
         ORDER BY m.received_at DESC
         LIMIT ${limit}`,
        ...args
      ).catch(() => []);

      for (const r of messages) {
        out.push({
          id: r.id,
          provider: r.provider,
          provider_id: r.provider_id,
          thread_id: r.thread_id,
          from_name: r.from_name || 'Unknown',
          from_email: r.from_email,
          subject: r.subject || '(no subject)',
          preview: r.preview || '',
          is_read: r.is_read,
          is_external: r.is_external,
          ai_action: r.ai_action,
          ai_action_tone: r.ai_action_tone,
          received_at: r.received_at,
          deep_link: null,
        });
      }
    }

    // Latest first across the merged set
    out.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
    return out.slice(0, limit);
  }

  /**
   * Trigger a sync for one provider. v1: only supported for connectors
   * we've actually wired (none yet — returns a friendly TODO).
   */
  async function syncProvider(_userId: string, _orgId: string, providerId: string): Promise<{ ok: boolean; message: string }> {
    const row = await db.get<{ provider: MailProviderKind }>(
      `SELECT provider FROM app_mail_providers WHERE id = $1`, providerId
    );
    if (!row) throw new Error('Provider not found');

    const todo: Record<MailProviderKind, string> = {
      anton:    'ANTON-native does not need a sync — it\'s projected on read.',
      m365:     'M365 sync is scaffolded. Set MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET, then a future migration will register the OAuth flow.',
      gmail:    'Gmail sync is scaffolded. GOOGLE_CLIENT_ID is set; Gmail-specific scope grant (https://www.googleapis.com/auth/gmail.readonly) and a sync worker land in a follow-up phase.',
      imap:     'IMAP sync requires the imapflow library. Add it with: pnpm add imapflow. The provider row is stored and ready.',
      exchange: 'Exchange (EWS) sync is not yet implemented for the companion app.',
    };
    await db.run(
      `UPDATE app_mail_providers
       SET status = 'pending', last_sync_at = NOW(), last_sync_error = $1, updated_at = NOW()
       WHERE id = $2`,
      todo[row.provider], providerId
    );
    return { ok: false, message: todo[row.provider] };
  }

  /** Decrypt + return provider config — used by sync workers when those land. */
  async function getProviderConfig(providerId: string): Promise<{
    oauth_tokens: Record<string, unknown> | null;
    imap_config: ProviderConnectInput['imap_config'] | null;
  }> {
    const row = await db.get<{
      oauth_tokens_encrypted: Buffer | null; oauth_tokens_iv: Buffer | null;
      imap_config_encrypted: Buffer | null;  imap_config_iv: Buffer | null;
    }>(
      `SELECT oauth_tokens_encrypted, oauth_tokens_iv,
              imap_config_encrypted, imap_config_iv
       FROM app_mail_providers WHERE id = $1`,
      providerId
    );
    if (!row) throw new Error('Provider not found');
    return {
      oauth_tokens: decryptJSON(row.oauth_tokens_encrypted, row.oauth_tokens_iv),
      imap_config:  decryptJSON(row.imap_config_encrypted, row.imap_config_iv),
    };
  }

  return {
    listProviders,
    connectProvider,
    disconnectProvider,
    listInbox,
    syncProvider,
    getProviderConfig,
  };
}

export type AppMailService = ReturnType<typeof createAppMailService>;
