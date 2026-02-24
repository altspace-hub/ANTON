/**
 * Data Merger Service
 *
 * Merge logic for combining multiple datasets:
 * - Join operations (inner, left, right, full outer)
 * - Union (vertical stack)
 * - Concat (horizontal concatenation)
 * - Deduplication strategies
 */

import { Dataset, Column } from './data-transformer.js';
import { nanoid } from 'nanoid';

export interface MergeConfig {
  mergeType: 'join' | 'union' | 'concat';

  // Join configuration
  joinType?: 'inner' | 'left' | 'right' | 'full';
  leftKey?: string;
  rightKey?: string;
  columnConflictResolution?: Record<string, 'left' | 'right' | 'merge'>; // For duplicate column names

  // Union configuration
  columnMapping?: Record<string, string>; // Map right column names to left

  // Deduplication
  deduplicateBy?: string[];
  deduplicateStrategy?: 'keep_first' | 'keep_last' | 'merge_values';
}

/**
 * Merge two datasets according to configuration
 */
export function mergeDatasets(
  left: Dataset,
  right: Dataset,
  config: MergeConfig
): Dataset {
  switch (config.mergeType) {
    case 'join':
      return joinDatasets(
        left,
        right,
        config.joinType || 'inner',
        config.leftKey!,
        config.rightKey!,
        config.columnConflictResolution
      );
    case 'union':
      return unionDatasets(left, right, config.columnMapping);
    case 'concat':
      return concatDatasets(left, right);
    default:
      throw new Error(`Unknown merge type: ${config.mergeType}`);
  }
}

// ==================== Join Operations ====================

/**
 * Join two datasets by matching keys
 */
function joinDatasets(
  left: Dataset,
  right: Dataset,
  joinType: 'inner' | 'left' | 'right' | 'full',
  leftKey: string,
  rightKey: string,
  columnConflictResolution?: Record<string, 'left' | 'right' | 'merge'>
): Dataset {
  // Build index on right dataset for faster lookup
  const rightIndex = new Map<any, Array<Record<string, any>>>();
  for (const rightRow of right.rows) {
    const key = rightRow[rightKey];
    if (!rightIndex.has(key)) {
      rightIndex.set(key, []);
    }
    rightIndex.get(key)!.push(rightRow);
  }

  const mergedRows: Array<Record<string, any>> = [];
  const matchedRightKeys = new Set<any>();

  // Process left dataset
  for (const leftRow of left.rows) {
    const key = leftRow[leftKey];
    const rightMatches = rightIndex.get(key) || [];

    if (rightMatches.length > 0) {
      // Match found
      for (const rightRow of rightMatches) {
        mergedRows.push(
          mergeRows(leftRow, rightRow, left.columns, right.columns, columnConflictResolution)
        );
        matchedRightKeys.add(key);
      }
    } else if (joinType === 'left' || joinType === 'full') {
      // No match, but left join or full join → include left row with nulls for right columns
      mergedRows.push(
        mergeRows(leftRow, null, left.columns, right.columns, columnConflictResolution)
      );
    }
  }

  // Process unmatched right rows (for right join or full join)
  if (joinType === 'right' || joinType === 'full') {
    for (const rightRow of right.rows) {
      const key = rightRow[rightKey];
      if (!matchedRightKeys.has(key)) {
        mergedRows.push(
          mergeRows(null, rightRow, left.columns, right.columns, columnConflictResolution)
        );
      }
    }
  }

  // Merge column schemas
  const mergedColumns = mergeColumnSchemas(
    left.columns,
    right.columns,
    columnConflictResolution
  );

  return {
    id: nanoid(),
    columns: mergedColumns,
    rows: mergedRows,
    metadata: {
      rowCount: mergedRows.length,
      source: `${left.metadata.source} JOIN ${right.metadata.source}`,
      importedAt: new Date().toISOString(),
    },
  };
}

/**
 * Merge two rows (one from left, one from right)
 */
function mergeRows(
  leftRow: Record<string, any> | null,
  rightRow: Record<string, any> | null,
  leftColumns: Column[],
  rightColumns: Column[],
  columnConflictResolution?: Record<string, 'left' | 'right' | 'merge'>
): Record<string, any> {
  const merged: Record<string, any> = {};

  // Add left row columns
  if (leftRow) {
    for (const col of leftColumns) {
      merged[col.name] = leftRow[col.name];
    }
  } else {
    // Null-fill left columns
    for (const col of leftColumns) {
      merged[col.name] = null;
    }
  }

  // Add right row columns (handle conflicts)
  if (rightRow) {
    for (const col of rightColumns) {
      const colName = col.name;

      // Check for column name conflict
      if (merged.hasOwnProperty(colName)) {
        const resolution = columnConflictResolution?.[colName] || 'right';

        if (resolution === 'right') {
          merged[colName] = rightRow[colName];
        } else if (resolution === 'left') {
          // Keep left value (already set)
        } else if (resolution === 'merge') {
          // Merge strategy: concatenate non-null values
          const leftValue = merged[colName];
          const rightValue = rightRow[colName];
          if (leftValue != null && rightValue != null) {
            merged[colName] = `${leftValue}; ${rightValue}`;
          } else {
            merged[colName] = leftValue ?? rightValue;
          }
        }
      } else {
        // No conflict, add column
        merged[colName] = rightRow[colName];
      }
    }
  } else {
    // Null-fill right columns
    for (const col of rightColumns) {
      if (!merged.hasOwnProperty(col.name)) {
        merged[col.name] = null;
      }
    }
  }

  return merged;
}

/**
 * Merge column schemas from left and right datasets
 */
function mergeColumnSchemas(
  leftColumns: Column[],
  rightColumns: Column[],
  columnConflictResolution?: Record<string, 'left' | 'right' | 'merge'>
): Column[] {
  const merged: Column[] = [...leftColumns];
  const existingNames = new Set(leftColumns.map((col) => col.name));

  for (const rightCol of rightColumns) {
    if (!existingNames.has(rightCol.name)) {
      merged.push(rightCol);
    } else {
      // Column exists in both - check resolution
      const resolution = columnConflictResolution?.[rightCol.name] || 'right';
      if (resolution === 'right' || resolution === 'merge') {
        // Update column definition (merge makes it nullable)
        const index = merged.findIndex((col) => col.name === rightCol.name);
        if (index !== -1) {
          merged[index] = {
            ...rightCol,
            nullable: resolution === 'merge' ? true : rightCol.nullable,
          };
        }
      }
    }
  }

  return merged;
}

// ==================== Union Operation ====================

/**
 * Union two datasets (vertical stack)
 * Requires matching column schemas or column mapping
 */
function unionDatasets(
  left: Dataset,
  right: Dataset,
  columnMapping?: Record<string, string>
): Dataset {
  // Apply column mapping to right dataset if provided
  const mappedRightRows = right.rows.map((row) => {
    if (!columnMapping) return row;

    const mappedRow: Record<string, any> = {};
    for (const [rightCol, leftCol] of Object.entries(columnMapping)) {
      if (rightCol in row) {
        mappedRow[leftCol] = row[rightCol];
      }
    }

    // Include columns not in mapping
    for (const [key, value] of Object.entries(row)) {
      if (!columnMapping.hasOwnProperty(key)) {
        mappedRow[key] = value;
      }
    }

    return mappedRow;
  });

  // Merge rows
  const mergedRows = [...left.rows, ...mappedRightRows];

  // Use left column schema (right is mapped to match)
  return {
    id: nanoid(),
    columns: left.columns,
    rows: mergedRows,
    metadata: {
      rowCount: mergedRows.length,
      source: `${left.metadata.source} UNION ${right.metadata.source}`,
      importedAt: new Date().toISOString(),
    },
  };
}

// ==================== Concat Operation ====================

/**
 * Concatenate datasets horizontally (add columns from right to left)
 * Requires same row count
 */
function concatDatasets(left: Dataset, right: Dataset): Dataset {
  if (left.rows.length !== right.rows.length) {
    throw new Error(
      `Concat requires same row count. Left: ${left.rows.length}, Right: ${right.rows.length}`
    );
  }

  const mergedRows = left.rows.map((leftRow, index) => ({
    ...leftRow,
    ...right.rows[index],
  }));

  // Merge column schemas (check for duplicates)
  const existingNames = new Set(left.columns.map((col) => col.name));
  const rightColumnsRenamed = right.columns.map((col) => {
    if (existingNames.has(col.name)) {
      // Rename to avoid conflict
      return { ...col, name: `${col.name}_right` };
    }
    return col;
  });

  const mergedColumns = [...left.columns, ...rightColumnsRenamed];

  return {
    id: nanoid(),
    columns: mergedColumns,
    rows: mergedRows,
    metadata: {
      rowCount: mergedRows.length,
      source: `${left.metadata.source} CONCAT ${right.metadata.source}`,
      importedAt: new Date().toISOString(),
    },
  };
}

// ==================== Deduplication ====================

/**
 * Deduplicate merged dataset
 */
export function deduplicateDataset(
  dataset: Dataset,
  keys: string[],
  strategy: 'keep_first' | 'keep_last' | 'merge_values'
): Dataset {
  if (strategy === 'keep_first' || strategy === 'keep_last') {
    // Simple deduplication
    const seen = new Set<string>();
    const newRows: Array<Record<string, any>> = [];

    const rows = strategy === 'keep_last' ? [...dataset.rows].reverse() : dataset.rows;

    for (const row of rows) {
      const key = keys.map((k) => row[k]).join('|');
      if (!seen.has(key)) {
        seen.add(key);
        newRows.push(row);
      }
    }

    const finalRows = strategy === 'keep_last' ? newRows.reverse() : newRows;

    return {
      ...dataset,
      rows: finalRows,
      metadata: {
        ...dataset.metadata,
        rowCount: finalRows.length,
      },
    };
  } else {
    // Merge values from duplicates
    const grouped = new Map<string, Array<Record<string, any>>>();

    for (const row of dataset.rows) {
      const key = keys.map((k) => row[k]).join('|');
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(row);
    }

    const mergedRows: Array<Record<string, any>> = [];

    for (const rows of grouped.values()) {
      if (rows.length === 1) {
        mergedRows.push(rows[0]);
      } else {
        // Merge multiple rows
        const merged: Record<string, any> = { ...rows[0] };

        for (const col of dataset.columns) {
          if (!keys.includes(col.name)) {
            // For non-key columns, merge values
            const values = rows
              .map((r) => r[col.name])
              .filter((v) => v != null && v !== '');

            if (values.length > 1) {
              // Multiple distinct values - concatenate
              merged[col.name] = [...new Set(values)].join('; ');
            } else if (values.length === 1) {
              merged[col.name] = values[0];
            }
          }
        }

        mergedRows.push(merged);
      }
    }

    return {
      ...dataset,
      rows: mergedRows,
      metadata: {
        ...dataset.metadata,
        rowCount: mergedRows.length,
      },
    };
  }
}

/**
 * Validate merge configuration
 */
export function validateMergeConfig(
  left: Dataset,
  right: Dataset,
  config: MergeConfig
): { valid: boolean; error?: string } {
  if (config.mergeType === 'join') {
    if (!config.leftKey) {
      return { valid: false, error: 'Left join key is required' };
    }
    if (!config.rightKey) {
      return { valid: false, error: 'Right join key is required' };
    }
    if (!left.columns.find((col) => col.name === config.leftKey)) {
      return { valid: false, error: `Left key "${config.leftKey}" does not exist` };
    }
    if (!right.columns.find((col) => col.name === config.rightKey)) {
      return { valid: false, error: `Right key "${config.rightKey}" does not exist` };
    }
  }

  if (config.mergeType === 'union') {
    // Check if column mapping covers all right columns
    if (config.columnMapping) {
      const mappedCols = new Set(Object.values(config.columnMapping));
      for (const leftCol of left.columns) {
        if (!mappedCols.has(leftCol.name) && !left.columns.find((c) => c.name === leftCol.name)) {
          // This is okay - left columns not in mapping are kept as-is
        }
      }
    }
  }

  if (config.mergeType === 'concat') {
    if (left.rows.length !== right.rows.length) {
      return {
        valid: false,
        error: `Concat requires same row count. Left: ${left.rows.length}, Right: ${right.rows.length}`,
      };
    }
  }

  return { valid: true };
}

/**
 * Preview merge result (first N rows)
 */
export function previewMerge(
  left: Dataset,
  right: Dataset,
  config: MergeConfig,
  limit: number = 100
): Dataset {
  const merged = mergeDatasets(left, right, config);
  return {
    ...merged,
    rows: merged.rows.slice(0, limit),
    metadata: {
      ...merged.metadata,
      rowCount: Math.min(limit, merged.rows.length),
    },
  };
}
