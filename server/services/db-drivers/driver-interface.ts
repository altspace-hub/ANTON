/**
 * driver-interface.ts
 * Common interface for all database drivers (SQL and NoSQL).
 */

export interface DbConfig {
  driver: string;
  host: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  sslVerifyCert?: boolean;
  connectionTimeout?: number;
  maxRowsPerQuery?: number;
  allowedTables?: string;
  [key: string]: unknown;
}

export interface QueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  fields?: Array<{ name: string; type: string }>;
}

export interface DatabaseDriver {
  name: string;
  displayName: string;
  defaultPort: number;

  /**
   * Test connectivity to the database.
   */
  test(config: DbConfig): Promise<{ ok: boolean; message: string }>;

  /**
   * Execute a query and return results.
   * For SQL databases: execute SQL string.
   * For NoSQL: this method may not be used (see queryDocument).
   */
  query(config: DbConfig, sql: string, params?: unknown[]): Promise<QueryResult>;

  /**
   * Create a connection pool (optional, for performance).
   * Returns a pool object that can be cached and reused.
   */
  createPool?(config: DbConfig): Promise<unknown>;

  /**
   * Close a connection pool.
   */
  closePool?(pool: unknown): Promise<void>;
}

/**
 * Extended interface for NoSQL databases (MongoDB, etc.)
 */
export interface NoSQLDriver extends Omit<DatabaseDriver, 'query'> {
  /**
   * Query documents from a collection.
   * @param config - Database configuration
   * @param collection - Collection/table name
   * @param filter - Query filter object (e.g., { status: 'active' })
   * @param options - Additional options (limit, sort, projection)
   */
  queryDocuments(
    config: DbConfig,
    collection: string,
    filter: Record<string, unknown>,
    options?: {
      limit?: number;
      skip?: number;
      sort?: Record<string, 1 | -1>;
      projection?: Record<string, 0 | 1>;
    }
  ): Promise<QueryResult>;

  /**
   * List collections in the database.
   */
  listCollections(config: DbConfig): Promise<string[]>;
}
