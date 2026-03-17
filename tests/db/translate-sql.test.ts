import { describe, it, expect } from 'vitest';
import { translateSql, convertPlaceholders } from '../../server/db/adapters/postgresql-adapter.js';

describe('translateSql', () => {
  it('converts datetime("now") to NOW()', () => {
    const input = "SELECT * FROM sessions WHERE created_at > datetime('now')";
    expect(translateSql(input)).toContain('NOW()');
    expect(translateSql(input)).not.toContain("datetime('now')");
  });

  it('converts datetime("now", "-7 days") to interval', () => {
    const input = "SELECT * FROM sessions WHERE created_at > datetime('now', '-7 days')";
    const result = translateSql(input);
    expect(result).toContain("NOW() - INTERVAL '7 days'");
  });

  it('converts INSERT OR IGNORE to ON CONFLICT DO NOTHING', () => {
    const input = 'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)';
    const result = translateSql(input);
    expect(result).toContain('INSERT INTO');
    expect(result).toContain('ON CONFLICT DO NOTHING');
    expect(result).not.toContain('OR IGNORE');
  });

  it('converts strftime(%Y-%m-%d) to TO_CHAR', () => {
    const input = "SELECT strftime('%Y-%m-%d', created_at) as day FROM sessions";
    const result = translateSql(input);
    expect(result).toContain("TO_CHAR(created_at, 'YYYY-MM-DD')");
  });

  it('converts strftime(%Y-%m) to TO_CHAR', () => {
    const input = "strftime('%Y-%m', 'now')";
    const result = translateSql(input);
    expect(result).toContain("TO_CHAR('now', 'YYYY-MM')");
  });

  it('converts strftime(%Y-%W) to TO_CHAR with IYYY-IW', () => {
    const input = "strftime('%Y-%W', created_at)";
    const result = translateSql(input);
    expect(result).toContain("TO_CHAR(created_at, 'IYYY-IW')");
  });

  it('converts json_extract to ->> operator', () => {
    const input = "SELECT json_extract(config, '$.theme') FROM settings";
    const result = translateSql(input);
    expect(result).toContain("config->>'theme'");
  });

  it('converts group_concat with separator', () => {
    const input = "SELECT group_concat(name, ', ') FROM users";
    const result = translateSql(input);
    expect(result).toContain("STRING_AGG(name, ', ')");
  });

  it('converts group_concat without separator', () => {
    const input = 'SELECT group_concat(name) FROM users';
    const result = translateSql(input);
    expect(result).toContain("STRING_AGG(name, ',')");
  });

  it('converts json_group_array to json_agg', () => {
    const input = 'SELECT json_group_array(name) FROM users';
    const result = translateSql(input);
    expect(result).toContain('json_agg(name)');
  });

  it('converts IFNULL to COALESCE', () => {
    const input = 'SELECT IFNULL(name, "unknown") FROM users';
    const result = translateSql(input);
    expect(result).toContain('COALESCE(name, "unknown")');
  });

  it('strips AUTOINCREMENT keyword', () => {
    const input = 'CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT)';
    const result = translateSql(input);
    expect(result).not.toContain('AUTOINCREMENT');
  });

  it('preserves CURRENT_TIMESTAMP', () => {
    const input = 'INSERT INTO log (created_at) VALUES (CURRENT_TIMESTAMP)';
    expect(translateSql(input)).toContain('CURRENT_TIMESTAMP');
  });

  it('handles multiple conversions in one query', () => {
    const input = "INSERT OR IGNORE INTO audit_log (timestamp, session_id) VALUES (datetime('now'), ?)";
    const result = translateSql(input);
    expect(result).toContain('NOW()');
    expect(result).toContain('ON CONFLICT DO NOTHING');
    expect(result).not.toContain('OR IGNORE');
  });
});

describe('convertPlaceholders', () => {
  it('converts ? to $1, $2, $3', () => {
    const input = 'SELECT * FROM t WHERE a = ? AND b = ? AND c = ?';
    expect(convertPlaceholders(input)).toBe('SELECT * FROM t WHERE a = $1 AND b = $2 AND c = $3');
  });

  it('handles no placeholders', () => {
    const input = 'SELECT * FROM t';
    expect(convertPlaceholders(input)).toBe('SELECT * FROM t');
  });

  it('handles single placeholder', () => {
    const input = 'SELECT * FROM t WHERE id = ?';
    expect(convertPlaceholders(input)).toBe('SELECT * FROM t WHERE id = $1');
  });
});
