/**
 * validate.ts — shape validation for /v1/portals/* request bodies.
 *
 * Plain manual validation, matching the relay's existing style (no Zod
 * dep). The registry's input surface is small (4 endpoints) so the
 * boilerplate is bounded and the error messages stay specific.
 *
 * Every validator returns either { ok: true, value }  or
 * { ok: false, error, field }. Endpoints translate that into a 400
 * with a structured body.
 */

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; field?: string };

// ── Field validators ───────────────────────────────────────────────────

/** ANTON-XXXX-XXXX-XXXX-XXXX in the unambiguous charset. */
const CONTACT_HASH_RE = /^ANTON-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;

/** 64 lowercase hex chars = 32-byte Ed25519 public key. */
const PUBKEY_HEX_RE = /^[0-9a-f]{64}$/;

/** Portal names: 3-32 chars, lowercase ASCII, digits, hyphens. Must start with letter. */
const PORTAL_NAME_RE = /^[a-z][a-z0-9-]{2,31}$/;

/** Namespace: same shape as portal name. Default 'global'. */
const NAMESPACE_RE = /^[a-z][a-z0-9-]{2,31}$/;

/** ISO 3166-1 alpha-2 country codes. Two uppercase letters. */
const COUNTRY_CODE_RE = /^[A-Z]{2}$/;

/** Email — pragmatic regex; full RFC 5322 is overkill for an HTTP form. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireString(
  obj: Record<string, unknown>,
  key: string,
  pattern?: RegExp,
  maxLen = 256,
): ValidationResult<string> {
  const v = obj[key];
  if (typeof v !== 'string') {
    return { ok: false, error: `${key} is required and must be a string`, field: key };
  }
  if (v.length === 0) {
    return { ok: false, error: `${key} cannot be empty`, field: key };
  }
  if (v.length > maxLen) {
    return { ok: false, error: `${key} exceeds ${maxLen} chars`, field: key };
  }
  if (pattern && !pattern.test(v)) {
    return { ok: false, error: `${key} does not match the required format`, field: key };
  }
  return { ok: true, value: v };
}

function optionalString(
  obj: Record<string, unknown>,
  key: string,
  pattern?: RegExp,
  maxLen = 256,
): ValidationResult<string | null> {
  if (obj[key] === undefined || obj[key] === null) {
    return { ok: true, value: null };
  }
  return requireString(obj, key, pattern, maxLen);
}

// ── Submit payload ─────────────────────────────────────────────────────

export interface ValidatedKyc {
  legalName: string;
  idDocumentType: 'passport' | 'national_id' | 'org_registration' | 'other';
  idDocumentNumber: string;          // plaintext from client; relay hashes before storing
  idDocumentCountry: string;
  orgName: string | null;
  orgRegistrationNumber: string | null;
  contactEmail: string;
  contactPhone: string | null;
  addressCountry: string;
  addressCity: string;
  addressStreet: string;
}

export interface ValidatedSubmit {
  proposedName: string;
  proposedNamespace: string;
  signingPubkeyHex: string;
  submitterContactHash: string;
  descriptorJson: Record<string, unknown>;
  descriptorSignature: string;
  kyc: ValidatedKyc;
}

const ID_TYPES = ['passport', 'national_id', 'org_registration', 'other'] as const;

function validateKyc(raw: unknown): ValidationResult<ValidatedKyc> {
  if (!isObject(raw)) return { ok: false, error: 'kyc must be an object', field: 'kyc' };
  const r = raw as Record<string, unknown>;
  const legalName = requireString(r, 'legalName', undefined, 200);
  if (!legalName.ok) return prefix(legalName, 'kyc.');
  const docType = requireString(r, 'idDocumentType');
  if (!docType.ok) return prefix(docType, 'kyc.');
  if (!(ID_TYPES as readonly string[]).includes(docType.value)) {
    return { ok: false, error: 'kyc.idDocumentType must be one of ' + ID_TYPES.join('|'), field: 'kyc.idDocumentType' };
  }
  const docNumber = requireString(r, 'idDocumentNumber', undefined, 100);
  if (!docNumber.ok) return prefix(docNumber, 'kyc.');
  const docCountry = requireString(r, 'idDocumentCountry', COUNTRY_CODE_RE);
  if (!docCountry.ok) return prefix(docCountry, 'kyc.');
  const orgName = optionalString(r, 'orgName', undefined, 200);
  if (!orgName.ok) return prefix(orgName, 'kyc.');
  const orgReg = optionalString(r, 'orgRegistrationNumber', undefined, 100);
  if (!orgReg.ok) return prefix(orgReg, 'kyc.');
  const email = requireString(r, 'contactEmail', EMAIL_RE, 200);
  if (!email.ok) return prefix(email, 'kyc.');
  const phone = optionalString(r, 'contactPhone', undefined, 50);
  if (!phone.ok) return prefix(phone, 'kyc.');
  const addrCountry = requireString(r, 'addressCountry', COUNTRY_CODE_RE);
  if (!addrCountry.ok) return prefix(addrCountry, 'kyc.');
  const addrCity = requireString(r, 'addressCity', undefined, 100);
  if (!addrCity.ok) return prefix(addrCity, 'kyc.');
  const addrStreet = requireString(r, 'addressStreet', undefined, 200);
  if (!addrStreet.ok) return prefix(addrStreet, 'kyc.');

  return {
    ok: true,
    value: {
      legalName: legalName.value,
      idDocumentType: docType.value as ValidatedKyc['idDocumentType'],
      idDocumentNumber: docNumber.value,
      idDocumentCountry: docCountry.value,
      orgName: orgName.value,
      orgRegistrationNumber: orgReg.value,
      contactEmail: email.value,
      contactPhone: phone.value,
      addressCountry: addrCountry.value,
      addressCity: addrCity.value,
      addressStreet: addrStreet.value,
    },
  };
}

function prefix<T>(r: ValidationResult<T>, p: string): ValidationResult<T> {
  if (r.ok) return r;
  return { ok: false, error: r.error, field: r.field ? p + r.field : r.field };
}

export function validateSubmit(raw: unknown): ValidationResult<ValidatedSubmit> {
  if (!isObject(raw)) return { ok: false, error: 'body must be a JSON object' };
  const proposedName = requireString(raw, 'proposedName', PORTAL_NAME_RE);
  if (!proposedName.ok) return proposedName;
  const proposedNamespace = requireString(raw, 'proposedNamespace', NAMESPACE_RE);
  if (!proposedNamespace.ok) return proposedNamespace;
  const pubkeyHex = requireString(raw, 'signingPubkeyHex', PUBKEY_HEX_RE);
  if (!pubkeyHex.ok) return pubkeyHex;
  const contactHash = requireString(raw, 'submitterContactHash', CONTACT_HASH_RE);
  if (!contactHash.ok) return contactHash;
  if (!isObject(raw.descriptorJson)) {
    return { ok: false, error: 'descriptorJson must be an object', field: 'descriptorJson' };
  }
  const descriptorSignature = requireString(raw, 'descriptorSignature', /^[A-Za-z0-9_-]+={0,2}$/, 200);
  if (!descriptorSignature.ok) return descriptorSignature;
  const kyc = validateKyc(raw.kyc);
  if (!kyc.ok) return kyc;

  return {
    ok: true,
    value: {
      proposedName: proposedName.value,
      proposedNamespace: proposedNamespace.value,
      signingPubkeyHex: pubkeyHex.value,
      submitterContactHash: contactHash.value,
      descriptorJson: raw.descriptorJson as Record<string, unknown>,
      descriptorSignature: descriptorSignature.value,
      kyc: kyc.value,
    },
  };
}

// ── Search query ────────────────────────────────────────────────────────

export interface ValidatedSearchQuery {
  text: string | null;
  verbs: string[];
  categories: string[];
  namespace: string | null;
  limit: number;
  offset: number;
}

const VALID_VERBS = new Set([
  'contact', 'inquire', 'request', 'order', 'pay', 'book',
  'subscribe', 'join', 'query', 'publish', 'delegate', 'authenticate',
  'custom',
]);

export function validateSearchQuery(params: URLSearchParams): ValidationResult<ValidatedSearchQuery> {
  const text = params.get('text');
  if (text !== null && text.length > 256) {
    return { ok: false, error: 'text exceeds 256 chars', field: 'text' };
  }
  const verbsRaw = params.get('verbs');
  const verbs: string[] = [];
  if (verbsRaw) {
    for (const v of verbsRaw.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!VALID_VERBS.has(v)) {
        return { ok: false, error: `unknown verb: ${v}`, field: 'verbs' };
      }
      verbs.push(v);
    }
  }
  const categoriesRaw = params.get('categories');
  const categories: string[] = [];
  if (categoriesRaw) {
    for (const c of categoriesRaw.split(',').map((s) => s.trim()).filter(Boolean)) {
      if (!/^[a-z][a-z0-9-]{1,31}$/.test(c)) {
        return { ok: false, error: `invalid category: ${c}`, field: 'categories' };
      }
      categories.push(c);
    }
  }
  const namespaceRaw = params.get('namespace');
  let namespace: string | null = null;
  if (namespaceRaw !== null) {
    if (!NAMESPACE_RE.test(namespaceRaw)) {
      return { ok: false, error: 'namespace does not match required format', field: 'namespace' };
    }
    namespace = namespaceRaw;
  }
  const limit = clampInt(params.get('limit'), 1, 100, 20);
  const offset = clampInt(params.get('offset'), 0, 10_000, 0);

  return {
    ok: true,
    value: { text: text || null, verbs, categories, namespace, limit, offset },
  };
}

function clampInt(s: string | null, min: number, max: number, fallback: number): number {
  if (s === null) return fallback;
  const n = parseInt(s, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// ── Name + namespace resolution ─────────────────────────────────────────

export function parseAddress(raw: string): ValidationResult<{ name: string; namespace: string }> {
  // Accept "name.namespace" or just "name" (namespace defaults to 'global').
  const dot = raw.indexOf('.');
  if (dot < 0) {
    if (!PORTAL_NAME_RE.test(raw)) {
      return { ok: false, error: 'address name does not match required format', field: 'address' };
    }
    return { ok: true, value: { name: raw, namespace: 'global' } };
  }
  const name = raw.slice(0, dot);
  const namespace = raw.slice(dot + 1);
  if (!PORTAL_NAME_RE.test(name)) {
    return { ok: false, error: 'address name does not match required format', field: 'address' };
  }
  if (!NAMESPACE_RE.test(namespace)) {
    return { ok: false, error: 'address namespace does not match required format', field: 'address' };
  }
  return { ok: true, value: { name, namespace } };
}
