/**
 * file-upload-ownership.test.ts — uploads get an owner, and the owner is enforced.
 *
 * Two related defects.
 *
 *  1. `POST /api/files/upload` wrote NOTHING to the database. `GET /api/files/:id`
 *     then served any id present in the upload directory, checked only for path
 *     traversal. The id was the entire access control mechanism — a capability URL,
 *     and capability URLs leak through anything that records a URL: history, proxy
 *     logs, a pasted link, a screenshot. On a shared install those files are other
 *     people's contracts and case documents.
 *
 *  2. `rag_documents` HAS had an `uploaded_by` column all along, but the upload routes
 *     read `(req as any).userId` — a property nothing ever sets, since the auth
 *     middleware stamps `req.user.id`. Every document was attributed to the literal
 *     string 'system'.
 *
 * (2) is the more instructive failure: it silently DISABLED the ownership checks added
 * to reindex/delete/get, which compare `uploaded_by` against a real user id that
 * 'system' never matches. The visible symptom in team mode was not a leak but a
 * lockout — every user got 404 on their own documents. A guard reading a column that
 * nothing populates looks identical to a working guard until someone tries to use it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { scopesToOwner, ownerFilter, type OwnedRequest } from '../../server/middleware/ownership.js';

const FILES = readFileSync(join(process.cwd(), 'server/routes/files.ts'), 'utf8');
const DOCS = readFileSync(join(process.cwd(), 'server/routes/documents.ts'), 'utf8');
const MIGRATION = readFileSync(
  join(process.cwd(), 'server/db/migrations-pg/253_file_upload_ownership.sql'), 'utf8',
);

const ALICE: OwnedRequest = { user: { id: 'alice', role: 'analyst' } };
const ADMIN: OwnedRequest = { user: { id: 'root', role: 'admin' } };

let original: string | undefined;
beforeEach(() => { original = process.env.DEPLOYMENT_MODE; });
afterEach(() => {
  if (original === undefined) delete process.env.DEPLOYMENT_MODE;
  else process.env.DEPLOYMENT_MODE = original;
});

describe('the attribution bug that disabled the existing guards', () => {
  it('no longer reads req.userId, which nothing sets', () => {
    expect(DOCS).not.toContain('(req as any).userId');
  });

  it('writes the authenticated user id', () => {
    expect((DOCS.match(/req\.user\?\.id \?\? null/g) ?? []).length).toBe(2);
  });

  it("never stores the string 'system' as an owner", () => {
    // A sentinel in an owner column is worse than NULL: it reads as a real account,
    // and it matches across every user, so any check against it is meaningless.
    expect(DOCS).not.toMatch(/uploaded_?[Bb]y\s*[=:]\s*'system'/);
    expect(DOCS).not.toContain("|| 'system'");
  });

  it('normalises the legacy sentinel to NULL in the migration', () => {
    expect(MIGRATION).toMatch(/UPDATE rag_documents SET uploaded_by = NULL WHERE uploaded_by = 'system'/);
  });
});

describe('file_uploads ownership record', () => {
  it('the migration creates the table with an owner column', () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS file_uploads/);
    expect(MIGRATION).toMatch(/uploaded_by\s+TEXT/);
  });

  it('indexes the owner column, since it is queried on every download', () => {
    expect(MIGRATION).toMatch(/CREATE INDEX IF NOT EXISTS idx_file_uploads_uploaded_by/);
  });

  it('does not foreign-key the owner to users', () => {
    // Deleting a user must not cascade away the record of what they uploaded.
    const table = MIGRATION.slice(MIGRATION.indexOf('CREATE TABLE IF NOT EXISTS file_uploads'));
    expect(table.slice(0, table.indexOf(');'))).not.toMatch(/REFERENCES\s+users/i);
  });

  it('the upload route inserts a row', () => {
    expect(FILES).toMatch(/INSERT INTO file_uploads/);
    expect(FILES).toContain('req.user?.id ?? null');
  });

  it('inserts BEFORE responding, so no id escapes without an owner', () => {
    const insertAt = FILES.indexOf('INSERT INTO file_uploads');
    const firstJsonAt = FILES.indexOf('res.json({', insertAt - 4000);
    expect(insertAt).toBeGreaterThan(-1);
    expect(insertAt).toBeLessThan(FILES.indexOf('res.json({', insertAt));
    // and it precedes the image branch's response too
    expect(insertAt).toBeLessThan(FILES.indexOf('isImage: true'));
    expect(firstJsonAt).toBeGreaterThan(-1);
  });

  it('the download route consults the record', () => {
    expect(FILES).toMatch(/SELECT uploaded_by FROM file_uploads WHERE id = \?/);
  });

  it('checks ownership before touching the filesystem', () => {
    // Otherwise existence is observable through timing or a differing status code.
    const ownerCheck = FILES.indexOf('SELECT uploaded_by FROM file_uploads');
    const fsCheck = FILES.indexOf('fs.existsSync(filePath)');
    expect(ownerCheck).toBeGreaterThan(-1);
    expect(ownerCheck).toBeLessThan(fsCheck);
  });

  it('answers 404, not 403, when the file is not yours', () => {
    const guard = FILES.slice(
      FILES.indexOf('SELECT uploaded_by FROM file_uploads'),
      FILES.indexOf('const filePath'),
    );
    expect(guard).toContain('404');
    expect(guard).not.toContain('403');
  });

  it('normalises the id before BOTH the ownership lookup and the file read', () => {
    // Checking ownership of one id and serving another would be its own bug, so the
    // basename must be taken once, before the guard — not separately at each use.
    const norm = FILES.indexOf('path.basename(String(req.params.id))');
    expect(norm).toBeGreaterThan(-1);
    expect(norm).toBeLessThan(FILES.indexOf('SELECT uploaded_by FROM file_uploads'));
    expect(FILES).not.toMatch(/path\.join\(UPLOAD_DIR, req\.params\.id/);
  });

  it('treats a file with no record as unattributed, not as public', () => {
    const guard = FILES.slice(
      FILES.indexOf('SELECT uploaded_by FROM file_uploads'),
      FILES.indexOf('const filePath'),
    );
    expect(guard).toMatch(/!row \|\|/);      // missing row fails the check
  });
});

describe('scoping behaves as these routes assume', () => {
  it('does not scope solo installs, so existing attachments keep resolving', () => {
    process.env.DEPLOYMENT_MODE = 'solo';
    expect(scopesToOwner(ALICE)).toBe(false);
  });

  it('does not scope admins', () => {
    process.env.DEPLOYMENT_MODE = 'team';
    expect(scopesToOwner(ADMIN)).toBe(false);
  });

  it('scopes a non-admin on a shared install', () => {
    process.env.DEPLOYMENT_MODE = 'team';
    expect(scopesToOwner(ALICE)).toBe(true);
    expect(ownerFilter(ALICE, 'uploaded_by').sql).toBe(' AND uploaded_by = ?');
  });
});

describe('the collection listing is scoped too', () => {
  it('passes an owner filter rather than listing every uploader', () => {
    // Without this a non-admin sees the filename and size of everyone else's uploads
    // in the collection, and can then request each by id.
    expect(DOCS).toContain("ownerFilter(req, 'uploaded_by')");
  });
});
