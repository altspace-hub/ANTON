# openEXPERT Project & Folder Structure Enhancement

**Date:** 2026-02-20
**Status:** Design Proposal

---

## Current Issues

### Issue 1: Project Creation Not Working
**Symptom:** Users cannot create new projects
**Likely causes:**
1. Database not initialized with `projects` table
2. API endpoint not registered in main server
3. Frontend API call failing silently

### Issue 2: Single Output Folder
**Current structure:**
```
/uploads/    - All user uploads (mixed across all projects)
/outputs/    - All exports (no organization)
/data/       - SQLite database
```

**Problem:** No project-specific organization, no RAG storage, no collaboration workspace

---

## Proposed Solution: Project Workspace System

### New Folder Structure

```
/workspaces/
  /{project-id}/                 # UUID-based project folder
    /uploads/                    # Project-specific uploads
      /{session-id}/             # Per-session uploads
        document.pdf
        policy.docx

    /outputs/                    # Project-specific exports
      /{session-id}/             # Per-session outputs
        analysis-2024-02-20.md
        gap-matrix.xlsx
      /compiled/                 # Cross-session compilations
        final-report.pdf

    /rag/                        # RAG knowledge management
      /documents/                # Source documents for indexing
        regulations/
          amlr-2024-1624.pdf
        client-docs/
          current-policy.pdf
      /collections/              # Indexed collections
        amlr-collection/
          metadata.json
          embeddings.db
          chunks.json
      /indexes/                  # Vector indexes
        faiss.index

    /collaboration/              # Multi-user workspace
      /shared/                   # Shared files between team members
      /comments/                 # Annotations and comments
        session-abc-comments.json
      /versions/                 # Version history
        policy-v1.md
        policy-v2.md

    /metadata/                   # Project metadata
      project.json               # Project config
      timeline.json              # Project timeline/milestones
      members.json               # Team members (if team mode)

/global/                         # Non-project files
  /uploads/                      # Ad-hoc uploads
  /outputs/                      # Ad-hoc exports
  /templates/                    # Brand templates (org-wide)
```

---

## Implementation Plan

### Phase 1: Project Creation Fix

**1. Verify Database Initialization**

Add to `server/index.ts`:
```typescript
// After db initialization
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Database tables:', tables.map((t: any) => t.name).join(', '));

// Verify projects table exists
const projectsTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='projects'").get();
if (!projectsTable) {
  console.error('⚠️  Projects table not found - running migration...');
  // Run schema migration
}
```

**2. Add Logging to Project Creation**

In `server/routes/projects.ts`:
```typescript
router.post('/projects', (req, res) => {
  try {
    console.log('📁 Creating project:', req.body);
    const { name, description, template_id } = req.body;
    // ... existing code ...
    console.log('✅ Project created:', id);
    res.json({ id, name, ... });
  } catch (error) {
    console.error('❌ Project creation failed:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});
```

**3. Frontend Error Handling**

In `src/lib/api.ts`:
```typescript
export async function createProject(data: { name: string; description?: string }) {
  try {
    const res = await fetch(`${API_BASE}/projects`, {
      method: 'POST',
      headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      console.error('Failed to create project:', error);
      throw new Error(error.error || 'Failed to create project');
    }
    return res.json();
  } catch (err) {
    console.error('Project creation error:', err);
    throw err;
  }
}
```

---

### Phase 2: Project Workspace Folders

**1. Add Folder Path to Projects Table**

Migration:
```sql
ALTER TABLE projects ADD COLUMN workspace_path TEXT;
UPDATE projects SET workspace_path = '/workspaces/' || id WHERE workspace_path IS NULL;
```

**2. Create Workspace Service**

`server/services/workspace.ts`:
```typescript
import fs from 'fs-extra';
import path from 'path';

const WORKSPACES_ROOT = process.env.WORKSPACES_DIR || './workspaces';

export interface ProjectWorkspace {
  projectId: string;
  root: string;
  uploads: string;
  outputs: string;
  rag: string;
  collaboration: string;
  metadata: string;
}

export async function createProjectWorkspace(projectId: string): Promise<ProjectWorkspace> {
  const root = path.join(WORKSPACES_ROOT, projectId);

  const workspace: ProjectWorkspace = {
    projectId,
    root,
    uploads: path.join(root, 'uploads'),
    outputs: path.join(root, 'outputs'),
    rag: path.join(root, 'rag'),
    collaboration: path.join(root, 'collaboration'),
    metadata: path.join(root, 'metadata'),
  };

  // Create all folders
  await fs.ensureDir(workspace.uploads);
  await fs.ensureDir(workspace.outputs);
  await fs.ensureDir(path.join(workspace.rag, 'documents'));
  await fs.ensureDir(path.join(workspace.rag, 'collections'));
  await fs.ensureDir(path.join(workspace.rag, 'indexes'));
  await fs.ensureDir(path.join(workspace.collaboration, 'shared'));
  await fs.ensureDir(path.join(workspace.collaboration, 'comments'));
  await fs.ensureDir(path.join(workspace.collaboration, 'versions'));
  await fs.ensureDir(workspace.metadata);

  // Create metadata file
  await fs.writeJSON(path.join(workspace.metadata, 'project.json'), {
    id: projectId,
    created: new Date().toISOString(),
    version: '1.0.0',
  });

  return workspace;
}

export async function getProjectWorkspace(projectId: string): Promise<ProjectWorkspace> {
  const root = path.join(WORKSPACES_ROOT, projectId);

  if (!await fs.pathExists(root)) {
    return createProjectWorkspace(projectId);
  }

  return {
    projectId,
    root,
    uploads: path.join(root, 'uploads'),
    outputs: path.join(root, 'outputs'),
    rag: path.join(root, 'rag'),
    collaboration: path.join(root, 'collaboration'),
    metadata: path.join(root, 'metadata'),
  };
}

export async function deleteProjectWorkspace(projectId: string): Promise<void> {
  const root = path.join(WORKSPACES_ROOT, projectId);
  await fs.remove(root);
}
```

**3. Update Project Routes to Create Workspace**

```typescript
router.post('/projects', async (req, res) => {
  try {
    const { name, description, template_id } = req.body;
    if (!name?.trim()) { res.status(400).json({ error: 'name is required' }); return; }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Create workspace folders
    const workspace = await createProjectWorkspace(id);

    db.prepare(
      'INSERT INTO projects (id, name, description, template_id, workspace_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, name.trim(), description || null, template_id || null, workspace.root, now, now);

    res.json({
      id,
      name: name.trim(),
      description: description || null,
      status: 'active',
      session_count: 0,
      workspace_path: workspace.root,
      created_at: now,
      updated_at: now
    });
  } catch (error) {
    console.error('Project creation failed:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});
```

---

### Phase 3: RAG Collection Management

**1. RAG Collections API**

`server/routes/rag.ts`:
```typescript
// POST /api/projects/:projectId/rag/collections
router.post('/projects/:projectId/rag/collections', async (req, res) => {
  const { name, documents } = req.body;
  const workspace = await getProjectWorkspace(req.params.projectId);

  // Create collection folder
  const collectionPath = path.join(workspace.rag, 'collections', name);
  await fs.ensureDir(collectionPath);

  // Index documents (implement with chosen RAG library)
  // ... indexing logic ...

  res.json({ collection: name, path: collectionPath, documentCount: documents.length });
});

// GET /api/projects/:projectId/rag/collections
router.get('/projects/:projectId/rag/collections', async (req, res) => {
  const workspace = await getProjectWorkspace(req.params.projectId);
  const collectionsPath = path.join(workspace.rag, 'collections');

  const collections = await fs.readdir(collectionsPath);
  res.json({ collections });
});
```

**2. RAG Knowledge Source Mode Integration**

In `KnowledgeSourcePanel.tsx`, when Mode 5b (Knowledge Collections) is selected:
- Show collections from current project workspace
- Allow creating new collections
- Search within collections
- Results injected into Claude prompt

---

### Phase 4: Collaboration Features

**1. Version History**

Store every output as a versioned file:
```typescript
// When saving output
const workspace = await getProjectWorkspace(projectId);
const versionsPath = path.join(workspace.collaboration, 'versions');
const timestamp = Date.now();
const filename = `${sessionId}-${timestamp}.md`;
await fs.writeFile(path.join(versionsPath, filename), output);
```

**2. Comments/Annotations**

```typescript
// POST /api/projects/:projectId/sessions/:sessionId/comments
router.post('/projects/:projectId/sessions/:sessionId/comments', async (req, res) => {
  const { text, user, timestamp } = req.body;
  const workspace = await getProjectWorkspace(req.params.projectId);
  const commentsPath = path.join(workspace.collaboration, 'comments', `${req.params.sessionId}-comments.json`);

  let comments = [];
  if (await fs.pathExists(commentsPath)) {
    comments = await fs.readJSON(commentsPath);
  }

  comments.push({ id: crypto.randomUUID(), text, user, timestamp });
  await fs.writeJSON(commentsPath, comments);

  res.json({ ok: true, comments });
});
```

---

## Migration Path

### Step 1: Add Workspace Creation to Existing Projects
```typescript
// One-time migration script
async function migrateExistingProjects() {
  const projects = db.prepare('SELECT id FROM projects').all();
  for (const project of projects) {
    await createProjectWorkspace(project.id);
    db.prepare('UPDATE projects SET workspace_path = ? WHERE id = ?')
      .run(`/workspaces/${project.id}`, project.id);
  }
}
```

### Step 2: Update File Upload Routes
Change from global `/uploads` to project-specific:
```typescript
router.post('/projects/:projectId/upload', upload.single('file'), async (req, res) => {
  const workspace = await getProjectWorkspace(req.params.projectId);
  const sessionId = req.body.sessionId || 'default';
  const targetPath = path.join(workspace.uploads, sessionId, req.file.originalname);

  await fs.ensureDir(path.dirname(targetPath));
  await fs.move(req.file.path, targetPath);

  res.json({ path: targetPath, size: req.file.size });
});
```

### Step 3: Update Export Routes
Change from global `/outputs` to project-specific:
```typescript
router.post('/projects/:projectId/export', async (req, res) => {
  const workspace = await getProjectWorkspace(req.params.projectId);
  const sessionId = req.body.sessionId;
  const outputPath = path.join(workspace.outputs, sessionId);

  await fs.ensureDir(outputPath);
  // ... export logic ...
});
```

---

## Benefits

### For Single Users
- ✅ Organized exports per project
- ✅ RAG collections scoped to project context
- ✅ Version history for critical outputs
- ✅ Clear separation between projects

### For Teams
- ✅ Shared workspace for collaboration
- ✅ Per-project access control
- ✅ Audit trail of who uploaded/edited what
- ✅ Comment threads on outputs

### For Compliance
- ✅ Complete audit trail (who, what, when)
- ✅ Immutable version history
- ✅ Project-level data retention policies
- ✅ Easy export for regulatory submission

---

## Environment Variables

Add to `.env`:
```bash
# Workspace configuration
WORKSPACES_DIR=./workspaces
ENABLE_PROJECT_WORKSPACES=true
MAX_PROJECT_SIZE_GB=10

# RAG configuration
RAG_EMBEDDING_MODEL=text-embedding-3-small
RAG_CHUNK_SIZE=1000
RAG_CHUNK_OVERLAP=200
```

---

## Next Steps

1. **Immediate:** Debug project creation issue (Phase 1)
2. **Short-term:** Implement workspace folder structure (Phase 2)
3. **Medium-term:** Add RAG collection management (Phase 3)
4. **Long-term:** Build collaboration features (Phase 4)

---

**Last Updated:** 2026-02-20
