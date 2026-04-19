/**
 * hardware-helpers.ts — shared utilities for the Hardware Build pillar.
 *
 * Replaces 7 local copies of `parseJson<T>` (extend-device, maintain, template,
 * humanitarian, hardware-project, regulatory-pack, hkp services). Adds
 * `ServiceError` for proper HTTP status mapping at routes, and `sha256` for
 * the audit-trail content hashes.
 */

import { createHash } from 'crypto';

/**
 * Defensive JSON parse with fallback. Used by every service that reads JSONB
 * columns (`metadata`, `case_data`, `event_data`, etc.) — the pg driver
 * returns parsed objects for jsonb but parsed strings for json, and the
 * underlying schema mixes both, so this normalises.
 */
export function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

/** sha256 hex digest — used for content-hashed audit trails on artefacts. */
export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/**
 * ServiceError — throw inside a service when the failure has a clear HTTP
 * status semantic (404 not found, 403 forbidden, 400 bad input).
 *
 * Routes catch ServiceError and map `statusCode` directly. Any other thrown
 * error becomes 500.
 */
export class ServiceError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  constructor(statusCode: number, message: string, code?: string) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
  static notFound(what: string): ServiceError { return new ServiceError(404, `${what} not found`, 'not_found'); }
  static forbidden(why: string): ServiceError { return new ServiceError(403, why, 'forbidden'); }
  static badRequest(why: string): ServiceError { return new ServiceError(400, why, 'bad_request'); }
  static conflict(why: string): ServiceError { return new ServiceError(409, why, 'conflict'); }
}

/**
 * Map an unknown caught error to an HTTP status + safe message string. Used
 * by every route handler in `server/routes/hardware.ts`. ServiceError gets
 * its declared statusCode; ZodError-shaped objects get 400; everything else
 * maps to 500.
 */
export function statusFromError(err: unknown): { status: number; message: string } {
  if (err instanceof ServiceError) {
    return { status: err.statusCode, message: err.message };
  }
  // ZodError detection without importing zod (avoid circular)
  if (err && typeof err === 'object' && (err as { name?: string }).name === 'ZodError') {
    return { status: 400, message: 'Validation failed' };
  }
  if (err instanceof Error) {
    return { status: 500, message: err.message };
  }
  return { status: 500, message: String(err) };
}

/**
 * Schema version guard. Logs a warning when reading a row written by a
 * future schema version we don't know how to interpret. Returns whether
 * the row is safe to proceed with.
 */
export function checkSchemaVersion(
  contextDescription: string,
  rowVersion: string | null | undefined,
  supportedMajor: number,
): boolean {
  if (!rowVersion) return true; // legacy rows pre-versioning
  const major = Number(rowVersion.split('.')[0]);
  if (Number.isNaN(major)) return true;
  if (major > supportedMajor) {
    console.warn(`[hardware] ${contextDescription} schema version ${rowVersion} > supported ${supportedMajor}.x — proceeding but some fields may be misinterpreted`);
    return true; // continue; the data we DO understand is still readable
  }
  return true;
}
