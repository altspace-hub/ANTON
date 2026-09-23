/**
 * oidc-sso.ts — enterprise single sign-on (OpenID Connect; built and tested
 * for Microsoft Entra ID, works with any compliant provider).
 *
 * The routes in routes/auth.ts drive the redirect flow; this module owns the
 * decisions, so they can be tested without an identity provider:
 *
 *   - settings   — what the OIDC_* environment asks for, and what is wrong with
 *                  it (a multi-tenant Entra issuer with no tenant allow-list is
 *                  refused: any Microsoft account on the internet could sign in);
 *   - identity   — who the ID token names. The key is issuer + subject, never
 *                  the email: Entra's `oid` (stable per person in a tenant) or
 *                  the standard `sub`. Email is optional in Entra ID and mutable
 *                  everywhere, so it is a display value and a one-time link to
 *                  an account an administrator created before SSO existed;
 *   - tenant     — which directories may sign in;
 *   - role       — Entra app roles (or groups) mapped onto viewer / analyst /
 *                  admin, applied at every sign-in so the directory stays the
 *                  source of truth;
 *   - provision  — the users row for an identity: found, linked once, or made.
 *
 * Only the OIDC flow uses it; the Google and GitHub buttons keep their own path.
 */
import { randomUUID } from 'node:crypto';
import type { DatabaseAdapter } from '../db/database.js';
import { isUserRole, type UserRole } from '../middleware/role-guards.js';

// ── Settings ─────────────────────────────────────────────────────────────────

export interface OidcSettings {
  issuerUrl: string;
  clientId: string;
  clientSecret?: string;
  /** Registered at the identity provider; sent on both legs of the flow. */
  redirectUri: string;
  /** Lower-case directory (tenant) ids allowed to sign in. Empty = the issuer decides. */
  allowedTenantIds: string[];
  /** Role for a new account when no mapped role applies. */
  defaultRole: UserRole;
  /** Claim that carries the directory's roles — Entra app roles are 'roles'; 'groups' for group ids. */
  roleClaim: string;
  /** Directory role (or group id) → ANTON role. */
  roleMap: Map<string, UserRole>;
  /** With a role map: refuse a person who holds none of the mapped roles. */
  requireMappedRole: boolean;
  /** Where the browser lands after sign-in ('' = the server's own origin). */
  appBaseUrl: string;
  /** The sign-in button's text. */
  buttonLabel: string;
  /** The issuer is Microsoft Entra ID (login.microsoftonline.com). */
  isMicrosoft: boolean;
}

const ENTRA_HOSTS = new Set(['login.microsoftonline.com', 'login.microsoftonline.us', 'login.partner.microsoftonline.cn']);
/** Entra issuer paths that accept accounts from more than one directory. */
const MULTI_TENANT_SEGMENTS = new Set(['common', 'organizations', 'consumers']);

function list(value: string | undefined): string[] {
  return (value ?? '').split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

/** OIDC settings from the environment; null when SSO is not configured. */
export function readOidcSettings(env: NodeJS.ProcessEnv = process.env): OidcSettings | null {
  const issuerUrl = env.OIDC_ISSUER_URL?.trim();
  const clientId = env.OIDC_CLIENT_ID?.trim();
  if (!issuerUrl || !clientId) return null;

  let isMicrosoft = false;
  try { isMicrosoft = ENTRA_HOSTS.has(new URL(issuerUrl).hostname.toLowerCase()); } catch { /* reported by oidcSettingsProblems */ }

  const roleMap = new Map<string, UserRole>();
  for (const pair of list(env.OIDC_ROLE_MAP)) {
    const eq = pair.lastIndexOf('=');
    if (eq <= 0) continue;
    const role = pair.slice(eq + 1).trim().toLowerCase();
    if (isUserRole(role)) roleMap.set(pair.slice(0, eq).trim(), role);
  }
  const defaultRole = (env.OIDC_DEFAULT_ROLE ?? '').trim().toLowerCase();

  return {
    issuerUrl,
    clientId,
    clientSecret: env.OIDC_CLIENT_SECRET?.trim() || undefined,
    redirectUri: env.OIDC_REDIRECT_URI?.trim() || 'http://localhost:3001/api/auth/oidc/callback',
    allowedTenantIds: list(env.OIDC_ALLOWED_TENANT_IDS).map((t) => t.toLowerCase()),
    defaultRole: isUserRole(defaultRole) ? defaultRole : 'analyst',
    roleClaim: env.OIDC_ROLE_CLAIM?.trim() || 'roles',
    roleMap,
    requireMappedRole: env.OIDC_REQUIRE_ROLE === 'true',
    appBaseUrl: (env.APP_PUBLIC_URL ?? '').trim().replace(/\/+$/, ''),
    buttonLabel: env.OIDC_BUTTON_LABEL?.trim() || (isMicrosoft ? 'Sign in with Microsoft' : 'Sign in with single sign-on'),
    isMicrosoft,
  };
}

/**
 * What is wrong with the settings. `errors` stop sign-in (the routes refuse to
 * start a flow); `warnings` are shown to whoever tests the configuration.
 */
export function oidcSettingsProblems(s: OidcSettings, env: NodeJS.ProcessEnv = process.env): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  let issuer: URL | null = null;
  try { issuer = new URL(s.issuerUrl); } catch { errors.push('OIDC_ISSUER_URL is not a URL'); }
  try { new URL(s.redirectUri); } catch { errors.push('OIDC_REDIRECT_URI is not a URL'); }

  if (issuer && s.isMicrosoft) {
    const segment = issuer.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
    if (MULTI_TENANT_SEGMENTS.has(segment) && s.allowedTenantIds.length === 0) {
      errors.push(`OIDC_ISSUER_URL uses the multi-tenant "${segment}" endpoint, which accepts accounts from any Microsoft directory — use https://login.microsoftonline.com/<tenant-id>/v2.0, or set OIDC_ALLOWED_TENANT_IDS`);
    }
    if (!/\/v2\.0\/?$/.test(issuer.pathname)) {
      warnings.push('OIDC_ISSUER_URL should end in /v2.0 — without it Entra serves the v1 endpoints, whose tokens omit the email of member accounts');
    }
  }
  if (!s.clientSecret) {
    warnings.push('OIDC_CLIENT_SECRET is not set — Entra "Web" app registrations require it');
  }
  if (env.NODE_ENV === 'production' && s.redirectUri.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(s.redirectUri)) {
    warnings.push('OIDC_REDIRECT_URI uses http:// — Entra accepts plain http only for localhost; put ANTON behind HTTPS');
  }
  if (s.roleMap.size === 0 && list(env.OIDC_ROLE_MAP).length > 0) {
    warnings.push('OIDC_ROLE_MAP has no usable entries — write it as DirectoryRole=admin,OtherRole=analyst');
  }
  if (s.requireMappedRole && s.roleMap.size === 0) {
    warnings.push('OIDC_REQUIRE_ROLE=true has no effect without OIDC_ROLE_MAP');
  }
  return { errors, warnings };
}

// ── Identity ─────────────────────────────────────────────────────────────────

export interface OidcIdentity {
  issuer: string;
  /** Entra `oid`, else the standard `sub`. */
  subject: string;
  tenantId: string | null;
  email: string | null;
  /** The provider vouches for the address (see identityFromClaims). */
  emailVerified: boolean;
  displayName: string;
  /** Local part for a new username. */
  usernameHint: string;
  /** Values of the role claim (Entra app roles or group ids). */
  roles: string[];
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function emailLike(value: string | null): string | null {
  return value && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) ? value : null;
}

/**
 * Who the ID token names. Throws when it carries no subject, and refuses
 * (groups_overage) a token whose group list Entra left out.
 *
 * The key is issuer + subject. For Entra the issuer is rebuilt from the tenant
 * id (the v2.0 form), so the same person keeps their account when IT moves the
 * issuer from the v1 endpoint to /v2.0 or between tenant-specific and
 * multi-tenant endpoints — `iss` differs across those, oid + tid do not.
 */
export function identityFromClaims(
  claims: Record<string, unknown>,
  settings: Pick<OidcSettings, 'roleClaim'> & Partial<Pick<OidcSettings, 'isMicrosoft' | 'roleMap'>>,
): OidcIdentity {
  const rawIssuer = str(claims.iss);
  // Entra: `oid` is the person's object id in the directory — the same for every
  // app in the tenant, where `sub` is pairwise per application. Microsoft's
  // guidance is to key users on oid + tid.
  const subject = str(claims.oid) ?? str(claims.sub);
  if (!rawIssuer || !subject) throw new Error('ID token carries no issuer or subject');
  const tenantId = str(claims.tid)?.toLowerCase() ?? null;
  const issuer = settings.isMicrosoft && tenantId ? `https://login.microsoftonline.com/${tenantId}/v2.0` : rawIssuer;

  // `email` is optional in Entra (members get it only through the optional
  // claim, and only with a mailbox); preferred_username / upn are usually the
  // sign-in address. Any of them serves as the contact address — none is the key.
  const email = emailLike(str(claims.email)) ?? emailLike(str(claims.preferred_username)) ?? emailLike(str(claims.upn));
  const handle = email ?? str(claims.preferred_username) ?? str(claims.upn);
  const displayName = str(claims.name) ?? handle ?? 'SSO user';
  const usernameHint = (handle ?? displayName).split('@')[0];

  // Whether the address may be trusted to mean this person — for the one-time
  // link to an existing account and for project invitations. The provider says
  // so (email_verified; Entra's xms_edov), or it is an Entra member of the home
  // tenant: a guest (B2B) carries `idp`, and its address is whatever the other
  // directory holds. Microsoft: never authorise on an unverified email.
  const emailVerified = email !== null && (
    claims.email_verified === true
    || claims.xms_edov === true
    || (settings.isMicrosoft === true && claims.idp === undefined)
  );

  // Entra leaves the groups claim out when a person is in more than ~200 groups
  // and sends a pointer (_claim_names / hasgroups) instead. That is not "no
  // groups" — read as such it would demote the person, so it is refused.
  if (settings.roleClaim === 'groups' && (settings.roleMap?.size ?? 0) > 0) {
    const names = claims._claim_names;
    const overage = claims.hasgroups === true
      || (typeof names === 'object' && names !== null && 'groups' in names);
    if (overage) {
      throw new SsoRefusedError('groups_overage', 'Entra sent a group-overage pointer instead of the groups claim');
    }
  }

  const raw = claims[settings.roleClaim];
  const roles = Array.isArray(raw)
    ? raw.filter((r): r is string => typeof r === 'string')
    : (typeof raw === 'string' ? list(raw) : []);

  return { issuer, subject, tenantId, email, emailVerified, displayName, usernameHint, roles };
}

/** Whether the identity's directory may sign in. With no allow-list the issuer
 *  decides: a tenant-specific Entra issuer only accepts its own tenant, and
 *  openid-client checks `iss`. */
export function tenantAllowed(identity: OidcIdentity, settings: Pick<OidcSettings, 'allowedTenantIds'>): boolean {
  if (settings.allowedTenantIds.length === 0) return true;
  return identity.tenantId !== null && settings.allowedTenantIds.includes(identity.tenantId);
}

const ROLE_RANK: Record<UserRole, number> = { viewer: 0, analyst: 1, admin: 2 };

/** The highest ANTON role the directory grants, or null when the map is empty
 *  or none of the person's roles is mapped. */
export function mappedRole(identity: OidcIdentity, settings: Pick<OidcSettings, 'roleMap'>): UserRole | null {
  let best: UserRole | null = null;
  for (const r of identity.roles) {
    const role = settings.roleMap.get(r);
    if (role && (best === null || ROLE_RANK[role] > ROLE_RANK[best])) best = role;
  }
  return best;
}

/**
 * The role a sign-in sets, or null to leave the stored role alone. With a role
 * map the directory decides at every sign-in: its highest mapped role, else the
 * default role — so removing someone's admin role in Entra demotes them in
 * ANTON (it used to leave them admin). Without a map, roles are managed in ANTON.
 */
export function directoryRole(identity: OidcIdentity, settings: Pick<OidcSettings, 'roleMap' | 'defaultRole'>): UserRole | null {
  if (settings.roleMap.size === 0) return null;
  return mappedRole(identity, settings) ?? settings.defaultRole;
}

// ── Provisioning ─────────────────────────────────────────────────────────────

export type SsoRefusal = 'tenant_not_allowed' | 'no_role' | 'account_disabled' | 'ambiguous_email' | 'groups_overage';

export class SsoRefusedError extends Error {
  constructor(readonly reason: SsoRefusal, message: string) {
    super(message);
    this.name = 'SsoRefusedError';
  }
}

export interface SsoUser {
  id: string;
  username: string;
  role: UserRole;
  display_name?: string;
  email: string | null;
}

export interface ProvisionResult {
  user: SsoUser;
  /** How the identity reached its account this time. */
  outcome: 'returning' | 'linked' | 'created';
  /** The role before this sign-in, when the directory changed it. */
  roleChangedFrom?: string;
}

interface UserRow {
  id: string;
  username: string;
  role: string;
  display_name: string | null;
  email: string | null;
  disabled_at: string | Date | null;
}

const PROVIDER = 'oidc';
const USER_COLUMNS = 'u.id, u.username, u.role, u.display_name, u.email, u.disabled_at';

async function findByIdentity(db: DatabaseAdapter, identity: OidcIdentity): Promise<UserRow | undefined> {
  return db.get<UserRow>(
    `SELECT ${USER_COLUMNS} FROM user_identities i JOIN users u ON u.id = i.user_id
      WHERE i.provider = ? AND i.issuer = ? AND i.subject = ?`,
    PROVIDER, identity.issuer, identity.subject,
  );
}

async function uniqueUsername(db: DatabaseAdapter, hint: string): Promise<string> {
  const base = hint.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 40) || 'user';
  let username = base;
  for (let attempt = 1; await db.get('SELECT id FROM users WHERE username = ?', username); attempt++) {
    username = `${base}_${attempt}`;
  }
  return username;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === '23505';
}

/**
 * The account for a signed-in identity, made or found, with the directory's
 * role applied. Refuses (SsoRefusedError) a disabled account, a person with no
 * mapped role when one is required, and an email shared by several accounts.
 * The caller checks the tenant first.
 */
export async function provisionOidcUser(db: DatabaseAdapter, identity: OidcIdentity, settings: OidcSettings): Promise<ProvisionResult> {
  if (settings.requireMappedRole && settings.roleMap.size > 0 && mappedRole(identity, settings) === null) {
    throw new SsoRefusedError('no_role', 'The directory grants this person none of the roles ANTON maps');
  }
  const signInRole = directoryRole(identity, settings);

  let row = await findByIdentity(db, identity);
  let outcome: ProvisionResult['outcome'] = 'returning';

  if (!row && identity.email && identity.emailVerified) {
    // One-time link to an account an administrator made before SSO existed
    // (Settings → Team gives it a password; an account a Google or GitHub
    // sign-in made has none, and is never linked). Only an account no SSO
    // identity has claimed, from any issuer — the address must not carry one
    // person's account to a second identity — and only on a verified address.
    const matches = await db.all<UserRow & { claimed: boolean; has_password: boolean }>(
      `SELECT ${USER_COLUMNS},
              EXISTS (SELECT 1 FROM user_identities i WHERE i.user_id = u.id) AS claimed,
              (u.password_hash IS NOT NULL AND u.password_hash <> '') AS has_password
         FROM users u WHERE LOWER(u.email) = LOWER(?)`,
      identity.email,
    );
    const open = matches.filter((m) => !m.claimed && m.has_password);
    if (open.length > 1) {
      throw new SsoRefusedError('ambiguous_email', 'Several accounts share this email; an administrator must resolve it');
    }
    if (open.length === 1) {
      try {
        await db.run(
          `INSERT INTO user_identities (id, user_id, provider, issuer, subject, tenant_id, email_at_login, last_login_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          randomUUID(), open[0].id, PROVIDER, identity.issuer, identity.subject, identity.tenantId, identity.email,
        );
        // From now on the directory is the way in: the local password goes, and
        // so does any session opened with it.
        await db.run("UPDATE users SET password_hash = '' WHERE id = ?", open[0].id);
        await db.run('DELETE FROM user_sessions WHERE user_id = ?', open[0].id);
        row = open[0];
        outcome = 'linked';
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        row = await findByIdentity(db, identity); // a parallel first sign-in won
      }
    }
  }

  if (!row) {
    const id = randomUUID();
    try {
      await db.transaction(async (tx) => {
        const username = await uniqueUsername(tx, identity.usernameHint);
        await tx.run(
          'INSERT INTO users (id, username, email, password_hash, role, display_name) VALUES (?, ?, ?, ?, ?, ?)',
          id, username, identity.email, '', signInRole ?? settings.defaultRole, identity.displayName,
        );
        await tx.run(
          `INSERT INTO user_identities (id, user_id, provider, issuer, subject, tenant_id, email_at_login, last_login_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          randomUUID(), id, PROVIDER, identity.issuer, identity.subject, identity.tenantId, identity.email,
        );
      });
      outcome = 'created';
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Two first sign-ins of the same person raced; the other one made the row.
    }
    row = await findByIdentity(db, identity);
    if (!row) throw new Error('SSO account could not be created');
  } else if (outcome === 'returning') {
    await db.run(
      `UPDATE user_identities SET last_login_at = NOW(), email_at_login = ?
        WHERE provider = ? AND issuer = ? AND subject = ?`,
      identity.email, PROVIDER, identity.issuer, identity.subject,
    );
  }

  if (row.disabled_at) {
    throw new SsoRefusedError('account_disabled', 'This account has been switched off by an administrator');
  }

  let roleChangedFrom: string | undefined;
  let role: UserRole = isUserRole(row.role) ? row.role : 'viewer';
  if (signInRole !== null && signInRole !== row.role) {
    await db.run('UPDATE users SET role = ? WHERE id = ?', signInRole, row.id);
    roleChangedFrom = row.role;
    role = signInRole;
  }
  if (identity.email && !row.email) {
    await db.run('UPDATE users SET email = ? WHERE id = ?', identity.email, row.id);
  }

  return {
    user: { id: row.id, username: row.username, role, display_name: row.display_name ?? undefined, email: identity.email ?? row.email },
    outcome,
    roleChangedFrom,
  };
}

/** Whether an account signs in through SSO (it has an OIDC identity). Such an
 *  account has no password: no reset link, no password sign-in, and an admin
 *  cannot set one — a password would be a second way in that skips the
 *  directory's MFA and survives offboarding. */
export async function hasSsoIdentity(db: DatabaseAdapter, userId: string): Promise<boolean> {
  const row = await db.get('SELECT 1 AS one FROM user_identities WHERE user_id = ? AND provider = ?', userId, PROVIDER);
  return !!row;
}
