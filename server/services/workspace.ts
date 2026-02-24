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

/**
 * Create a complete workspace folder structure for a project.
 * Creates: /workspaces/{projectId}/{uploads,outputs,rag,collaboration,metadata}/
 */
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
  await fs.ensureDir(path.join(workspace.outputs, 'compiled')); // compiled cross-session outputs
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

  console.log(`[workspace] Created workspace for project ${projectId} at ${root}`);
  return workspace;
}

/**
 * Get workspace paths for an existing project.
 * If workspace doesn't exist, creates it.
 */
export async function getProjectWorkspace(projectId: string): Promise<ProjectWorkspace> {
  const root = path.join(WORKSPACES_ROOT, projectId);

  if (!await fs.pathExists(root)) {
    console.log(`[workspace] Workspace not found for ${projectId}, creating...`);
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

/**
 * Delete a project workspace and all its contents.
 * WARNING: This is destructive and cannot be undone.
 */
export async function deleteProjectWorkspace(projectId: string): Promise<void> {
  const root = path.join(WORKSPACES_ROOT, projectId);
  if (await fs.pathExists(root)) {
    await fs.remove(root);
    console.log(`[workspace] Deleted workspace for project ${projectId}`);
  }
}

/**
 * Ensure the global workspaces root directory exists.
 */
export async function ensureWorkspacesRoot(): Promise<void> {
  await fs.ensureDir(WORKSPACES_ROOT);
  console.log(`[workspace] Workspaces root directory: ${WORKSPACES_ROOT}`);
}
