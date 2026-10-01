/**
 * account-invitations.ts — accounts made by invitation (2026-10-01).
 *
 * An administrator enters a person's email address. ANTON makes the account
 * (username = the address, no password yet) and a one-time link to /welcome;
 * the person opens it, chooses a password and — on a demo — confirms 18+ and
 * accepts the demo terms, and is signed in. From then on they sign in with
 * their email address and that password.
 *
 * The same link, issued again for an existing account, lets someone who lost
 * their password choose a new one (purpose 'reset'): an administrator hands
 * it over, so this works without a mail server. With SMTP configured the link
 * is also emailed (services/email.ts).
 *
 * The token travels in the URL fragment (/welcome#token=…), which a browser
 * never sends to a server, so it stays out of web-server logs. Only its
 * SHA-256 is stored (account_invitations, migration 292). A link works once
 * and expires; using one closes every other open link of the account and ends
 * its sessions.
 *
 * On a demo (DEMO_MODE=true) an invited account is a demo account: until the
 * link is used it lives as long as the link (demo retention deletes it if
 * nobody does), and from then on DEMO_ACCOUNT_TTL_DAYS, like a sign-up.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { DatabaseAdapter } from '../db/database.js';
import { isDemoMode, demoAccountTtlDays, demoUserMonthlyTokens, DEMO_TERMS_VERSION } from '../middleware/demo-mode.js';
import { hasSsoIdentity } from './oidc-sso.js';

export const INVITE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_LINK_TTL_MS = 3 * 24 * 60 * 60 * 1000;
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 200;

export type InvitationPurpose = 'invite' | 'reset';
export type InvitedRole = 'analyst' | 'viewer';

/** A refusal whose message is written for the person reading it. */
export class InvitationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'InvitationError';
  }
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** The address as an account stores it (trimmed, lower case), or null when it is not one. */
export function normaliseEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  return email.length <= 254 && EMAIL_RE.test(email) ? email : null;
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * The site's own address for a link: APP_PUBLIC_URL / BASE_URL, so a forged
 * Host header cannot point a link at another server; the request only when
 * neither is set (a laptop).
 */
export function publicBaseUrl(req: { protocol: string; get(name: string): string | undefined }): string {
  const configured = (process.env.APP_PUBLIC_URL || process.env.BASE_URL || '').trim().replace(/\/+$/, '');
  return configured || `${req.protocol}://${req.get('host')}`;
}

/** The link the person opens. The token is in the fragment, never sent to the server by the browser. */
export function invitationLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/welcome#token=${token}`;
}

export interface IssuedLink {
  userId: string;
  email: string | null;
  token: string;
  purpose: InvitationPurpose;
  expiresAt: Date;
}

async function insertLink(db: DatabaseAdapter, userId: string, purpose: InvitationPurpose, createdBy: string | null): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + (purpose === 'invite' ? INVITE_LINK_TTL_MS : RESET_LINK_TTL_MS));
  await db.run(
    'INSERT INTO account_invitations (id, user_id, token_hash, purpose, created_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    randomUUID(), userId, hashInvitationToken(token), purpose, createdBy, expiresAt.toISOString(),
  );
  return { token, expiresAt };
}

/**
 * Makes the account for an email address and its first link. The address is
 * the username. Refused when any account already has it as its username or
 * email — issue a new link for that account instead.
 */
export async function createInvitedAccount(
  db: DatabaseAdapter,
  input: { email: unknown; displayName?: unknown; role?: unknown; createdBy: string | null },
): Promise<IssuedLink> {
  const email = normaliseEmail(input.email);
  if (!email) throw new InvitationError(400, 'Enter a valid email address.');
  const role: InvitedRole = input.role === 'viewer' ? 'viewer' : 'analyst';
  if (input.role !== undefined && input.role !== 'analyst' && input.role !== 'viewer') {
    throw new InvitationError(400, 'An invitation makes an analyst or a viewer. Make someone an administrator after they have joined.');
  }
  const displayName = typeof input.displayName === 'string' && input.displayName.trim()
    ? input.displayName.trim().slice(0, 100)
    : email.split('@')[0];

  const taken = await db.get('SELECT id FROM users WHERE LOWER(username) = ? OR LOWER(email) = ?', email, email);
  if (taken) throw new InvitationError(409, 'An account with this email address already exists. Use "New sign-in link" on its row instead.');

  const demo = isDemoMode();
  const userId = randomUUID();
  // Until the link is used the account lives as long as the link, so demo
  // retention removes an invitation nobody took up.
  const linkExpiry = new Date(Date.now() + INVITE_LINK_TTL_MS);
  try {
    await db.run(
      `INSERT INTO users (id, username, password_hash, role, display_name, email, monthly_token_budget, demo_expires_at)
       VALUES (?, ?, '', ?, ?, ?, ?, ?)`,
      userId, email, role, displayName, email, demo ? demoUserMonthlyTokens() : 0, demo ? linkExpiry.toISOString() : null,
    );
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new InvitationError(409, 'An account with this email address already exists. Use "New sign-in link" on its row instead.');
    }
    throw err;
  }
  const { token, expiresAt } = await insertLink(db, userId, 'invite', input.createdBy);
  return { userId, email, token, purpose: 'invite', expiresAt };
}

/**
 * A new link for an existing account: 'invite' while it has no password yet,
 * 'reset' once it has one. Not for an account that signs in through SSO
 * (a password would be a second way in), nor one that is switched off.
 */
export async function issueSignInLink(db: DatabaseAdapter, userId: string, createdBy: string | null): Promise<IssuedLink> {
  const user = await db.get<{ id: string; email: string | null; password_hash: string; disabled_at: unknown; demo_expires_at: unknown }>(
    'SELECT id, email, password_hash, disabled_at, demo_expires_at FROM users WHERE id = ?', userId,
  );
  if (!user) throw new InvitationError(404, 'No such account.');
  if (user.disabled_at) throw new InvitationError(400, 'This account is switched off. Switch it on first.');
  if (await hasSsoIdentity(db, userId)) {
    throw new InvitationError(400, 'This account signs in with single sign-on — it cannot have a password.');
  }
  const purpose: InvitationPurpose = user.password_hash === '' ? 'invite' : 'reset';
  const { token, expiresAt } = await insertLink(db, userId, purpose, createdBy);
  // A demo invitation nobody has used yet lives as long as its newest link.
  if (purpose === 'invite' && user.demo_expires_at) {
    await db.run('UPDATE users SET demo_expires_at = GREATEST(demo_expires_at, ?::timestamptz) WHERE id = ?', expiresAt.toISOString(), userId);
  }
  return { userId, email: user.email, token, purpose, expiresAt };
}

export interface OpenInvitation {
  userId: string;
  email: string;
  displayName: string;
  purpose: InvitationPurpose;
  expiresAt: string;
  /** The demo terms and the 18+ declaration must be given with the password. */
  termsRequired: boolean;
  termsVersion: string | null;
}

interface OpenRow {
  user_id: string;
  purpose: InvitationPurpose;
  expires_at: Date | string;
  username: string;
  email: string | null;
  display_name: string | null;
  terms_version: string | null;
}

/** The unused, unexpired link this token names, on a live account — or null. */
export async function findOpenInvitation(db: DatabaseAdapter, token: unknown): Promise<OpenInvitation | null> {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const row = await db.get<OpenRow>(
    `SELECT ai.user_id, ai.purpose, ai.expires_at, u.username, u.email, u.display_name, u.terms_version
       FROM account_invitations ai JOIN users u ON u.id = ai.user_id
      WHERE ai.token_hash = ? AND ai.used_at IS NULL AND ai.expires_at > NOW()
        AND u.disabled_at IS NULL AND (u.demo_expires_at IS NULL OR u.demo_expires_at > NOW())`,
    hashInvitationToken(token),
  );
  if (!row) return null;
  const termsRequired = isDemoMode() && row.terms_version !== DEMO_TERMS_VERSION;
  return {
    userId: row.user_id,
    email: row.email ?? row.username,
    displayName: row.display_name ?? row.username,
    purpose: row.purpose,
    expiresAt: new Date(row.expires_at).toISOString(),
    termsRequired,
    termsVersion: termsRequired ? DEMO_TERMS_VERSION : null,
  };
}

export interface AcceptInput {
  token: unknown;
  password: unknown;
  over18?: unknown;
  acceptTerms?: unknown;
  termsVersion?: unknown;
}

export interface AcceptedAccount {
  id: string;
  username: string;
  role: 'admin' | 'analyst' | 'viewer';
  display_name: string | null;
  demoExpiresAt: Date | null;
}

const LINK_GONE = 'This link does not work any more: it was used, it expired, or a newer one replaced it. Ask the person who invited you for a new link.';

/**
 * Sets the password a link allows and returns the account to sign in. Every
 * check runs before the link is claimed, so a refused attempt leaves it
 * usable; the claim itself is one conditional UPDATE, so a link works once.
 */
export async function acceptInvitation(db: DatabaseAdapter, input: AcceptInput): Promise<AcceptedAccount> {
  const password = input.password;
  if (typeof password !== 'string' || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    throw new InvitationError(400, `Choose a password of at least ${PASSWORD_MIN} characters.`);
  }
  const open = await findOpenInvitation(db, input.token);
  if (!open) throw new InvitationError(400, LINK_GONE);
  if (await hasSsoIdentity(db, open.userId)) {
    throw new InvitationError(400, 'This account signs in with single sign-on — it cannot have a password.');
  }
  if (open.termsRequired) {
    if (input.over18 !== true) throw new InvitationError(400, 'You must be 18 or over to use this demo. Please confirm it to continue.');
    if (input.acceptTerms !== true) throw new InvitationError(400, 'Please accept the demo terms to continue.');
    if (input.termsVersion !== DEMO_TERMS_VERSION) {
      throw new InvitationError(400, 'The demo terms have changed since this page was loaded. Please reload the page, read the terms and try again.');
    }
  }

  const claimed = await db.get<{ user_id: string; purpose: InvitationPurpose }>(
    `UPDATE account_invitations SET used_at = NOW()
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()
      RETURNING user_id, purpose`,
    hashInvitationToken(input.token as string),
  );
  if (!claimed) throw new InvitationError(400, LINK_GONE);

  const hash = await bcrypt.hash(password, 10);
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, claimed.user_id);
  if (open.termsRequired) {
    await db.run(
      'UPDATE users SET terms_version = ?, terms_accepted_at = NOW(), age_confirmed_at = NOW() WHERE id = ?',
      DEMO_TERMS_VERSION, claimed.user_id,
    );
  }
  // A demo invitation, taken up: the account now lives DEMO_ACCOUNT_TTL_DAYS
  // from today, like a sign-up. A reset keeps the expiry it had.
  if (claimed.purpose === 'invite' && isDemoMode()) {
    await db.run(
      `UPDATE users SET demo_expires_at = NOW() + make_interval(days => ?)
        WHERE id = ? AND demo_expires_at IS NOT NULL AND role <> 'admin'`,
      demoAccountTtlDays(), claimed.user_id,
    );
  }
  await db.run('UPDATE account_invitations SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL', claimed.user_id);
  await db.run('DELETE FROM user_sessions WHERE user_id = ?', claimed.user_id);

  const user = await db.get<{ id: string; username: string; role: AcceptedAccount['role']; display_name: string | null; demo_expires_at: Date | string | null }>(
    'SELECT id, username, role, display_name, demo_expires_at FROM users WHERE id = ?', claimed.user_id,
  );
  if (!user) throw new InvitationError(400, LINK_GONE);
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    display_name: user.display_name,
    demoExpiresAt: user.demo_expires_at ? new Date(user.demo_expires_at) : null,
  };
}
