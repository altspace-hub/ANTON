/**
 * Data Importer/Exporter Service
 *
 * Import data from various sources:
 * - CSV files
 * - Excel files (.xlsx)
 * - JSON files
 * - Database queries (via ConnectionManager)
 *
 * Export data to various formats:
 * - CSV
 * - Excel with formatting
 * - JSON
 * - Database insert
 */

import fs from 'fs-extra';
import path from 'path';
import { parse as parseCSV } from 'csv-parse/sync';
import { stringify as stringifyCSV } from 'csv-stringify/sync';
import xlsx from 'xlsx';
import ExcelJS from 'exceljs';
import { Dataset, createDataset } from './data-transformer.js';
import type { DatabaseAdapter } from '../db/database.js';
import { assertSqlIdentifier } from '../lib/sql-identifier.js';
import { createConnectionManager } from './connection-manager.js';
import { getDriver, isNoSQLDriver } from './db-drivers/driver-registry.js';
import type { DbConfig } from './db-drivers/driver-interface.js';
import { resolveExplicitDbDriver } from './workflow-step-registry.js';
import { assertQueryPermitted, assertTablesAllowed, resolveMaxRows } from './connection-guard.js';

// ==================== Import Operations ====================

export interface ImportConfig {
  source: 'file' | 'database' | 'api';

  // File source
  filePath?: string;
  fileType?: 'csv' | 'excel' | 'json';
  sheetName?: string; // For Excel
  delimiter?: string; // For CSV (default: ',')
  hasHeader?: boolean; // CSV/Excel has header row (default: true)

  // Database source — always an EXTERNAL configured connection, never ANTON's own DB.
  connectionId?: string;
  query?: string;
  /**
   * ANTON's own database handle, used ONLY to look the connection up in `connections`.
   *
   * DO NOT run `query` through this. It used to be exactly that (`config.db.all(config.query)`
   * with `config.db = db` injected by POST /api/data/import), which handed a request body
   * arbitrary SQL — stacked statements included, since a query with no bind values goes
   * over pg's simple protocol — against ANTON's own tables. See importFromDatabase.
   */
  db?: DatabaseAdapter;

  // Common
  preview?: boolean; // Return first 100 rows only
}

/**
 * Import data from configured source
 */
export async function importData(config: ImportConfig): Promise<Dataset> {
  switch (config.source) {
    case 'file':
      return await importFromFile(config);
    case 'database':
      return await importFromDatabase(config);
    case 'api':
      throw new Error('API import not yet implemented');
    default:
      throw new Error(`Unknown source type: ${config.source}`);
  }
}

/**
 * Import from file (CSV, Excel, JSON)
 */
async function importFromFile(config: ImportConfig): Promise<Dataset> {
  if (!config.filePath) {
    throw new Error('filePath is required for file import');
  }

  const fileType = config.fileType || detectFileType(config.filePath);

  let rows: Array<Record<string, any>> = [];

  switch (fileType) {
    case 'csv':
      rows = await importCSV(
        config.filePath,
        config.delimiter || ',',
        config.hasHeader !== false
      );
      break;
    case 'excel':
      rows = await importExcel(config.filePath, config.sheetName, config.hasHeader !== false);
      break;
    case 'json':
      rows = await importJSON(config.filePath);
      break;
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }

  if (config.preview) {
    rows = rows.slice(0, 100);
  }

  return createDataset(rows, `file:${path.basename(config.filePath)}`);
}

/**
 * Import CSV file
 */
async function importCSV(
  filePath: string,
  delimiter: string,
  hasHeader: boolean
): Promise<Array<Record<string, any>>> {
  const content = await fs.readFile(filePath, 'utf-8');

  const records = parseCSV(content, {
    delimiter,
    columns: hasHeader, // If true, use first row as column names
    skip_empty_lines: true,
    trim: true,
  });

  return records as Array<Record<string, any>>;
}

/**
 * Import Excel file
 */
async function importExcel(
  filePath: string,
  sheetName?: string,
  hasHeader: boolean = true
): Promise<Array<Record<string, any>>> {
  const workbook = xlsx.readFile(filePath);

  const sheet = sheetName
    ? workbook.Sheets[sheetName]
    : workbook.Sheets[workbook.SheetNames[0]];

  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName || workbook.SheetNames[0]}`);
  }

  const jsonData = xlsx.utils.sheet_to_json(sheet, {
    header: hasHeader ? undefined : 1, // If no header, use numeric column names
    defval: null, // Default value for empty cells
  });

  return jsonData as Array<Record<string, any>>;
}

/**
 * Import JSON file
 */
async function importJSON(filePath: string): Promise<Array<Record<string, any>>> {
  const content = await fs.readFile(filePath, 'utf-8');
  const data = JSON.parse(content);

  if (Array.isArray(data)) {
    return data;
  } else if (typeof data === 'object' && data !== null) {
    // Single object - wrap in array
    return [data];
  } else {
    throw new Error('JSON file must contain an array or object');
  }
}

/**
 * Import from a database.
 *
 * The query runs against the EXTERNAL database the user configured as a connection —
 * which is what the step's own UI asks for ("Database Connection", listing
 * `connections` of type `database`, plus a SQL query box). The server used to ignore
 * `connectionId` entirely and run the query through ANTON's own DatabaseAdapter, so an
 * unauthenticated POST to /api/data/import could read or modify any ANTON table, and
 * could stack statements (no bind values ⇒ pg simple protocol ⇒ multi-statement).
 *
 * Same guards as the `database_query` workflow step, for the same reason: the query text
 * is caller- or template-supplied, so it is scoped before any driver sees it.
 */
async function importFromDatabase(config: ImportConfig): Promise<Dataset> {
  if (!config.query) {
    throw new Error('query is required for database import');
  }

  if (!config.connectionId) {
    throw new Error(
      'connectionId is required for database import — choose a configured database connection. ' +
      "ANTON's own application database is not a queryable import source."
    );
  }

  if (!config.db) {
    throw new Error('Database connection required');
  }

  const manager = await createConnectionManager(config.db);
  const conn = await manager.get(config.connectionId);
  if (!conn) {
    throw new Error(`Connection not found: ${config.connectionId}`);
  }
  if (conn.type !== 'database') {
    throw new Error(`Connection ${config.connectionId} is not a database connection`);
  }

  const cfg = conn.config as Record<string, unknown>;
  // Driver must be explicit on the connection — never silently default to sqlite.
  const driverName = resolveExplicitDbDriver(cfg);

  // Read-only unless the connection was granted 'write', single statement only, and
  // restricted to the connection's allowed_tables. These throw ConnectionGuardError.
  assertQueryPermitted(conn.permissions, config.query);
  assertTablesAllowed(cfg, config.query);

  const driver = await getDriver(driverName);
  if (isNoSQLDriver(driver)) {
    throw new Error(`Driver "${driverName}" does not support SQL queries`);
  }

  const maxRows = resolveMaxRows(cfg);

  try {
    const result = await driver.query(cfg as unknown as DbConfig, config.query);
    const limit = config.preview ? Math.min(100, maxRows) : maxRows;
    const rows = result.rows.slice(0, limit) as Array<Record<string, any>>;
    return createDataset(rows, `db:${conn.display_name}`);
  } catch (error) {
    throw new Error(`Database query failed: ${(error as Error).message}`);
  }
}

/**
 * Detect file type from extension
 */
function detectFileType(filePath: string): 'csv' | 'excel' | 'json' {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.csv':
      return 'csv';
    case '.xlsx':
    case '.xls':
      return 'excel';
    case '.json':
      return 'json';
    default:
      throw new Error(`Cannot detect file type from extension: ${ext}`);
  }
}

// ==================== Export Operations ====================

export interface ExportConfig {
  destination: 'file' | 'database' | 'api';

  // File export
  filePath?: string;
  fileType?: 'csv' | 'excel' | 'json';
  excelOptions?: ExcelExportOptions;

  // Database export
  db?: DatabaseAdapter;
  tableName?: string;
  insertMode?: 'insert' | 'upsert' | 'replace';

  // Common
  overwrite?: boolean; // Overwrite existing file (default: false)
}

export interface ExcelExportOptions {
  sheetName?: string;
  autoFilter?: boolean;
  freezeHeader?: boolean;
  conditionalFormatting?: Array<{
    column: string;
    rules: Array<{
      type: 'dataBar' | 'colorScale' | 'iconSet';
      priority?: number;
    }>;
  }>;
}

/**
 * Export dataset to configured destination
 */
export async function exportData(dataset: Dataset, config: ExportConfig): Promise<string> {
  switch (config.destination) {
    case 'file':
      return await exportToFile(dataset, config);
    case 'database':
      return await exportToDatabase(dataset, config);
    case 'api':
      throw new Error('API export not yet implemented');
    default:
      throw new Error(`Unknown destination type: ${config.destination}`);
  }
}

/**
 * Export to file (CSV, Excel, JSON)
 */
async function exportToFile(dataset: Dataset, config: ExportConfig): Promise<string> {
  if (!config.filePath) {
    throw new Error('filePath is required for file export');
  }

  const fileType = config.fileType || detectFileType(config.filePath);

  // Check if file exists
  if (!config.overwrite && (await fs.pathExists(config.filePath))) {
    throw new Error(`File already exists: ${config.filePath}`);
  }

  // Ensure directory exists
  await fs.ensureDir(path.dirname(config.filePath));

  switch (fileType) {
    case 'csv':
      await exportCSV(dataset, config.filePath);
      break;
    case 'excel':
      await exportExcel(dataset, config.filePath, config.excelOptions);
      break;
    case 'json':
      await exportJSON(dataset, config.filePath);
      break;
    default:
      throw new Error(`Unsupported file type: ${fileType}`);
  }

  return config.filePath;
}

/**
 * Export to CSV
 */
async function exportCSV(dataset: Dataset, filePath: string): Promise<void> {
  const csv = stringifyCSV(dataset.rows, {
    header: true,
    columns: dataset.columns.map((col) => col.name),
  });

  await fs.writeFile(filePath, csv, 'utf-8');
}

/**
 * Export to Excel with formatting
 */
async function exportExcel(
  dataset: Dataset,
  filePath: string,
  options?: ExcelExportOptions
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(options?.sheetName || 'Data');

  // Add headers
  worksheet.columns = dataset.columns.map((col) => ({
    header: col.name,
    key: col.name,
    width: 15,
  }));

  // Add rows
  worksheet.addRows(dataset.rows);

  // Apply formatting
  if (options?.autoFilter) {
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: dataset.columns.length },
    };
  }

  if (options?.freezeHeader) {
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  }

  // Style header row
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  };

  // Apply conditional formatting if specified
  // Note: Conditional formatting temporarily disabled for MVP
  // ExcelJS API for conditional formatting requires more complex setup
  // if (options?.conditionalFormatting) {
  //   // TODO: Implement conditional formatting with correct ExcelJS API
  // }

  await workbook.xlsx.writeFile(filePath);
}

/**
 * Export to JSON
 */
async function exportJSON(dataset: Dataset, filePath: string): Promise<void> {
  const json = JSON.stringify(dataset.rows, null, 2);
  await fs.writeFile(filePath, json, 'utf-8');
}

/**
 * Export to database
 */
async function exportToDatabase(dataset: Dataset, config: ExportConfig): Promise<string> {
  if (!config.db || !config.tableName) {
    throw new Error('Database connection and table name required');
  }

  const insertMode = config.insertMode || 'insert';

  // The table name comes from the request body and the column names from a CSV header
  // row, and both are concatenated into SQL below (identifiers cannot be bound). Check
  // them first: a header of `x); DROP TABLE users; --` otherwise became a second
  // statement, which pg executes because these strings reach it via the simple protocol.
  //
  // Validated but NOT quoted, deliberately: this writes into a table someone else
  // created, so wrapping the names in double quotes would change an unquoted (and
  // therefore case-folded) `MyTable` into a different object and break a working export.
  const tableName = assertSqlIdentifier(config.tableName, 'table name');
  const columns = dataset.columns.map((col) => assertSqlIdentifier(col.name, 'column name'));

  try {
    const placeholders = columns.map(() => '?').join(', ');

    let sql: string;
    if (insertMode === 'insert') {
      sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    } else if (insertMode === 'replace' || insertMode === 'upsert') {
      // Upsert: insert or update all columns on conflict with the first column (assumed primary key)
      const updateCols = columns.slice(1).map(c => `${c} = EXCLUDED.${c}`).join(', ');
      sql = updateCols
        ? `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (${columns[0]}) DO UPDATE SET ${updateCols}`
        : `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT (${columns[0]}) DO NOTHING`;
    } else {
      sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    }

    // Insert rows — read each value by the dataset's own column name, which is what the
    // rows are keyed by (identifier validation above constrains the SQL, not the data).
    for (const row of dataset.rows) {
      const values = dataset.columns.map((col) => row[col.name]);
      await config.db.run(sql, ...values);
    }

    return `Inserted ${dataset.rows.length} rows into ${tableName}`;
  } catch (error) {
    throw new Error(`Database insert failed: ${(error as Error).message}`);
  }
}

/**
 * Get sample data for preview
 */
export function getSampleRows(dataset: Dataset, count: number = 5): Array<Record<string, any>> {
  return dataset.rows.slice(0, count);
}
