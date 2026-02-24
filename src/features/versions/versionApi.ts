// Utility functions for interacting with the version API

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('openexpert-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface VersionSummary {
  id: number;
  version_number: number;
  label: string | null;
  created_at: string;
  content_length: number;
}

export interface Version {
  id: number;
  entity_type: string;
  entity_id: string;
  version_number: number;
  label: string | null;
  content: string;
  created_at: string;
}

/**
 * Save a new version for an entity (session, prompt, custom module, etc.)
 */
export async function saveVersion(
  entityType: string,
  entityId: string,
  content: string,
  label?: string
): Promise<{ version_number: number }> {
  const res = await fetch(`/api/versions/${entityType}/${entityId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
    body: JSON.stringify({ content, label }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to save version');
  }

  return res.json();
}

/**
 * List all versions for an entity (newest first, max 20)
 */
export async function listVersions(
  entityType: string,
  entityId: string
): Promise<VersionSummary[]> {
  const res = await fetch(`/api/versions/${entityType}/${entityId}`, {
    headers: { ...getAuthHeader() },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to fetch versions');
  }

  return res.json();
}

/**
 * Get full content of a specific version
 */
export async function getVersion(
  entityType: string,
  entityId: string,
  versionNumber: number
): Promise<Version> {
  const res = await fetch(`/api/versions/${entityType}/${entityId}/${versionNumber}`, {
    headers: { ...getAuthHeader() },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to fetch version');
  }

  return res.json();
}

/**
 * Delete a version by ID
 */
export async function deleteVersion(versionId: number): Promise<void> {
  const res = await fetch(`/api/versions/${versionId}`, {
    method: 'DELETE',
    headers: { ...getAuthHeader() },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to delete version');
  }
}

/**
 * Get diff between two versions
 */
export async function getVersionDiff(oldId: number, newId: number) {
  const res = await fetch(
    `/api/versions/diff?oldId=${encodeURIComponent(oldId)}&newId=${encodeURIComponent(newId)}`,
    { headers: { ...getAuthHeader() } }
  );

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to compute diff');
  }

  return res.json();
}
