/**
 * driver-registry.ts
 * Factory for loading database drivers on demand.
 */

import type { DatabaseDriver, NoSQLDriver } from './driver-interface.js';

// Lazy-loaded driver cache
const drivers = new Map<string, DatabaseDriver | NoSQLDriver>();

/**
 * Get a database driver by name.
 * Drivers are lazy-loaded on first use.
 */
export async function getDriver(driverName: string): Promise<DatabaseDriver | NoSQLDriver> {
  if (!SUPPORTED_DRIVERS.includes(driverName as SupportedDriver)) {
    throw new Error(`Unsupported driver: ${driverName}. Supported: ${SUPPORTED_DRIVERS.join(', ')}`);
  }

  if (!drivers.has(driverName)) {
    try {
      const module = await import(`./${driverName}-driver.js`);
      drivers.set(driverName, module.default);
    } catch (err) {
      console.error(`[driver-registry] Failed to load driver "${driverName}":`, err);
      throw new Error(`Driver "${driverName}" not available. Install required package.`);
    }
  }

  return drivers.get(driverName)!;
}

/**
 * Check if a driver is a NoSQL driver.
 */
export function isNoSQLDriver(driver: DatabaseDriver | NoSQLDriver): driver is NoSQLDriver {
  return 'queryDocuments' in driver;
}

/**
 * List of all supported database drivers.
 */
export const SUPPORTED_DRIVERS = [
  'sqlite',
  'postgresql',
  'mysql',
  'mssql',
  'mongodb',
] as const;

export type SupportedDriver = typeof SUPPORTED_DRIVERS[number];

/**
 * Driver metadata for UI display.
 */
export const DRIVER_METADATA: Record<SupportedDriver, {
  displayName: string;
  defaultPort: number;
  category: 'sql' | 'nosql';
  packageName: string;
  description: string;
}> = {
  sqlite: {
    displayName: 'SQLite',
    defaultPort: 0,
    category: 'sql',
    packageName: 'better-sqlite3',
    description: 'Embedded SQL database (local file)',
  },
  postgresql: {
    displayName: 'PostgreSQL',
    defaultPort: 5432,
    category: 'sql',
    packageName: 'pg',
    description: 'Advanced open-source relational database',
  },
  mysql: {
    displayName: 'MySQL / MariaDB',
    defaultPort: 3306,
    category: 'sql',
    packageName: 'mysql2',
    description: 'Popular open-source relational database',
  },
  mssql: {
    displayName: 'Microsoft SQL Server',
    defaultPort: 1433,
    category: 'sql',
    packageName: 'mssql',
    description: 'Microsoft SQL Server / Azure SQL',
  },
  mongodb: {
    displayName: 'MongoDB',
    defaultPort: 27017,
    category: 'nosql',
    packageName: 'mongodb',
    description: 'Document-oriented NoSQL database',
  },
};
