-- PG-only migration. See migrations-pg/056_markets_pg_optimizations.sql
-- SQLite uses TEXT for JSON and REAL for numbers — no conversion needed.
SELECT 1;
