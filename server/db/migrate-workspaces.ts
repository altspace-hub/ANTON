/**
 * Database migration: Add workspace_path column to projects table
 * and create workspaces for all existing projects.
 *
 * Run this manually: npx tsx server/db/migrate-workspaces.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProjectWorkspace } from '../services/workspace.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH || './data/workbench.sqlite';

async function migrateWorkspaces() {
  console.log('=== Workspace Migration ===');
  console.log(`Database: ${DB_PATH}`);

  const db = new Database(DB_PATH);
  db.pragma('foreign_keys = ON');

  // Step 1: Check if workspace_path column exists
  const projectsCols = db.prepare("PRAGMA table_info(projects)").all() as Array<{ name: string }>;
  const colNames = projectsCols.map((c) => c.name);

  if (!colNames.includes('workspace_path')) {
    console.log('[1/3] Adding workspace_path column to projects table...');
    db.exec('ALTER TABLE projects ADD COLUMN workspace_path TEXT');
    console.log('✅ Column added');
  } else {
    console.log('[1/3] workspace_path column already exists');
  }

  // Step 2: Get all projects
  const projects = db.prepare('SELECT id, name FROM projects').all() as Array<{ id: string; name: string }>;
  console.log(`[2/3] Found ${projects.length} projects`);

  // Step 3: Create workspaces for projects that don't have one
  let created = 0;
  let skipped = 0;

  for (const project of projects) {
    const existingPath = db.prepare('SELECT workspace_path FROM projects WHERE id = ?').get(project.id) as { workspace_path: string | null } | undefined;

    if (!existingPath?.workspace_path) {
      try {
        const workspace = await createProjectWorkspace(project.id);
        db.prepare('UPDATE projects SET workspace_path = ? WHERE id = ?').run(workspace.root, project.id);
        console.log(`  ✅ Created workspace for "${project.name}" (${project.id})`);
        created++;
      } catch (error) {
        console.error(`  ❌ Failed to create workspace for "${project.name}":`, error);
      }
    } else {
      console.log(`  ⏭️  Skipped "${project.name}" (workspace already exists)`);
      skipped++;
    }
  }

  console.log(`[3/3] Migration complete: ${created} created, ${skipped} skipped`);

  db.close();
  console.log('=== Migration Complete ===');
}

// Run migration
migrateWorkspaces().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
