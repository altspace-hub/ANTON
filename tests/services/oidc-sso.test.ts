/**
 * oidc-sso.test.ts — the single sign-on decisions, without an identity provider.
 *
 * Settings (and what is wrong with them), who an ID token names, which
 * directory may sign in, and which ANTON role the directory grants. The redirect
 * flow and provisioning against PostgreSQL are in tests/routes/sso-oidc-flow.test.ts.
 */
import { describe, it, expect } from 'vitest';
import {
  readOidcSettings, oidcSettingsProblems, identityFromClaims, tenantAllowed, mappedRole, directoryRole,
} from '../../server/services/oidc-sso.js';

const TENANT = '11111111-2222-3333-4444-555555555555';
const ENTRA = {
  OIDC_ISSUER_URL: `https://login.microsoftonline.com/${TENANT}/v2.0`,
  OIDC_CLIENT_ID: 'client-1',
  OIDC_CLIENT_SECRET: 's3cret',
  OIDC_REDIRECT_URI: 'https://anton.example.com/api/auth/oidc/callback',
};

describe('readOidcSettings', () => {
  it('is null until issuer and client id are both set', () => {
    expect(readOidcSettings({})).toBeNull();
    expect(readOidcSettings({ OIDC_ISSUER_URL: ENTRA.OIDC_ISSUER_URL })).toBeNull();
    expect(readOidcSettings(ENTRA)).not.toBeNull();
  });

  it('reads Entra defaults, the role map and the tenant list', () => {
    const s = readOidcSettings({
      ...ENTRA,
      OIDC_ROLE_MAP: 'Anton.Admin=admin, Anton.Viewer=VIEWER,broken,Other=superuser',
      OIDC_ALLOWED_TENANT_IDS: `${TENANT.toUpperCase()} , aaaa`,
      OIDC_DEFAULT_ROLE: 'viewer',
    })!;
    expect(s.isMicrosoft).toBe(true);
    expect(s.buttonLabel).toBe('Sign in with Microsoft');
    expect([...s.roleMap]).toEqual([['Anton.Admin', 'admin'], ['Anton.Viewer', 'viewer']]); // unknown roles dropped
    expect(s.allowedTenantIds).toEqual([TENANT, 'aaaa']);
    expect(s.defaultRole).toBe('viewer');
    expect(s.roleClaim).toBe('roles');
  });

  it('an unknown default role falls back to analyst — never to admin', () => {
    expect(readOidcSettings({ ...ENTRA, OIDC_DEFAULT_ROLE: 'root' })!.defaultRole).toBe('analyst');
  });
});

describe('oidcSettingsProblems', () => {
  it('refuses the multi-tenant Entra endpoints without a tenant allow-list', () => {
    for (const segment of ['common', 'organizations', 'consumers']) {
      const s = readOidcSettings({ ...ENTRA, OIDC_ISSUER_URL: `https://login.microsoftonline.com/${segment}/v2.0` })!;
      expect(oidcSettingsProblems(s, {}).errors.join(), segment).toMatch(/multi-tenant/);
    }
    const allowed = readOidcSettings({ ...ENTRA, OIDC_ISSUER_URL: 'https://login.microsoftonline.com/organizations/v2.0', OIDC_ALLOWED_TENANT_IDS: TENANT })!;
    expect(oidcSettingsProblems(allowed, {}).errors).toEqual([]);
  });

  it('a tenant-specific v2.0 issuer with a secret is clean', () => {
    expect(oidcSettingsProblems(readOidcSettings(ENTRA)!, {})).toEqual({ errors: [], warnings: [] });
  });

  it('warns about the v1 endpoint, a missing secret and plain http in production', () => {
    const s = readOidcSettings({
      ...ENTRA,
      OIDC_ISSUER_URL: `https://login.microsoftonline.com/${TENANT}`,
      OIDC_CLIENT_SECRET: '',
      OIDC_REDIRECT_URI: 'http://anton.example.com/api/auth/oidc/callback',
    })!;
    const { errors, warnings } = oidcSettingsProblems(s, { NODE_ENV: 'production' });
    expect(errors).toEqual([]);
    expect(warnings.join('\n')).toMatch(/v2\.0/);
    expect(warnings.join('\n')).toMatch(/OIDC_CLIENT_SECRET/);
    expect(warnings.join('\n')).toMatch(/http:\/\//);
  });
});

describe('identityFromClaims', () => {
  const base = { iss: ENTRA.OIDC_ISSUER_URL, sub: 'pairwise-sub', oid: 'object-id-1', tid: TENANT.toUpperCase() };

  it('keys on the Entra object id, not the pairwise sub — and never on email', () => {
    const id = identityFromClaims({ ...base, email: 'ada@corp.example' }, { roleClaim: 'roles' });
    expect(id.subject).toBe('object-id-1');
    expect(id.tenantId).toBe(TENANT); // lower-cased
    expect(id.email).toBe('ada@corp.example');
  });

  it('falls back to sub for a provider without oid', () => {
    expect(identityFromClaims({ iss: 'https://okta.example', sub: 'okta-1' }, { roleClaim: 'roles' }).subject).toBe('okta-1');
  });

  it('a member without the email claim still signs in — preferred_username is the address', () => {
    const id = identityFromClaims({ ...base, preferred_username: 'ada.lovelace@corp.example', name: 'Ada Lovelace' }, { roleClaim: 'roles' });
    expect(id.email).toBe('ada.lovelace@corp.example');
    expect(id.displayName).toBe('Ada Lovelace');
    expect(id.usernameHint).toBe('ada.lovelace');
  });

  it('no usable address at all is still an identity', () => {
    const id = identityFromClaims({ ...base, preferred_username: 'ADA' }, { roleClaim: 'roles' });
    expect(id.email).toBeNull();
    expect(id.usernameHint).toBe('ADA');
  });

  it('reads roles from the configured claim', () => {
    expect(identityFromClaims({ ...base, roles: ['Anton.Admin', 7] }, { roleClaim: 'roles' }).roles).toEqual(['Anton.Admin']);
    expect(identityFromClaims({ ...base, groups: ['g-1', 'g-2'] }, { roleClaim: 'groups' }).roles).toEqual(['g-1', 'g-2']);
  });

  it('refuses a token without issuer or subject', () => {
    expect(() => identityFromClaims({ iss: ENTRA.OIDC_ISSUER_URL }, { roleClaim: 'roles' })).toThrow(/subject/);
  });
});

describe('identity rules the review added (2026-09-23)', () => {
  const entra = { roleClaim: 'roles', isMicrosoft: true } as const;

  it('an Entra identity keeps its key across the v1 and v2.0 issuers — oid + tid, not the iss string', () => {
    const v1 = identityFromClaims({ iss: `https://sts.windows.net/${TENANT}/`, oid: 'o-1', tid: TENANT }, entra);
    const v2 = identityFromClaims({ iss: `https://login.microsoftonline.com/${TENANT}/v2.0`, oid: 'o-1', tid: TENANT }, entra);
    expect(v1.issuer).toBe(v2.issuer);
    expect(v1.subject).toBe(v2.subject);
    // Negative control: another provider keeps its own iss.
    expect(identityFromClaims({ iss: 'https://okta.example/oauth2/default', sub: 's' }, { roleClaim: 'roles' }).issuer)
      .toBe('https://okta.example/oauth2/default');
  });

  it('an address counts as verified only when the provider vouches for it', () => {
    const generic = { roleClaim: 'roles' } as const;
    expect(identityFromClaims({ iss: 'x', sub: 's', email: 'a@corp.example' }, generic).emailVerified).toBe(false);
    expect(identityFromClaims({ iss: 'x', sub: 's', email: 'a@corp.example', email_verified: true }, generic).emailVerified).toBe(true);
    // Entra: a member of the home tenant, yes; a guest (idp claim), no — its
    // address is whatever the other directory holds.
    expect(identityFromClaims({ iss: 'x', oid: 'o', tid: TENANT, preferred_username: 'a@corp.example' }, entra).emailVerified).toBe(true);
    expect(identityFromClaims({ iss: 'x', oid: 'o', tid: TENANT, email: 'a@gmail.example', idp: 'live.com' }, entra).emailVerified).toBe(false);
    expect(identityFromClaims({ iss: 'x', oid: 'o', tid: TENANT, email: 'a@gmail.example', idp: 'live.com', xms_edov: true }, entra).emailVerified).toBe(true);
  });

  it('a groups overage is refused, not read as "no groups"', () => {
    const groups = { roleClaim: 'groups', roleMap: new Map([['g-admin', 'admin' as const]]) };
    expect(() => identityFromClaims({ iss: 'x', oid: 'o', tid: TENANT, _claim_names: { groups: 'src1' } }, groups))
      .toThrow(expect.objectContaining({ reason: 'groups_overage' }));
    expect(() => identityFromClaims({ iss: 'x', oid: 'o', tid: TENANT, hasgroups: true }, groups))
      .toThrow(expect.objectContaining({ reason: 'groups_overage' }));
    // Negative control: app roles are unaffected by a groups pointer.
    expect(() => identityFromClaims({ iss: 'x', oid: 'o', _claim_names: { groups: 'src1' } }, { roleClaim: 'roles', roleMap: new Map() })).not.toThrow();
  });

  it('with a role map the directory demotes: no mapped role means the default role', () => {
    const settings = { roleMap: new Map([['Anton.Admin', 'admin' as const]]), defaultRole: 'analyst' as const };
    const id = (roles: string[]) => identityFromClaims({ iss: 'x', oid: 'o', roles }, { roleClaim: 'roles' });
    expect(directoryRole(id(['Anton.Admin']), settings)).toBe('admin');
    expect(directoryRole(id([]), settings)).toBe('analyst');
    expect(directoryRole(id(['Other']), settings)).toBe('analyst');
    // Without a map, roles are managed in ANTON: the sign-in leaves them alone.
    expect(directoryRole(id([]), { roleMap: new Map(), defaultRole: 'analyst' })).toBeNull();
  });
});

describe('tenantAllowed and mappedRole', () => {
  const identity = identityFromClaims({ iss: 'x', oid: 'o', tid: TENANT, roles: ['Anton.Viewer', 'Anton.Admin', 'Unmapped'] }, { roleClaim: 'roles' });

  it('an allow-list admits only its tenants; without one the issuer decides', () => {
    expect(tenantAllowed(identity, { allowedTenantIds: [TENANT] })).toBe(true);
    expect(tenantAllowed(identity, { allowedTenantIds: ['someone-else'] })).toBe(false);
    expect(tenantAllowed({ ...identity, tenantId: null }, { allowedTenantIds: [TENANT] })).toBe(false);
    expect(tenantAllowed(identity, { allowedTenantIds: [] })).toBe(true);
  });

  it('the highest mapped role wins; none mapped is null', () => {
    const roleMap = new Map([['Anton.Viewer', 'viewer' as const], ['Anton.Admin', 'admin' as const]]);
    expect(mappedRole(identity, { roleMap })).toBe('admin');
    expect(mappedRole({ ...identity, roles: ['Unmapped'] }, { roleMap })).toBeNull();
    expect(mappedRole(identity, { roleMap: new Map() })).toBeNull();
  });
});
