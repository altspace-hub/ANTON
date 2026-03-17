# PostgreSQL-Specific Migrations

This directory contains migration files that are specific to the PostgreSQL database backend.

## Purpose

Some features require different SQL implementations between SQLite and PostgreSQL. For example:
- **Full-text search**: SQLite uses FTS5 virtual tables; PostgreSQL uses `tsvector` columns with GIN indexes.
- **Generated columns / triggers**: Syntax differs between engines.
- **Extensions**: PostgreSQL extensions like `pgcrypto` or `pg_trgm` have no SQLite equivalent.

## Naming Convention

Files follow the same numeric prefix convention as `server/db/migrations/`:

```
039_knowledge_atoms_fts_pg.sql   -- PG equivalent of 039_knowledge_atoms_fts5.sql
```

The `_pg` suffix distinguishes these from the generic (SQLite) migration files.

## How They Are Applied

The `run-migrations-pg.ts` runner:
1. Checks this directory first for PG-specific overrides.
2. Falls back to the generic `server/db/migrations/` directory for cross-engine SQL.
3. Skips any migration containing SQLite-only syntax (`PRAGMA`, `fts5`, `AUTOINCREMENT` in `CREATE`).
4. Records each applied migration in the `schema_migrations` table.

## Adding a New PG Migration

1. Create a `.sql` file here with the appropriate numeric prefix.
2. If it replaces a generic migration, use the same prefix number with a `_pg` suffix.
3. The runner will pick it up automatically on the next server start.
