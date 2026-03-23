/**
 * app-gateway.ts
 * Core gateway orchestrator for the companion app.
 * Handles query processing, org/user management, invitations, analytics.
 */

import type { DatabaseAdapter } from '../db/database.js';
import type { StreamCompletionData } from './unified-llm-client.js';
import {
  deriveContactHashFromPublicKey,
  isValidEd25519PublicKey,
  createAuthNonce,
  verifySignedNonce,
  generateInvitationToken,
  generateSessionToken,
  hashSessionToken,
} from './identity.js';
import { createIntentRouter, type IntentResolution } from './intent-router.js';

// ── Language Support ──────────────────────────────────────────────────────────

export const SUPPORTED_LANGUAGES: Record<string, string> = {
  en: 'English', sv: 'Swedish (Svenska)', fr: 'French (Français)', de: 'German (Deutsch)',
  it: 'Italian (Italiano)', es: 'Spanish (Español)', hi: 'Hindi (हिंदी)', pt: 'Portuguese (Português)',
  pl: 'Polish (Polski)', ur: 'Urdu (اردو)', zh: 'Chinese Simplified (简体中文)', ar: 'Arabic (العربية)',
  bn: 'Bengali (বাংলা)', uk: 'Ukrainian (Українська)', id: 'Indonesian (Bahasa Indonesia)',
  ja: 'Japanese (日本語)', tr: 'Turkish (Türkçe)', vi: 'Vietnamese (Tiếng Việt)',
  ko: 'Korean (한국어)', th: 'Thai (ไทย)', fa: 'Farsi (فارسی)', nl: 'Dutch (Nederlands)',
  ro: 'Romanian (Română)', el: 'Greek (Ελληνικά)', cs: 'Czech (Čeština)',
  hu: 'Hungarian (Magyar)', he: 'Hebrew (עברית)', fi: 'Finnish (Suomi)',
  no: 'Norwegian (Norsk)', da: 'Danish (Dansk)',
};

function isValidLanguage(lang: string): boolean {
  return lang in SUPPORTED_LANGUAGES;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface OrgProfile {
  id: string;
  name: string;
  org_type: string;
  description: string | null;
  welcome_message: string | null;
  branding: Record<string, unknown>;
  default_model: string;
  default_thinking: string;
  max_thinking_level: string;
  allow_reasoning_view: boolean;
  allow_file_upload: boolean;
  allow_voice_input: boolean;
  max_tokens_per_query: number;
  max_queries_per_day: number;
  default_output_language: string;
  supported_languages: string[];
  force_output_language: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QueryRequest {
  orgId: string;
  userId: string;
  message: string;
  sessionId?: string;
  intentCategoryId?: string;
  voiceInput?: boolean;
  outputLanguage?: string;
}

export interface QueryResult {
  sessionId: string;
  messageId: string;
  text: string;
  thinking?: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  resolvedArea: string | null;
  resolvedModule: string | null;
}

// ── Service factory ──────────────────────────────────────────────────────────

export async function createAppGatewayService(db: DatabaseAdapter) {
  const intentRouter = createIntentRouter(db);

  // ── Org Profile CRUD ─────────────────────────────────────────────────────

  async function createOrgProfile(data: Partial<OrgProfile> & { name: string; org_type: string }): Promise<OrgProfile> {
    const id = crypto.randomUUID();
    await db.run(
      `INSERT INTO org_profiles (id, name, org_type, description, welcome_message, branding, default_model, default_thinking, max_thinking_level, allow_reasoning_view, allow_file_upload, allow_voice_input, max_tokens_per_query, max_queries_per_day, default_output_language, supported_languages, force_output_language)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      id, data.name, data.org_type,
      data.description || null,
      data.welcome_message || null,
      JSON.stringify(data.branding || {}),
      data.default_model || 'claude-sonnet-4-5-20250929',
      data.default_thinking || 'think',
      data.max_thinking_level || 'think_hard',
      data.allow_reasoning_view ?? false,
      data.allow_file_upload ?? false,
      data.allow_voice_input ?? false,
      data.max_tokens_per_query || 4096,
      data.max_queries_per_day || 100,
      data.default_output_language || 'en',
      JSON.stringify(data.supported_languages || ['en']),
      data.force_output_language ?? false
    );
    return (await getOrgProfile(id))!;
  }

  async function getOrgProfile(id: string): Promise<OrgProfile | null> {
    const row = await db.get<OrgProfile>(
      'SELECT * FROM org_profiles WHERE id = $1', id
    );
    if (!row) return null;
    if (typeof row.branding === 'string') row.branding = JSON.parse(row.branding);
    if (typeof row.supported_languages === 'string') row.supported_languages = JSON.parse(row.supported_languages);
    return row;
  }

  async function listOrgProfiles(): Promise<OrgProfile[]> {
    const rows = await db.all<OrgProfile>('SELECT * FROM org_profiles ORDER BY created_at DESC');
    return rows.map(r => ({
      ...r,
      branding: typeof r.branding === 'string' ? JSON.parse(r.branding as unknown as string) : r.branding,
    }));
  }

  async function updateOrgProfile(id: string, data: Partial<OrgProfile>): Promise<OrgProfile | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const updatableFields = [
      'name', 'org_type', 'description', 'welcome_message', 'logo_path', 'primary_color',
      'default_model', 'default_thinking', 'max_thinking_level', 'allow_reasoning_view',
      'allow_file_upload', 'allow_voice_input', 'max_tokens_per_query',
      'max_queries_per_day', 'default_output_language', 'force_output_language', 'is_active',
    ] as const;

    for (const field of updatableFields) {
      if (field in data) {
        fields.push(`${field} = $${idx++}`);
        values.push((data as Record<string, unknown>)[field]);
      }
    }

    if ('branding' in data) {
      fields.push(`branding = $${idx++}`);
      values.push(JSON.stringify(data.branding || {}));
    }

    if ('supported_languages' in data) {
      fields.push(`supported_languages = $${idx++}`);
      values.push(JSON.stringify(data.supported_languages || ['en']));
    }

    if (fields.length === 0) return getOrgProfile(id);

    fields.push(`updated_at = NOW()`);
    values.push(id);

    await db.run(
      `UPDATE org_profiles SET ${fields.join(', ')} WHERE id = $${idx}`,
      ...values
    );
    return getOrgProfile(id);
  }

  async function deleteOrgProfile(id: string): Promise<boolean> {
    const result = await db.run('DELETE FROM org_profiles WHERE id = $1', id);
    return result.changes > 0;
  }

  // ── Intent Category CRUD ─────────────────────────────────────────────────

  async function createIntentCategory(orgId: string, data: {
    name: string;
    description?: string;
    allowed_areas?: string[];
    allowed_modules?: string[];
    default_module_id?: string;
    system_prompt_addon?: string;
    persona_id?: string;
    knowledge_scope?: Record<string, unknown>;
    icon?: string;
    max_thinking_level?: string;
    priority?: number;
  }) {
    const id = crypto.randomUUID();
    await db.run(
      `INSERT INTO org_intent_categories (id, org_id, name, description, allowed_areas, allowed_modules, default_module_id, system_prompt_addon, persona_id, knowledge_scope, icon, max_thinking_level, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      id, orgId, data.name, data.description || null,
      JSON.stringify(data.allowed_areas || []),
      JSON.stringify(data.allowed_modules || []),
      data.default_module_id || null,
      data.system_prompt_addon || null,
      data.persona_id || null,
      JSON.stringify(data.knowledge_scope || {}),
      data.icon || 'MessageSquare',
      data.max_thinking_level || null,
      data.priority ?? 0
    );
    return db.get('SELECT * FROM org_intent_categories WHERE id = $1', id);
  }

  async function listIntentCategories(orgId: string) {
    return db.all(
      'SELECT * FROM org_intent_categories WHERE org_id = $1 ORDER BY priority DESC, created_at',
      orgId
    );
  }

  async function updateIntentCategory(id: string, data: Record<string, unknown>) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [key, value] of Object.entries(data)) {
      if (['name', 'description', 'default_module_id', 'system_prompt_addon', 'persona_id', 'icon', 'max_thinking_level', 'priority', 'is_active'].includes(key)) {
        fields.push(`${key} = $${idx++}`);
        values.push(value);
      } else if (['allowed_areas', 'allowed_modules', 'knowledge_scope'].includes(key)) {
        fields.push(`${key} = $${idx++}`);
        values.push(JSON.stringify(value));
      }
    }

    if (fields.length === 0) return;
    fields.push(`updated_at = NOW()`);
    values.push(id);

    await db.run(
      `UPDATE org_intent_categories SET ${fields.join(', ')} WHERE id = $${idx}`,
      ...values
    );
    return db.get('SELECT * FROM org_intent_categories WHERE id = $1', id);
  }

  async function deleteIntentCategory(id: string): Promise<boolean> {
    const result = await db.run('DELETE FROM org_intent_categories WHERE id = $1', id);
    return result.changes > 0;
  }

  // ── Invitation Management ────────────────────────────────────────────────

  async function createInvitation(orgId: string, data: {
    invitation_type?: string;
    max_uses?: number;
    label?: string;
    expires_in_hours?: number;
    created_by?: string;
  }) {
    const id = crypto.randomUUID();
    const token = generateInvitationToken();
    const expiresAt = data.expires_in_hours
      ? new Date(Date.now() + data.expires_in_hours * 3600000).toISOString()
      : null;

    await db.run(
      `INSERT INTO org_invitations (id, org_id, token, invitation_type, max_uses, label, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      id, orgId, token,
      data.invitation_type || 'single',
      data.max_uses || 1,
      data.label || null,
      expiresAt,
      data.created_by || null
    );
    return db.get('SELECT * FROM org_invitations WHERE id = $1', id);
  }

  async function listInvitations(orgId: string) {
    return db.all(
      'SELECT * FROM org_invitations WHERE org_id = $1 ORDER BY created_at DESC',
      orgId
    );
  }

  async function deleteInvitation(id: string): Promise<boolean> {
    const result = await db.run('DELETE FROM org_invitations WHERE id = $1', id);
    return result.changes > 0;
  }

  // ── User Registration & Org Joining ──────────────────────────────────────

  async function registerUser(publicKeyHex: string, displayName?: string, preferredLanguage?: string): Promise<{
    id: string;
    contactHash: string;
  }> {
    // SEC: Validate Ed25519 public key format and cryptographic validity
    if (!isValidEd25519PublicKey(publicKeyHex)) {
      throw new Error('Invalid Ed25519 public key');
    }

    // SEC: Validate display name length
    if (displayName && displayName.length > 200) {
      throw new Error('Display name too long (max 200 characters)');
    }

    // Validate language code
    const lang = (preferredLanguage && isValidLanguage(preferredLanguage)) ? preferredLanguage : 'en';

    const contactHash = deriveContactHashFromPublicKey(publicKeyHex);

    // Check if already registered
    const existing = await db.get<{ id: string; contact_hash: string }>(
      'SELECT id, contact_hash FROM connected_users WHERE contact_hash = $1',
      contactHash
    );
    if (existing) {
      // Update language preference if provided
      if (preferredLanguage && isValidLanguage(preferredLanguage)) {
        await db.run('UPDATE connected_users SET preferred_language = $1 WHERE id = $2', preferredLanguage, existing.id);
      }
      return { id: existing.id, contactHash: existing.contact_hash };
    }

    const id = crypto.randomUUID();
    await db.run(
      `INSERT INTO connected_users (id, contact_hash, public_key, display_name, preferred_language)
       VALUES ($1, $2, $3, $4, $5)`,
      id, contactHash, publicKeyHex, displayName || null, lang
    );
    return { id, contactHash };
  }

  /** Simplified registration — no Ed25519 required. For HTTP/LAN where Web Crypto is unavailable. */
  async function registerSimple(displayName: string, preferredLanguage: string): Promise<{
    id: string;
    contactHash: string;
    sessionToken: string;
  }> {
    if (displayName.length > 200) throw new Error('Display name too long');
    const lang = isValidLanguage(preferredLanguage) ? preferredLanguage : 'en';

    // Generate random identity server-side
    const { randomBytes } = await import('crypto');
    const randomHex = randomBytes(44).toString('hex');
    const contactHash = deriveContactHashFromPublicKey(randomHex);

    // Check if exists
    const existing = await db.get<{ id: string }>(
      'SELECT id FROM connected_users WHERE contact_hash = $1', contactHash
    );
    const userId = existing?.id || crypto.randomUUID();

    if (!existing) {
      await db.run(
        `INSERT INTO connected_users (id, contact_hash, public_key, display_name, preferred_language)
         VALUES ($1, $2, $3, $4, $5)`,
        userId, contactHash, randomHex, displayName, lang
      );
    }

    // Create session token immediately (no challenge-response needed)
    // SEC: 24-hour expiry, same as Ed25519 authenticated sessions
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    await db.run(
      `INSERT INTO app_session_tokens (id, token, connected_user_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      crypto.randomUUID(), tokenHash, userId,
      new Date(Date.now() + 24 * 3600000).toISOString()
    );

    return { id: userId, contactHash, sessionToken: rawToken };
  }

  async function joinOrg(contactHash: string, invitationToken: string): Promise<{
    orgId: string;
    orgName: string;
  }> {
    return db.transaction(async (tx) => {
      // SEC: Atomic invitation validation + usage increment to prevent race condition
      // Use UPDATE ... RETURNING to atomically claim a use
      const claimed = await tx.get<{
        id: string;
        org_id: string;
      }>(
        `UPDATE org_invitations
         SET used_count = used_count + 1
         WHERE token = $1
           AND (invitation_type = 'permanent' OR used_count < max_uses)
           AND (expires_at IS NULL OR expires_at > NOW())
         RETURNING id, org_id`,
        invitationToken
      );

      if (!claimed) throw new Error('Invalid or expired invitation');

      // Find user
      const user = await tx.get<{ id: string }>(
        'SELECT id FROM connected_users WHERE contact_hash = $1',
        contactHash
      );
      if (!user) throw new Error('Invalid or expired invitation'); // Generic error — don't reveal user existence

      // Check if already a member
      const existing = await tx.get(
        'SELECT id FROM connected_user_orgs WHERE connected_user_id = $1 AND org_id = $2',
        user.id, claimed.org_id
      );
      if (existing) {
        // Already a member — rollback the usage increment
        await tx.run('UPDATE org_invitations SET used_count = used_count - 1 WHERE id = $1', claimed.id);
        const org = await tx.get<{ name: string }>('SELECT name FROM org_profiles WHERE id = $1', claimed.org_id);
        return { orgId: claimed.org_id, orgName: org?.name || '' };
      }

      // Join
      await tx.run(
        `INSERT INTO connected_user_orgs (id, connected_user_id, org_id)
         VALUES ($1, $2, $3)`,
        crypto.randomUUID(), user.id, claimed.org_id
      );

      const org = await tx.get<{ name: string }>('SELECT name FROM org_profiles WHERE id = $1', claimed.org_id);
      return { orgId: claimed.org_id, orgName: org?.name || '' };
    });
  }

  // ── Challenge-Response Auth ──────────────────────────────────────────────

  async function createChallenge(contactHash: string): Promise<{ nonce: string }> {
    const user = await db.get<{ id: string }>(
      'SELECT id FROM connected_users WHERE contact_hash = $1 AND status = $2',
      contactHash, 'active'
    );
    if (!user) throw new Error('Authentication failed'); // SEC: Generic — don't reveal user existence

    // SEC: Delete any existing unused nonces for this contact to prevent accumulation
    await db.run(
      'DELETE FROM app_auth_nonces WHERE contact_hash = $1 AND used = FALSE',
      contactHash
    );

    const nonce = createAuthNonce();
    const expiresAt = new Date(Date.now() + 120000).toISOString(); // 2 minutes

    await db.run(
      `INSERT INTO app_auth_nonces (id, nonce, contact_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      crypto.randomUUID(), nonce, contactHash, expiresAt
    );

    return { nonce };
  }

  async function verifyChallenge(contactHash: string, nonce: string, signatureHex: string): Promise<{
    sessionToken: string;
    expiresAt: string;
    user: { id: string; contactHash: string; displayName: string | null };
  }> {
    // SEC: All auth failures return the same generic message to prevent oracle attacks
    const authError = new Error('Authentication failed');

    // Validate nonce — include used=FALSE in query for efficiency
    const nonceRow = await db.get<{ id: string; expires_at: string }>(
      'SELECT id, expires_at FROM app_auth_nonces WHERE nonce = $1 AND contact_hash = $2 AND used = FALSE',
      nonce, contactHash
    );

    if (!nonceRow) throw authError;
    if (new Date(nonceRow.expires_at) < new Date()) throw authError;

    // Get user's public key
    const user = await db.get<{ id: string; contact_hash: string; display_name: string | null; public_key: string }>(
      'SELECT id, contact_hash, display_name, public_key FROM connected_users WHERE contact_hash = $1',
      contactHash
    );
    if (!user || !user.public_key) throw authError;

    // Verify signature
    const valid = verifySignedNonce(nonce, signatureHex, user.public_key);
    if (!valid) throw authError;

    // Mark nonce as used
    await db.run('UPDATE app_auth_nonces SET used = TRUE WHERE id = $1', nonceRow.id);

    // SEC: Create session token — store SHA-256 hash, return raw token to client
    const rawToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString(); // 24 hours (was 7 days — tightened)

    await db.run(
      `INSERT INTO app_session_tokens (id, token, connected_user_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      crypto.randomUUID(), tokenHash, user.id, expiresAt
    );

    return {
      sessionToken: rawToken,
      expiresAt,
      user: { id: user.id, contactHash: user.contact_hash, displayName: user.display_name },
    };
  }

  /** Logout — revoke a session token. */
  async function revokeSession(rawToken: string): Promise<boolean> {
    const tokenHash = hashSessionToken(rawToken);
    const result = await db.run('DELETE FROM app_session_tokens WHERE token = $1', tokenHash);
    return result.changes > 0;
  }

  // ── Query Processing ─────────────────────────────────────────────────────

  async function processQuery(
    request: QueryRequest,
    onEvent: (event: object) => void,
    onComplete?: (result: QueryResult) => void
  ): Promise<void> {
    const { orgId, userId, message, sessionId, intentCategoryId, voiceInput, outputLanguage } = request;

    // H1: SEC: Validate message length before any processing
    if (!message || message.length === 0) throw new Error('Message is required');
    if (message.length > 2000) throw new Error('Message too long (max 2000 characters)');

    // Load org profile
    const org = await getOrgProfile(orgId);
    if (!org || !org.is_active) throw new Error('Organisation not found or inactive');

    // H5: Check user membership AND per-org status (not global status)
    const membership = await db.get<{ status: string }>(
      'SELECT status FROM connected_user_orgs WHERE connected_user_id = $1 AND org_id = $2',
      userId, orgId
    );
    if (!membership) throw new Error('User is not a member of this organisation');
    if (membership.status !== 'active') throw new Error('User is suspended in this organisation');

    // SEC: Enforce feature flags
    if (voiceInput && !org.allow_voice_input) {
      throw new Error('Voice input is not enabled for this organisation');
    }

    // H3: SEC: Enforce per-user daily query limit (200 queries/day)
    const USER_DAILY_LIMIT = 200;
    const userTodayCount = await db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM app_messages am
       JOIN app_sessions s ON am.session_id = s.id
       WHERE s.connected_user_id = $1 AND am.role = 'user' AND am.created_at >= CURRENT_DATE`,
      userId
    );
    if ((userTodayCount?.count || 0) >= USER_DAILY_LIMIT) {
      throw new Error('Daily query limit reached');
    }

    // H2: SEC: Enforce per-org daily query limit (counts actual user messages, not sessions)
    if (org.max_queries_per_day > 0) {
      const orgTodayCount = await db.get<{ count: number }>(
        `SELECT COUNT(*) as count FROM app_messages am
         JOIN app_sessions s ON am.session_id = s.id
         WHERE s.org_id = $1 AND am.role = 'user' AND am.created_at >= CURRENT_DATE`,
        orgId
      );
      if ((orgTodayCount?.count || 0) >= org.max_queries_per_day) {
        throw new Error('Daily query limit reached for this organisation');
      }
    }

    // Resolve intent
    const intent = await intentRouter.resolveIntent(message, orgId, intentCategoryId);

    // Load intent category for system prompt addon + knowledge scope
    let promptAddon = '';
    let intentKnowledgeScope: Record<string, unknown> = {};
    let intentPersonaId: string | null = null;
    let intentMaxThinking: string | null = null;
    let intentRequiredLang: string | null = null;
    if (intent.intentCategoryId) {
      const category = await db.get<{
        system_prompt_addon: string | null;
        knowledge_scope: string | Record<string, unknown> | null;
        persona_id: string | null;
        max_thinking_level: string | null;
        required_output_language: string | null;
      }>(
        'SELECT system_prompt_addon, knowledge_scope, persona_id, max_thinking_level, required_output_language FROM org_intent_categories WHERE id = $1',
        intent.intentCategoryId
      );
      if (category?.system_prompt_addon) promptAddon = category.system_prompt_addon;
      if (category?.knowledge_scope) {
        intentKnowledgeScope = typeof category.knowledge_scope === 'string'
          ? JSON.parse(category.knowledge_scope) : category.knowledge_scope;
      }
      intentPersonaId = category?.persona_id || null;
      intentMaxThinking = category?.max_thinking_level || null;
      intentRequiredLang = category?.required_output_language || null;
    }

    // ── Resolve output language ───────────────────────────────────────────
    // Priority: intent override > explicit request > org forced > user preference > org default > 'en'
    let resolvedLanguage = 'en';
    if (intentRequiredLang && isValidLanguage(intentRequiredLang)) {
      resolvedLanguage = intentRequiredLang;
    } else if (outputLanguage && isValidLanguage(outputLanguage)) {
      resolvedLanguage = outputLanguage;
    } else if (org.force_output_language) {
      resolvedLanguage = org.default_output_language || 'en';
    } else {
      // Load user's preferred language
      const userLang = await db.get<{ preferred_language: string }>(
        'SELECT preferred_language FROM connected_users WHERE id = $1', userId
      );
      if (userLang?.preferred_language && isValidLanguage(userLang.preferred_language)) {
        resolvedLanguage = userLang.preferred_language;
      } else {
        resolvedLanguage = org.default_output_language || 'en';
      }
    }
    // Validate against org's supported languages
    const orgLangs = Array.isArray(org.supported_languages) ? org.supported_languages : ['en'];
    if (orgLangs.length > 0 && !orgLangs.includes(resolvedLanguage)) {
      resolvedLanguage = org.default_output_language || 'en';
    }

    // Get or create session
    let currentSessionId = sessionId;
    let existingMessages: Array<{ role: string; content: string }> = [];

    if (currentSessionId) {
      // H4: SEC: Validate session belongs to this user and org before continuing
      const sessionOwner = await db.get<{ id: string }>(
        'SELECT id FROM app_sessions WHERE id = $1 AND connected_user_id = $2 AND org_id = $3',
        currentSessionId, userId, orgId
      );
      if (!sessionOwner) throw new Error('Session not found');

      // Load existing messages for context
      const msgs = await db.all<{ role: string; content: string }>(
        'SELECT role, content FROM app_messages WHERE session_id = $1 ORDER BY created_at ASC',
        currentSessionId
      );
      existingMessages = msgs;
    } else {
      // Create new session
      currentSessionId = crypto.randomUUID();
      await db.run(
        `INSERT INTO app_sessions (id, connected_user_id, org_id, intent_category_id, resolved_area_id, resolved_module_id, title, output_language)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        currentSessionId, userId, orgId,
        intent.intentCategoryId || null,
        intent.areaId, intent.moduleId,
        message.slice(0, 100),
        resolvedLanguage
      );
    }

    // Save user message
    const userMsgId = crypto.randomUUID();
    await db.run(
      `INSERT INTO app_messages (id, session_id, role, content, voice_input) VALUES ($1, $2, $3, $4, $5)`,
      userMsgId, currentSessionId, 'user', message, voiceInput ?? false
    );

    // ── M1: Build system prompt via ANTON's 7-layer prompt composer ─────────
    // Layer 1 addon: org identity + conversational guidelines + intent addon
    const appContextParts: string[] = [];
    appContextParts.push(`## COMPANION APP CONTEXT\nYou are responding via the ${org.name} companion app (${org.org_type}).`);
    if (org.description) appContextParts.push(org.description);
    if (org.welcome_message) appContextParts.push(`Conversational style: ${org.welcome_message}`);
    appContextParts.push('Be helpful, concise, and conversational. This is a mobile app interface — keep responses focused and scannable.');
    if (promptAddon) appContextParts.push(promptAddon);
    if (!org.allow_reasoning_view) {
      appContextParts.push('Do not show your reasoning process to the user.');
    }

    // ── Language instruction — tells the LLM which language to respond in ──
    if (resolvedLanguage && resolvedLanguage !== 'en') {
      const langName = SUPPORTED_LANGUAGES[resolvedLanguage] || resolvedLanguage;
      appContextParts.push(
        `## OUTPUT LANGUAGE\nRespond entirely in ${langName} (language code: ${resolvedLanguage}). All text, headings, lists, examples, and labels must be in ${langName}. Do not mix languages unless the user explicitly uses another language.`
      );
    }

    const appContextLayer = appContextParts.join('\n');

    // M12: Build knowledge atom layer scoped to resolved area/module
    const { buildAtomLayer, buildOrgContextLayer, buildKnowledgePackLayer } = await import('./prompt-builder.js');
    const atomLayerPrompt = await buildAtomLayer(db, intent.areaId, intent.moduleId, message, currentSessionId);
    const orgContextPrompt = await buildOrgContextLayer(db);
    const knowledgePackPrompt = await buildKnowledgePackLayer(db);

    // Resolve persona: intent-level > suggested > default
    const effectivePersona = intentPersonaId || intent.suggestedPersonaId || undefined;

    // Compose full system prompt using ANTON's prompt composer
    const { composeSystemPrompt } = await import('./prompt-composer.js');
    const systemPrompt = await composeSystemPrompt({
      moduleId: intent.moduleId || undefined,
      areaId: intent.areaId || undefined,
      creativity: 'balanced',
      thinking: org.default_thinking,
      selectedPersonas: effectivePersona ? [effectivePersona] : undefined,
      transparencyLevel: org.allow_reasoning_view ? 1 : 0,
      orgContextPrompt,
      knowledgePackPrompt,
      atomLayerPrompt,
      // Inject the app-specific context as knowledge system additions
      knowledgeSystemAdditions: appContextLayer,
    });

    const conversationMessages = [
      ...existingMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: message },
    ];

    // Determine thinking level (capped by org max, then intent max)
    const thinkingLevels = ['quick', 'think', 'think_hard', 'investigate', 'plan_first'];
    const defaultIdx = thinkingLevels.indexOf(org.default_thinking);
    const orgMaxIdx = thinkingLevels.indexOf(org.max_thinking_level);
    const intentMaxIdx = intentMaxThinking ? thinkingLevels.indexOf(intentMaxThinking) : orgMaxIdx;
    const effectiveMaxIdx = Math.min(orgMaxIdx, intentMaxIdx);
    const thinkingLevel = thinkingLevels[Math.min(defaultIdx, effectiveMaxIdx)] as import('../../src/lib/types.js').ThinkingLevel;

    // Stream the response
    const { streamToHandler } = await import('./unified-llm-client.js');

    await streamToHandler(
      {
        model: org.default_model as import('../../src/lib/types.js').ModelId,
        thinking: thinkingLevel,
        system: systemPrompt,
        messages: conversationMessages,
        maxTokens: org.max_tokens_per_query,
        db,
      },
      onEvent,
      async (completion: StreamCompletionData) => {
        // Save assistant message
        const assistantMsgId = crypto.randomUUID();
        await db.run(
          `INSERT INTO app_messages (id, session_id, role, content, thinking_content, input_tokens, output_tokens, thinking_tokens)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          assistantMsgId, currentSessionId, 'assistant',
          completion.text,
          completion.thinking || null,
          completion.inputTokens,
          completion.outputTokens,
          completion.thinkingTokens || 0
        );

        // Update session totals
        await db.run(
          `UPDATE app_sessions SET
            total_input_tokens = total_input_tokens + $1,
            total_output_tokens = total_output_tokens + $2,
            total_thinking_tokens = total_thinking_tokens + $3,
            message_count = message_count + 2,
            updated_at = NOW()
           WHERE id = $4`,
          completion.inputTokens,
          completion.outputTokens,
          completion.thinkingTokens || 0,
          currentSessionId
        );

        // Update daily analytics (fire-and-forget)
        // M2: Pass userId for unique_users tracking
        updateAnalytics(orgId, userId, completion.inputTokens, completion.outputTokens).catch(() => {});

        // M11: Write to audit log for compliance tracking
        try {
          const { enqueueAudit } = await import('./audit-queue.js');
          enqueueAudit({
            sessionId: currentSessionId!,
            moduleId: intent.moduleId || undefined,
            areaId: intent.areaId || undefined,
            model: org.default_model,
            provider: 'anthropic',
            thinkingLevel: thinkingLevel,
            inputTokenCount: completion.inputTokens,
            outputTokenCount: completion.outputTokens,
            responseStatus: 'success',
            userId,
          });
        } catch { /* non-fatal */ }

        console.log(`[app-gateway] processQuery complete: ${completion.text.length} chars, session=${currentSessionId}`);
        if (onComplete) {
          onComplete({
            sessionId: currentSessionId!,
            messageId: assistantMsgId,
            text: completion.text,
            thinking: org.allow_reasoning_view ? completion.thinking : undefined,
            inputTokens: completion.inputTokens,
            outputTokens: completion.outputTokens,
            thinkingTokens: completion.thinkingTokens || 0,
            resolvedArea: intent.areaId,
            resolvedModule: intent.moduleId,
          });
        }
      }
    );
  }

  // ── Connected User Management ────────────────────────────────────────────

  async function listConnectedUsers(orgId: string) {
    return db.all(
      `SELECT cu.id, cu.contact_hash, cu.display_name, cu.last_seen_at, cu.created_at,
              cuo.role, cuo.status, cuo.joined_at
       FROM connected_users cu
       JOIN connected_user_orgs cuo ON cu.id = cuo.connected_user_id
       WHERE cuo.org_id = $1
       ORDER BY cuo.joined_at DESC`,
      orgId
    );
  }

  async function updateConnectedUser(userId: string, orgId: string, data: { role?: string; status?: string }) {
    // SEC: Validate against allowed values — don't rely solely on DB constraints
    const VALID_ROLES = ['member', 'moderator', 'admin'];
    const VALID_STATUSES = ['active', 'suspended'];

    if (data.role) {
      if (!VALID_ROLES.includes(data.role)) throw new Error('Invalid role');
    }
    if (data.status) {
      if (!VALID_STATUSES.includes(data.status)) throw new Error('Invalid status');
    }

    // H5: Update role AND status on the per-org junction table — not the global user record.
    // This ensures Org A admin can only suspend a user within Org A, not globally.
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.role) { updates.push(`role = $${idx++}`); values.push(data.role); }
    if (data.status) { updates.push(`status = $${idx++}`); values.push(data.status); }

    if (updates.length === 0) return;

    values.push(userId, orgId);
    await db.run(
      `UPDATE connected_user_orgs SET ${updates.join(', ')} WHERE connected_user_id = $${idx++} AND org_id = $${idx}`,
      ...values
    );

    // SEC: If suspending, revoke all active session tokens for this user
    if (data.status === 'suspended') {
      await db.run('DELETE FROM app_session_tokens WHERE connected_user_id = $1', userId);
    }
  }

  async function removeConnectedUser(userId: string, orgId: string): Promise<boolean> {
    const result = await db.run(
      'DELETE FROM connected_user_orgs WHERE connected_user_id = $1 AND org_id = $2',
      userId, orgId
    );
    return result.changes > 0;
  }

  async function getUserProfile(userId: string) {
    return db.get(
      'SELECT id, contact_hash, display_name, preferred_language, metadata, status, last_seen_at, created_at FROM connected_users WHERE id = $1',
      userId
    );
  }

  async function updateUserProfile(userId: string, data: { display_name?: string; metadata?: Record<string, unknown>; preferred_language?: string }) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.display_name !== undefined) {
      if (data.display_name.length > 200) throw new Error('Display name too long');
      fields.push(`display_name = $${idx++}`);
      values.push(data.display_name);
    }
    if (data.metadata !== undefined) {
      // SEC: Limit metadata size to prevent abuse
      const metaStr = JSON.stringify(data.metadata);
      if (metaStr.length > 5000) throw new Error('Metadata too large (max 5KB)');
      fields.push(`metadata = $${idx++}`);
      values.push(metaStr);
    }
    if (data.preferred_language !== undefined) {
      if (!isValidLanguage(data.preferred_language)) throw new Error('Unsupported language');
      fields.push(`preferred_language = $${idx++}`);
      values.push(data.preferred_language);
    }

    if (fields.length === 0) return;
    fields.push('updated_at = NOW()');
    values.push(userId);

    await db.run(
      `UPDATE connected_users SET ${fields.join(', ')} WHERE id = $${idx}`,
      ...values
    );
  }

  async function getUserConnections(userId: string) {
    return db.all(
      `SELECT op.id, op.name, op.org_type, op.description, op.welcome_message, cuo.role, cuo.joined_at
       FROM org_profiles op
       JOIN connected_user_orgs cuo ON op.id = cuo.org_id
       WHERE cuo.connected_user_id = $1 AND op.is_active = TRUE
       ORDER BY cuo.joined_at DESC`,
      userId
    );
  }

  async function leaveOrg(userId: string, orgId: string): Promise<boolean> {
    const result = await db.run(
      'DELETE FROM connected_user_orgs WHERE connected_user_id = $1 AND org_id = $2',
      userId, orgId
    );
    return result.changes > 0;
  }

  // ── Session Management ───────────────────────────────────────────────────

  async function getUserSessions(userId: string, orgId: string) {
    return db.all(
      `SELECT id, title, status, resolved_area_id, resolved_module_id, message_count, total_input_tokens, total_output_tokens, created_at, updated_at
       FROM app_sessions
       WHERE connected_user_id = $1 AND org_id = $2
       ORDER BY updated_at DESC
       LIMIT 50`,
      userId, orgId
    );
  }

  async function getSessionDetail(sessionId: string, userId: string) {
    const session = await db.get<Record<string, unknown>>(
      'SELECT * FROM app_sessions WHERE id = $1 AND connected_user_id = $2',
      sessionId, userId
    );
    if (!session) return null;

    const messages = await db.all<Record<string, unknown>>(
      'SELECT id, role, content, thinking_content, voice_input, created_at FROM app_messages WHERE session_id = $1 ORDER BY created_at ASC',
      sessionId
    );

    // L3: Filter thinking_content based on org's allow_reasoning_view
    const orgId = session.org_id as string;
    const org = orgId ? await getOrgProfile(orgId) : null;
    const showThinking = org?.allow_reasoning_view ?? false;

    const filteredMessages = messages.map(m => ({
      ...m,
      thinking_content: showThinking ? m.thinking_content : null,
    }));

    return { session, messages: filteredMessages };
  }

  async function deleteSession(sessionId: string, userId: string): Promise<boolean> {
    const result = await db.run(
      'DELETE FROM app_sessions WHERE id = $1 AND connected_user_id = $2',
      sessionId, userId
    );
    return result.changes > 0;
  }

  // ── Analytics ────────────────────────────────────────────────────────────

  async function updateAnalytics(orgId: string, userId: string, inputTokens: number, outputTokens: number) {
    const today = new Date().toISOString().split('T')[0];

    // Upsert daily analytics
    const existing = await db.get<{ id: string }>(
      'SELECT id FROM app_analytics WHERE org_id = $1 AND date = $2',
      orgId, today
    );

    // M2: Compute actual unique users for today via subquery
    const uniqueUsersRow = await db.get<{ count: number }>(
      `SELECT COUNT(DISTINCT s.connected_user_id) as count
       FROM app_sessions s
       WHERE s.org_id = $1 AND s.created_at >= CURRENT_DATE`,
      orgId
    );
    const uniqueUsers = (uniqueUsersRow?.count || 0) + (existing ? 0 : 1); // +1 if first entry today (current user)

    if (existing) {
      await db.run(
        `UPDATE app_analytics SET
          total_queries = total_queries + 1,
          unique_users = $1,
          total_input_tokens = total_input_tokens + $2,
          total_output_tokens = total_output_tokens + $3,
          updated_at = NOW()
         WHERE id = $4`,
        uniqueUsers, inputTokens, outputTokens, existing.id
      );
    } else {
      await db.run(
        `INSERT INTO app_analytics (id, org_id, date, total_queries, total_input_tokens, total_output_tokens, unique_users)
         VALUES ($1, $2, $3, 1, $4, $5, $6)`,
        crypto.randomUUID(), orgId, today, inputTokens, outputTokens, uniqueUsers
      );
    }
  }

  async function getAnalytics(orgId: string, days: number = 30) {
    return db.all(
      `SELECT * FROM app_analytics
       WHERE org_id = $1 AND date >= CURRENT_DATE - $2 * INTERVAL '1 day'
       ORDER BY date DESC`,
      orgId, days
    );
  }

  async function getAnalyticsSummary(orgId: string) {
    const summary = await db.get<{
      total_queries: number;
      total_users: number;
      total_input_tokens: number;
      total_output_tokens: number;
    }>(
      `SELECT
        COALESCE(SUM(total_queries), 0) as total_queries,
        COALESCE(SUM(unique_users), 0) as total_users,
        COALESCE(SUM(total_input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(total_output_tokens), 0) as total_output_tokens
       FROM app_analytics WHERE org_id = $1`,
      orgId
    );

    const connectedUsers = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM connected_user_orgs WHERE org_id = $1',
      orgId
    );

    return {
      ...summary,
      connected_users: connectedUsers?.count || 0,
    };
  }

  // ── Announcements ─────────────────────────────────────────────────────────

  async function createAnnouncement(orgId: string, data: {
    title: string;
    content: string;
    priority?: string;
    is_pinned?: boolean;
    created_by?: string;
  }) {
    const id = crypto.randomUUID();
    await db.run(
      `INSERT INTO org_announcements (id, org_id, title, content, priority, is_pinned, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      id, orgId, data.title, data.content,
      data.priority || 'normal',
      data.is_pinned ?? false,
      data.created_by || null
    );
    return db.get('SELECT * FROM org_announcements WHERE id = $1', id);
  }

  async function listAnnouncements(orgId: string, activeOnly: boolean = true) {
    const filter = activeOnly ? 'AND is_active = TRUE' : '';
    return db.all(
      `SELECT * FROM org_announcements WHERE org_id = $1 ${filter} ORDER BY is_pinned DESC, created_at DESC`,
      orgId
    );
  }

  async function updateAnnouncement(id: string, data: Record<string, unknown>) {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const [key, value] of Object.entries(data)) {
      if (['title', 'content', 'priority', 'is_pinned', 'is_active'].includes(key)) {
        fields.push(`${key} = $${idx++}`);
        values.push(value);
      }
    }
    if (fields.length === 0) return;
    fields.push('updated_at = NOW()');
    values.push(id);
    await db.run(
      `UPDATE org_announcements SET ${fields.join(', ')} WHERE id = $${idx}`,
      ...values
    );
    return db.get('SELECT * FROM org_announcements WHERE id = $1', id);
  }

  async function deleteAnnouncement(id: string): Promise<boolean> {
    const result = await db.run('DELETE FROM org_announcements WHERE id = $1', id);
    return result.changes > 0;
  }

  // ── Maintenance — cleanup expired nonces, tokens, invitations ────────────

  async function cleanupExpired() {
    const nonces = await db.run('DELETE FROM app_auth_nonces WHERE expires_at < NOW() OR used = TRUE');
    const tokens = await db.run('DELETE FROM app_session_tokens WHERE expires_at < NOW()');
    const invitations = await db.run(
      "DELETE FROM org_invitations WHERE expires_at IS NOT NULL AND expires_at < NOW()"
    );
    console.log(`[app-gateway] Cleanup: ${nonces.changes} nonces, ${tokens.changes} tokens, ${invitations.changes} invitations`);
  }

  return {
    // Org profiles
    createOrgProfile,
    getOrgProfile,
    listOrgProfiles,
    updateOrgProfile,
    deleteOrgProfile,
    // Intent categories
    createIntentCategory,
    listIntentCategories,
    updateIntentCategory,
    deleteIntentCategory,
    // Invitations
    createInvitation,
    listInvitations,
    deleteInvitation,
    // User management
    registerUser,
    registerSimple,
    joinOrg,
    // Auth
    createChallenge,
    verifyChallenge,
    revokeSession,
    // Query processing
    processQuery,
    // Connected users
    listConnectedUsers,
    updateConnectedUser,
    removeConnectedUser,
    getUserProfile,
    updateUserProfile,
    getUserConnections,
    leaveOrg,
    // Sessions
    getUserSessions,
    getSessionDetail,
    deleteSession,
    // Analytics
    getAnalytics,
    getAnalyticsSummary,
    // Announcements
    createAnnouncement,
    listAnnouncements,
    updateAnnouncement,
    deleteAnnouncement,
    // Maintenance
    cleanupExpired,
  };
}
