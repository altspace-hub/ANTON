# Project Workspace — Quick Reference

## Folder Structure

```
/workspaces/
  /{project-uuid}/
    /uploads/             — User-uploaded files (PDFs, DOCX, etc.)
      /{session-id}/      — Optional: per-session uploads
    /outputs/             — Generated exports (DOCX, XLSX, PDF)
      /{session-id}/      — Per-session exports
      /compiled/          — Cross-session compilations
    /rag/                 — RAG knowledge base
      /documents/         — Source documents for indexing
      /collections/       — Indexed vector collections
      /indexes/           — FAISS/Chroma indexes
    /collaboration/       — Team collaboration
      /shared/            — Files shared between members
      /comments/          — Annotations (JSON)
      /versions/          — Version history
    /metadata/            — Project metadata
      project.json        — Config, timeline, members
```

---

## API Usage

### Create Workspace (Automatic)
```typescript
// When creating a project, workspace is created automatically
const workspace = await createProjectWorkspace(projectId);
// Returns: { projectId, root, uploads, outputs, rag, collaboration, metadata }
```

### Get Workspace Paths
```typescript
const workspace = await getProjectWorkspace(projectId);
// Auto-creates workspace if missing
```

### Delete Workspace
```typescript
await deleteProjectWorkspace(projectId);
// Removes entire workspace folder
```

---

## Environment Configuration

```bash
# .env
WORKSPACES_DIR=./workspaces    # Default: ./workspaces
```

---

## Database Schema

```sql
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  template_id TEXT,
  status TEXT DEFAULT 'active',
  workspace_path TEXT,           -- ← Added
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

---

## Future Use Cases

### Session-Scoped Uploads
```typescript
// Upload to specific session folder
const sessionUploadPath = path.join(workspace.uploads, sessionId, filename);
```

### RAG Document Management
```typescript
// Store regulation PDFs for indexing
const ragDocPath = path.join(workspace.rag, 'documents', 'regulations', filename);
```

### Version Control
```typescript
// Save output versions
const versionPath = path.join(
  workspace.collaboration,
  'versions',
  `${sessionId}-${timestamp}.md`
);
```

### Compiled Reports
```typescript
// Multi-session final report
const finalReportPath = path.join(
  workspace.outputs,
  'compiled',
  'final-report.pdf'
);
```

---

## Migration

**For existing projects:**
```bash
pnpm run db:migrate:workspaces
```

**Manual migration (if needed):**
```sql
ALTER TABLE projects ADD COLUMN workspace_path TEXT;
UPDATE projects SET workspace_path = './workspaces/' || id WHERE workspace_path IS NULL;
```

---

**Last Updated:** 2026-02-21
