/**
 * Data Transformation Service
 *
 * Core engine for transforming datasets:
 * - Column operations (rename, select, reorder, convert types, add computed)
 * - Row operations (filter, sort, deduplicate)
 * - Schema inference and validation
 */

import { nanoid } from 'nanoid';

export interface Column {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'json';
  nullable: boolean;
}

export interface Dataset {
  id: string;
  columns: Column[];
  rows: Array<Record<string, any>>;
  metadata: {
    rowCount: number;
    source: string;
    importedAt: string;
  };
}

export interface FilterCondition {
  column: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'starts_with'
    | 'ends_with'
    | 'greater_than'
    | 'greater_than_or_equal'
    | 'less_than'
    | 'less_than_or_equal'
    | 'is_null'
    | 'is_not_null';
  value?: any;
}

export type TransformOperation =
  | { type: 'rename_column'; oldName: string; newName: string }
  | { type: 'select_columns'; columns: string[] }
  | { type: 'reorder_columns'; columnOrder: string[] }
  | { type: 'convert_type'; column: string; fromType: string; toType: string }
  | { type: 'filter_rows'; condition: FilterCondition }
  | { type: 'add_column'; name: string; formula: string }
  | { type: 'sort'; column: string; order: 'asc' | 'desc' }
  | { type: 'deduplicate'; keys: string[]; strategy: 'keep_first' | 'keep_last' }
  | { type: 'replace'; column: string; find: string; replace: string }
  | { type: 'trim'; columns: string[] };

/**
 * Infer schema from raw data
 */
export function inferSchema(rows: Array<Record<string, any>>): Column[] {
  if (rows.length === 0) return [];

  const columns: Column[] = [];
  const firstRow = rows[0];

  for (const [name, value] of Object.entries(firstRow)) {
    const type = inferType(value);
    const nullable = rows.some((row) => row[name] == null);
    columns.push({ name, type, nullable });
  }

  return columns;
}

/**
 * Infer data type from value
 */
function inferType(value: any): Column['type'] {
  if (value == null) return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'object') return 'json';

  // Try parsing as date
  const dateValue = new Date(value);
  if (!isNaN(dateValue.getTime()) && value.includes('-')) {
    return 'date';
  }

  // Try parsing as number
  if (!isNaN(parseFloat(value)) && isFinite(value)) {
    return 'number';
  }

  return 'string';
}

/**
 * Create dataset from raw data
 */
export function createDataset(
  rows: Array<Record<string, any>>,
  source: string
): Dataset {
  const columns = inferSchema(rows);

  return {
    id: nanoid(),
    columns,
    rows,
    metadata: {
      rowCount: rows.length,
      source,
      importedAt: new Date().toISOString(),
    },
  };
}

/**
 * Apply a single transformation operation
 */
export function applyOperation(
  dataset: Dataset,
  operation: TransformOperation
): Dataset {
  switch (operation.type) {
    case 'rename_column':
      return renameColumn(dataset, operation.oldName, operation.newName);
    case 'select_columns':
      return selectColumns(dataset, operation.columns);
    case 'reorder_columns':
      return reorderColumns(dataset, operation.columnOrder);
    case 'convert_type':
      return convertType(dataset, operation.column, operation.toType as Column['type']);
    case 'filter_rows':
      return filterRows(dataset, operation.condition);
    case 'add_column':
      return addColumn(dataset, operation.name, operation.formula);
    case 'sort':
      return sortRows(dataset, operation.column, operation.order);
    case 'deduplicate':
      return deduplicate(dataset, operation.keys, operation.strategy);
    case 'replace':
      return replaceValues(dataset, operation.column, operation.find, operation.replace);
    case 'trim':
      return trimColumns(dataset, operation.columns);
    default:
      throw new Error(`Unknown operation type: ${(operation as any).type}`);
  }
}

/**
 * Apply multiple transformation operations in sequence
 */
export function applyTransformations(
  dataset: Dataset,
  operations: TransformOperation[]
): Dataset {
  let result = dataset;
  for (const operation of operations) {
    result = applyOperation(result, operation);
  }
  return result;
}

// ==================== Column Operations ====================

/**
 * Rename a column
 */
function renameColumn(dataset: Dataset, oldName: string, newName: string): Dataset {
  const newColumns = dataset.columns.map((col) =>
    col.name === oldName ? { ...col, name: newName } : col
  );

  const newRows = dataset.rows.map((row) => {
    const newRow = { ...row };
    if (oldName in newRow) {
      newRow[newName] = newRow[oldName];
      delete newRow[oldName];
    }
    return newRow;
  });

  return {
    ...dataset,
    columns: newColumns,
    rows: newRows,
  };
}

/**
 * Select specific columns (discard others)
 */
function selectColumns(dataset: Dataset, columns: string[]): Dataset {
  const newColumns = dataset.columns.filter((col) => columns.includes(col.name));

  const newRows = dataset.rows.map((row) => {
    const newRow: Record<string, any> = {};
    for (const col of columns) {
      if (col in row) {
        newRow[col] = row[col];
      }
    }
    return newRow;
  });

  return {
    ...dataset,
    columns: newColumns,
    rows: newRows,
  };
}

/**
 * Reorder columns
 */
function reorderColumns(dataset: Dataset, columnOrder: string[]): Dataset {
  const newColumns = columnOrder
    .map((name) => dataset.columns.find((col) => col.name === name))
    .filter((col): col is Column => col !== undefined);

  // Keep column order in rows (rows are objects, order doesn't matter for access)
  return {
    ...dataset,
    columns: newColumns,
  };
}

/**
 * Convert column data type
 */
function convertType(dataset: Dataset, columnName: string, toType: Column['type']): Dataset {
  const newColumns = dataset.columns.map((col) =>
    col.name === columnName ? { ...col, type: toType } : col
  );

  const newRows = dataset.rows.map((row) => {
    const newRow = { ...row };
    if (columnName in newRow) {
      newRow[columnName] = convertValue(newRow[columnName], toType);
    }
    return newRow;
  });

  return {
    ...dataset,
    columns: newColumns,
    rows: newRows,
  };
}

/**
 * Convert a single value to target type
 */
function convertValue(value: any, toType: Column['type']): any {
  if (value == null) return null;

  switch (toType) {
    case 'string':
      return String(value);
    case 'number':
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    case 'boolean':
      return Boolean(value);
    case 'date':
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date.toISOString();
    case 'json':
      return typeof value === 'object' ? value : JSON.parse(value);
    default:
      return value;
  }
}

/**
 * Add computed column
 */
function addColumn(dataset: Dataset, name: string, formula: string): Dataset {
  // Simple formula evaluation (basic arithmetic and conditionals)
  // For MVP: support simple formulas like "amount * 1.25" or "if(amount > 1000, 'high', 'low')"
  const newColumns = [
    ...dataset.columns,
    { name, type: 'string' as const, nullable: true },
  ];

  const newRows = dataset.rows.map((row) => ({
    ...row,
    [name]: evaluateFormula(formula, row),
  }));

  return {
    ...dataset,
    columns: newColumns,
    rows: newRows,
  };
}

/**
 * Evaluate simple formula
 */
function evaluateFormula(formula: string, row: Record<string, any>): any {
  try {
    // Replace column names with values
    let expression = formula;
    for (const [key, value] of Object.entries(row)) {
      const regex = new RegExp(`\\b${key}\\b`, 'g');
      const safeValue = typeof value === 'string' ? `"${value}"` : value;
      expression = expression.replace(regex, String(safeValue));
    }

    // Handle if() function
    if (expression.startsWith('if(')) {
      const match = expression.match(/if\((.+),\s*(.+),\s*(.+)\)/);
      if (match) {
        const [, condition, trueValue, falseValue] = match;
        // eslint-disable-next-line no-eval
        const conditionResult = eval(condition);
        return conditionResult ? eval(trueValue) : eval(falseValue);
      }
    }

    // Evaluate arithmetic expression
    // eslint-disable-next-line no-eval
    return eval(expression);
  } catch (error) {
    console.error(`Formula evaluation failed: ${formula}`, error);
    return null;
  }
}

// ==================== Row Operations ====================

/**
 * Filter rows based on condition
 */
function filterRows(dataset: Dataset, condition: FilterCondition): Dataset {
  const newRows = dataset.rows.filter((row) => evaluateCondition(row, condition));

  return {
    ...dataset,
    rows: newRows,
    metadata: {
      ...dataset.metadata,
      rowCount: newRows.length,
    },
  };
}

/**
 * Evaluate filter condition
 */
function evaluateCondition(row: Record<string, any>, condition: FilterCondition): boolean {
  const value = row[condition.column];
  const compareValue = condition.value;

  switch (condition.operator) {
    case 'equals':
      return value === compareValue;
    case 'not_equals':
      return value !== compareValue;
    case 'contains':
      return String(value).includes(String(compareValue));
    case 'not_contains':
      return !String(value).includes(String(compareValue));
    case 'starts_with':
      return String(value).startsWith(String(compareValue));
    case 'ends_with':
      return String(value).endsWith(String(compareValue));
    case 'greater_than':
      return value > compareValue;
    case 'greater_than_or_equal':
      return value >= compareValue;
    case 'less_than':
      return value < compareValue;
    case 'less_than_or_equal':
      return value <= compareValue;
    case 'is_null':
      return value == null;
    case 'is_not_null':
      return value != null;
    default:
      return true;
  }
}

/**
 * Sort rows
 */
function sortRows(dataset: Dataset, column: string, order: 'asc' | 'desc'): Dataset {
  const newRows = [...dataset.rows].sort((a, b) => {
    const aVal = a[column];
    const bVal = b[column];

    if (aVal == null) return 1;
    if (bVal == null) return -1;

    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return order === 'asc' ? comparison : -comparison;
  });

  return {
    ...dataset,
    rows: newRows,
  };
}

/**
 * Deduplicate rows
 */
function deduplicate(
  dataset: Dataset,
  keys: string[],
  strategy: 'keep_first' | 'keep_last'
): Dataset {
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
}

/**
 * Replace values in a column
 */
function replaceValues(
  dataset: Dataset,
  column: string,
  find: string,
  replace: string
): Dataset {
  const newRows = dataset.rows.map((row) => {
    const newRow = { ...row };
    if (column in newRow && newRow[column] != null) {
      newRow[column] = String(newRow[column]).replace(new RegExp(find, 'g'), replace);
    }
    return newRow;
  });

  return {
    ...dataset,
    rows: newRows,
  };
}

/**
 * Trim whitespace from columns
 */
function trimColumns(dataset: Dataset, columns: string[]): Dataset {
  const newRows = dataset.rows.map((row) => {
    const newRow = { ...row };
    for (const col of columns) {
      if (col in newRow && typeof newRow[col] === 'string') {
        newRow[col] = newRow[col].trim();
      }
    }
    return newRow;
  });

  return {
    ...dataset,
    rows: newRows,
  };
}

/**
 * Get dataset preview (first N rows)
 */
export function getPreview(dataset: Dataset, limit: number = 100): Dataset {
  return {
    ...dataset,
    rows: dataset.rows.slice(0, limit),
    metadata: {
      ...dataset.metadata,
      rowCount: Math.min(limit, dataset.rows.length),
    },
  };
}

/**
 * Validate transformation operation
 */
export function validateOperation(
  dataset: Dataset,
  operation: TransformOperation
): { valid: boolean; error?: string } {
  switch (operation.type) {
    case 'rename_column':
      if (!dataset.columns.find((col) => col.name === operation.oldName)) {
        return { valid: false, error: `Column "${operation.oldName}" does not exist` };
      }
      if (dataset.columns.find((col) => col.name === operation.newName)) {
        return { valid: false, error: `Column "${operation.newName}" already exists` };
      }
      break;
    case 'select_columns':
      const missingCols = operation.columns.filter(
        (col) => !dataset.columns.find((c) => c.name === col)
      );
      if (missingCols.length > 0) {
        return {
          valid: false,
          error: `Columns do not exist: ${missingCols.join(', ')}`,
        };
      }
      break;
    case 'convert_type':
      if (!dataset.columns.find((col) => col.name === operation.column)) {
        return { valid: false, error: `Column "${operation.column}" does not exist` };
      }
      break;
    case 'filter_rows':
      if (!dataset.columns.find((col) => col.name === operation.condition.column)) {
        return {
          valid: false,
          error: `Column "${operation.condition.column}" does not exist`,
        };
      }
      break;
  }

  return { valid: true };
}
