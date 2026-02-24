// server/services/version-diff.ts
// Computes a structured diff between two text versions using line-level diffing.

export interface DiffChunk {
  type: 'unchanged' | 'added' | 'removed' | 'modified';
  oldLines?: string[];
  newLines?: string[];
  lines?: string[];    // for unchanged
  sectionTitle?: string; // if chunk is under a markdown heading
}

export interface DiffStats {
  linesAdded: number;
  linesRemoved: number;
  linesModified: number;
  linesUnchanged: number;
  similarity: number; // 0-1
  sectionsChanged: string[];
}

export interface VersionDiffResult {
  oldVersionId: string;
  newVersionId: string;
  oldLabel: string;
  newLabel: string;
  oldCreatedAt: string;
  newCreatedAt: string;
  chunks: DiffChunk[];
  stats: DiffStats;
  semanticSummary: string;
}

/**
 * Computes a structured, line-level diff between two text strings.
 * Uses a patience-style look-ahead algorithm.
 */
export function computeDiff(oldContent: string, newContent: string): DiffChunk[] {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const chunks: DiffChunk[] = [];
  let oldIdx = 0;
  let newIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    // Rest of new content is added
    if (oldIdx >= oldLines.length) {
      chunks.push({ type: 'added', newLines: newLines.slice(newIdx) });
      break;
    }
    // Rest of old content is removed
    if (newIdx >= newLines.length) {
      chunks.push({ type: 'removed', oldLines: oldLines.slice(oldIdx) });
      break;
    }

    if (oldLines[oldIdx] === newLines[newIdx]) {
      // Collect a run of consecutive matching lines
      const unchangedLines: string[] = [];
      while (
        oldIdx < oldLines.length &&
        newIdx < newLines.length &&
        oldLines[oldIdx] === newLines[newIdx]
      ) {
        unchangedLines.push(oldLines[oldIdx]);
        oldIdx++;
        newIdx++;
      }
      chunks.push({ type: 'unchanged', lines: unchangedLines });
    } else {
      // Look ahead up to 10 lines in both directions to find the next matching point
      const lookAhead = 10;
      let foundOldAt = -1;
      let foundNewAt = -1;

      outer: for (let d = 1; d <= lookAhead; d++) {
        for (let i = 0; i <= d; i++) {
          const j = d - i;
          if (
            oldIdx + i < oldLines.length &&
            newIdx + j < newLines.length &&
            oldLines[oldIdx + i] === newLines[newIdx + j] &&
            oldLines[oldIdx + i].trim().length > 0
          ) {
            foundOldAt = oldIdx + i;
            foundNewAt = newIdx + j;
            break outer;
          }
        }
      }

      if (foundOldAt === -1) {
        // No nearby match — treat current lines as a simple change
        chunks.push({ type: 'removed', oldLines: [oldLines[oldIdx]] });
        chunks.push({ type: 'added', newLines: [newLines[newIdx]] });
        oldIdx++;
        newIdx++;
      } else {
        // Emit the divergent spans before the matching point
        if (foundOldAt > oldIdx) {
          chunks.push({ type: 'removed', oldLines: oldLines.slice(oldIdx, foundOldAt) });
        }
        if (foundNewAt > newIdx) {
          chunks.push({ type: 'added', newLines: newLines.slice(newIdx, foundNewAt) });
        }
        oldIdx = foundOldAt;
        newIdx = foundNewAt;
      }
    }
  }

  return mergeAdjacentChunks(annotateWithSections(chunks));
}

/**
 * Walk the chunks and tag each with the markdown heading it falls under.
 */
function annotateWithSections(chunks: DiffChunk[]): DiffChunk[] {
  let currentSection = '';
  return chunks.map((chunk) => {
    const lines = chunk.lines ?? chunk.oldLines ?? chunk.newLines ?? [];
    for (const line of lines) {
      if (/^#{1,6}\s/.test(line)) {
        currentSection = line.replace(/^#{1,6}\s*/, '').trim();
      }
    }
    return { ...chunk, sectionTitle: currentSection || undefined };
  });
}

/**
 * Merge consecutive removed+added chunks into a single 'modified' chunk.
 */
function mergeAdjacentChunks(chunks: DiffChunk[]): DiffChunk[] {
  const merged: DiffChunk[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].type === 'removed' && chunks[i + 1]?.type === 'added') {
      merged.push({
        type: 'modified',
        oldLines: chunks[i].oldLines,
        newLines: chunks[i + 1].newLines,
        sectionTitle: chunks[i].sectionTitle,
      });
      i++; // skip the 'added' chunk we just merged
    } else {
      merged.push(chunks[i]);
    }
  }
  return merged;
}

/**
 * Computes aggregate statistics from a diff result.
 */
export function computeStats(
  chunks: DiffChunk[],
  _oldContent: string,
  _newContent: string
): DiffStats {
  let linesAdded = 0;
  let linesRemoved = 0;
  let linesModified = 0;
  let linesUnchanged = 0;
  const sectionsChanged = new Set<string>();

  for (const chunk of chunks) {
    if (chunk.type === 'added') {
      linesAdded += chunk.newLines?.length ?? 0;
      if (chunk.sectionTitle) sectionsChanged.add(chunk.sectionTitle);
    } else if (chunk.type === 'removed') {
      linesRemoved += chunk.oldLines?.length ?? 0;
      if (chunk.sectionTitle) sectionsChanged.add(chunk.sectionTitle);
    } else if (chunk.type === 'modified') {
      linesModified += Math.max(chunk.oldLines?.length ?? 0, chunk.newLines?.length ?? 0);
      if (chunk.sectionTitle) sectionsChanged.add(chunk.sectionTitle);
    } else {
      linesUnchanged += chunk.lines?.length ?? 0;
    }
  }

  const totalLines = linesAdded + linesRemoved + linesModified + linesUnchanged;
  const similarity = totalLines > 0 ? linesUnchanged / totalLines : 1;

  return {
    linesAdded,
    linesRemoved,
    linesModified,
    linesUnchanged,
    similarity,
    sectionsChanged: Array.from(sectionsChanged),
  };
}

/**
 * Produces a short human-readable summary of what changed.
 */
export function buildSemanticSummary(stats: DiffStats): string {
  const parts: string[] = [];

  if (stats.similarity > 0.95) {
    parts.push('Minor changes');
  } else if (stats.similarity > 0.7) {
    parts.push('Moderate revision');
  } else {
    parts.push('Significant rewrite');
  }

  if (stats.linesAdded > 0) parts.push(`${stats.linesAdded} lines added`);
  if (stats.linesRemoved > 0) parts.push(`${stats.linesRemoved} lines removed`);
  if (stats.linesModified > 0) parts.push(`${stats.linesModified} lines modified`);

  if (stats.sectionsChanged.length > 0) {
    const names = stats.sectionsChanged.slice(0, 3).join(', ');
    const extra = stats.sectionsChanged.length > 3 ? ` +${stats.sectionsChanged.length - 3} more` : '';
    parts.push(`Sections: ${names}${extra}`);
  }

  return parts.join(' · ');
}
