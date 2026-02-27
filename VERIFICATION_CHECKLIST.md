# Workspace Implementation — Verification Checklist

Run through these steps to verify the implementation is working correctly.

---

## Pre-Flight Checks

- [ ] `.env` file exists (copy from `.env.example` if needed)
- [ ] `ANTHROPIC_API_KEY` is set in `.env`
- [ ] Dependencies installed: `pnpm install`
- [ ] Database initialized: `pnpm run db:init`

---

## Part A: Project Creation Logging

### Test 1: Server Startup Verification
```bash
pnpm run dev
```

**Expected console output:**
```
[db] Available tables: audit_log, ..., projects, ...
[db] ✅ Projects table exists with X projects
[workspace] Workspaces root directory: ./workspaces
openEXPERT by ANTON — server running on http://localhost:3001
```

**Checklist:**
- [ ] No error messages during startup
- [ ] Database tables listed
- [ ] Projects table verified
- [ ] Workspaces directory path logged
- [ ] Server starts on port 3001

---

## Part B: Workspace Functionality

### Test 2: Create Project via API
```bash
curl -X POST http://localhost:3001/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Project","description":"Testing workspace creation"}'
```

**Expected console output:**
```
[projects] Creating project: { name: 'Test Project', description: '...' }
[projects] Creating workspace for project: <uuid>
[workspace] Created workspace for project <uuid> at ./workspaces/<uuid>
[projects] ✅ Project created successfully: <uuid>
```

**Expected API response:**
```json
{
  "id": "abc-123-uuid",
  "name": "Test Project",
  "description": "Testing workspace creation",
  "status": "active",
  "session_count": 0,
  "workspace_path": "./workspaces/abc-123-uuid",
  "created_at": "2026-02-21T...",
  "updated_at": "2026-02-21T..."
}
```

**Checklist:**
- [ ] HTTP 200 response
- [ ] Response includes `workspace_path`
- [ ] Console logs show each step
- [ ] No error messages

### Test 3: Verify Folder Structure
```bash
# Replace <uuid> with your project ID from Test 2
ls -R workspaces/<uuid>
```

**Expected structure:**
```
workspaces/<uuid>/
  collaboration/
    comments/
    shared/
    versions/
  metadata/
    project.json
  outputs/
    compiled/
  rag/
    collections/
    documents/
    indexes/
  uploads/
```

**Checklist:**
- [ ] All top-level folders exist (uploads, outputs, rag, collaboration, metadata)
- [ ] Subfolders created (rag/documents, collaboration/versions, outputs/compiled, etc.)
- [ ] `metadata/project.json` file exists

### Test 4: Verify Database Entry
```bash
sqlite3 data/workbench.sqlite "SELECT id, name, workspace_path FROM projects WHERE name='Test Project';"
```

**Expected output:**
```
abc-123-uuid|Test Project|./workspaces/abc-123-uuid
```

**Checklist:**
- [ ] Project record exists
- [ ] `workspace_path` column populated
- [ ] Path matches filesystem location

### Test 5: Delete Project
```bash
curl -X DELETE http://localhost:3001/api/projects/<uuid>
```

**Expected console output:**
```
[projects] Deleting project: <uuid>
[workspace] Deleted workspace for project <uuid>
[projects] ✅ Project deleted successfully: <uuid>
```

**Expected filesystem:**
```bash
ls workspaces/<uuid>
# Should return: No such file or directory
```

**Checklist:**
- [ ] HTTP 200 response
- [ ] Console logs show deletion steps
- [ ] Workspace folder completely removed
- [ ] Database record removed

---

## Part C: Migration Test (If Existing Projects)

### Test 6: Create Projects Without Workspace (Simulate Old Projects)
```bash
# Manually insert a project without workspace_path
sqlite3 data/workbench.sqlite << SQL
INSERT INTO projects (id, name, description, created_at, updated_at)
VALUES ('test-old-project-1', 'Old Project 1', 'Before workspace feature', datetime('now'), datetime('now'));
SQL
```

### Test 7: Run Migration
```bash
pnpm run db:migrate:workspaces
```

**Expected output:**
```
=== Workspace Migration ===
Database: ./data/workbench.sqlite
[1/3] workspace_path column already exists
[2/3] Found 1 projects
  ✅ Created workspace for "Old Project 1" (test-old-project-1)
[3/3] Migration complete: 1 created, 0 skipped
=== Migration Complete ===
```

**Checklist:**
- [ ] Migration runs without errors
- [ ] Shows project count
- [ ] Creates workspace for old project
- [ ] Reports creation success

### Test 8: Verify Migration Result
```bash
ls workspaces/test-old-project-1
sqlite3 data/workbench.sqlite "SELECT workspace_path FROM projects WHERE id='test-old-project-1';"
```

**Expected:**
- Workspace folder exists with full structure
- Database record updated with workspace_path

**Checklist:**
- [ ] Workspace folder created
- [ ] Database updated
- [ ] Migration is idempotent (safe to re-run)

---

## Part D: Workspace Service Unit Test

### Test 9: Run Workspace Test
```bash
npx tsx test-workspace.ts
```

**Expected output:**
```
=== Workspace Service Test ===
[1/4] Creating workspace...
✅ Workspace created
[2/4] Getting workspace (should find existing)...
✅ Workspace retrieved
[3/4] Verifying folder structure...
✅ All folders verified
[4/4] Cleaning up...
✅ Workspace deleted
=== All Tests Passed ✅ ===
```

**Checklist:**
- [ ] All 4 tests pass
- [ ] No errors or warnings
- [ ] Cleanup successful (no leftover folders)

---

## Final Verification

- [ ] All tests above passed
- [ ] No error messages in server console
- [ ] Workspace folders created with correct structure
- [ ] Database schema includes workspace_path column
- [ ] Migration script works for existing projects
- [ ] Project deletion removes workspace
- [ ] Server startup logs are clear and informative

---

## Troubleshooting

### If server won't start:
1. Check `.env` file exists
2. Run `pnpm run db:init`
3. Check for port conflicts (port 3001)

### If workspace_path is NULL:
1. Run migration: `pnpm run db:migrate:workspaces`
2. Or manually: `sqlite3 data/workbench.sqlite "ALTER TABLE projects ADD COLUMN workspace_path TEXT;"`

### If folder creation fails:
1. Check WORKSPACES_DIR is writable
2. Check disk space
3. Review server console for permission errors

---

**Verification Complete:** [ ] Yes / [ ] No
**Date Verified:** ___________
**Verified By:** ___________
**Notes:** ___________

