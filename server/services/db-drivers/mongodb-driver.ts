/**
 * mongodb-driver.ts
 * MongoDB database driver using mongodb.
 */

import type { NoSQLDriver, DbConfig, QueryResult } from './driver-interface.js';

const driver: NoSQLDriver = {
  name: 'mongodb',
  displayName: 'MongoDB',
  defaultPort: 27017,

  async test(config: DbConfig): Promise<{ ok: boolean; message: string }> {
    try {
      const { MongoClient } = await import('mongodb');

      const uri = buildMongoUri(config);
      const client = new MongoClient(uri, {
        serverSelectionTimeoutMS: (config.connectionTimeout || 10) * 1000,
        tls: config.ssl,
        tlsAllowInvalidCertificates: config.sslVerifyCert === false,
      });

      await client.connect();
      await client.db(config.database).admin().ping();
      await client.close();

      return { ok: true, message: `MongoDB connection successful: ${config.host}:${config.port || 27017}` };
    } catch (err: unknown) {
      const error = err as Error;
      return { ok: false, message: error.message };
    }
  },

  async queryDocuments(
    config: DbConfig,
    collection: string,
    filter: Record<string, unknown>,
    options?: {
      limit?: number;
      skip?: number;
      sort?: Record<string, 1 | -1>;
      projection?: Record<string, 0 | 1>;
    }
  ): Promise<QueryResult> {
    const { MongoClient } = await import('mongodb');

    const uri = buildMongoUri(config);
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: (config.connectionTimeout || 10) * 1000,
      tls: config.ssl,
      tlsAllowInvalidCertificates: config.sslVerifyCert === false,
    });

    await client.connect();

    try {
      const db = client.db(config.database);
      const coll = db.collection(collection);

      let cursor = coll.find(filter);

      if (options?.projection) cursor = cursor.project(options.projection);
      if (options?.sort) cursor = cursor.sort(options.sort);
      if (options?.skip) cursor = cursor.skip(options.skip);
      if (options?.limit) cursor = cursor.limit(options.limit);

      const documents = await cursor.toArray();

      // Convert MongoDB _id to string for consistency
      const rows = documents.map(doc => ({
        ...doc,
        _id: doc._id?.toString(),
      }));

      return {
        rows: rows as Array<Record<string, unknown>>,
        rowCount: rows.length,
        fields: rows.length > 0
          ? Object.keys(rows[0]).map(name => ({ name, type: 'document' }))
          : [],
      };
    } finally {
      await client.close();
    }
  },

  async listCollections(config: DbConfig): Promise<string[]> {
    const { MongoClient } = await import('mongodb');

    const uri = buildMongoUri(config);
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: (config.connectionTimeout || 10) * 1000,
      tls: config.ssl,
      tlsAllowInvalidCertificates: config.sslVerifyCert === false,
    });

    await client.connect();

    try {
      const db = client.db(config.database);
      const collections = await db.listCollections().toArray();
      return collections.map(c => c.name);
    } finally {
      await client.close();
    }
  },

  async createPool(config: DbConfig): Promise<unknown> {
    const { MongoClient } = await import('mongodb');

    const uri = buildMongoUri(config);
    const client = new MongoClient(uri, {
      serverSelectionTimeoutMS: (config.connectionTimeout || 10) * 1000,
      tls: config.ssl,
      tlsAllowInvalidCertificates: config.sslVerifyCert === false,
      maxPoolSize: 10,
      minPoolSize: 0,
    });

    await client.connect();
    return client;
  },

  async closePool(pool: unknown): Promise<void> {
    const client = pool as { close: () => Promise<void> };
    await client.close();
  },
};

/**
 * Build MongoDB connection URI from config.
 */
function buildMongoUri(config: DbConfig): string {
  const host = config.host || 'localhost';
  const port = config.port || 27017;
  const username = config.username;
  const password = config.password;
  const database = config.database || 'admin';

  if (username && password) {
    return `mongodb://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }

  return `mongodb://${host}:${port}/${database}`;
}

export default driver;
