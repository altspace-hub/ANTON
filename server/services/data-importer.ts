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
import Database from 'better-sqlite3';

// ==================== Import Operations ====================

export interface ImportConfig {
  source: 'file' | 'database' | 'api';

  // File source
  filePath?: string;
  fileType?: 'csv' | 'excel' | 'json';
  sheetName?: string; // For Excel
  delimiter?: string; // For CSV (default: ',')
  hasHeader?: boolean; // CSV/Excel has header row (default: true)

  // Database source
  connectionId?: string;
  query?: string;
  db?: Database.Database; // Direct DB instance (for testing)

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
 * Import from database
 */
async function importFromDatabase(config: ImportConfig): Promise<Dataset> {
  if (!config.query) {
    throw new Error('query is required for database import');
  }

  if (!config.db) {
    throw new Error('Database connection required');
  }

  try {
    const stmt = config.db.prepare(config.query);
    const rows = stmt.all() as Array<Record<string, any>>;

    if (config.preview) {
      return createDataset(rows.slice(0, 100), `db:query`);
    }

    return createDataset(rows, `db:query`);
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
  db?: Database.Database;
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

  try {
    const columns = dataset.columns.map((col) => col.name);
    const placeholders = columns.map(() => '?').join(', ');

    let sql: string;
    if (insertMode === 'insert') {
      sql = `INSERT INTO ${config.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    } else if (insertMode === 'replace') {
      sql = `REPLACE INTO ${config.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    } else {
      // Upsert - use INSERT OR REPLACE for SQLite
      sql = `INSERT OR REPLACE INTO ${config.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    }

    const stmt = config.db.prepare(sql);

    // Insert rows in transaction
    const insertMany = config.db.transaction((rows: Array<Record<string, any>>) => {
      for (const row of rows) {
        const values = columns.map((col) => row[col]);
        stmt.run(...values);
      }
    });

    insertMany(dataset.rows);

    return `Inserted ${dataset.rows.length} rows into ${config.tableName}`;
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
