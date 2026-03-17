import { describe, it, expect } from 'vitest';
import {
  daysDiff,
  daysUntil,
  strftime,
  yearWeek,
  dateOffsetLiteral,
  dateOffsetParam,
  groupConcat,
  ilike,
  listTablesQuery,
  tableExistsQuery,
  columnExistsQuery,
  ftsMatch,
  ftsRank,
  upsert,
} from '../../server/db/dialect-helpers.js';

describe('dialect-helpers', () => {
  describe('daysDiff', () => {
    it('returns julianday math for sqlite', () => {
      const result = daysDiff('sqlite', 'a.date', 'b.date');
      expect(result).toContain('julianday(a.date)');
      expect(result).toContain('julianday(b.date)');
    });

    it('returns EXTRACT(EPOCH ...) for postgresql', () => {
      const result = daysDiff('postgresql', 'a.date', 'b.date');
      expect(result).toContain('EXTRACT(EPOCH');
      expect(result).toContain('86400');
      expect(result).toContain('::timestamptz');
    });
  });

  describe('daysUntil', () => {
    it('returns julianday for sqlite', () => {
      const result = daysUntil('sqlite', 'due_date');
      expect(result).toContain("julianday('now')");
      expect(result).toContain('julianday(due_date)');
    });

    it('returns NOW() for postgresql', () => {
      const result = daysUntil('postgresql', 'due_date');
      expect(result).toContain('NOW()');
      expect(result).toContain('due_date::timestamptz');
    });
  });

  describe('strftime', () => {
    it('returns strftime for sqlite', () => {
      expect(strftime('sqlite', '%Y-%m-%d', 'created_at')).toBe("strftime('%Y-%m-%d', created_at)");
    });

    it('returns TO_CHAR for postgresql', () => {
      expect(strftime('postgresql', '%Y-%m-%d', 'created_at')).toBe("TO_CHAR(created_at, 'YYYY-MM-DD')");
    });

    it('converts %Y-%m to YYYY-MM', () => {
      expect(strftime('postgresql', '%Y-%m', 'col')).toBe("TO_CHAR(col, 'YYYY-MM')");
    });

    it('converts %H to HH24', () => {
      expect(strftime('postgresql', '%H', 'col')).toBe("TO_CHAR(col, 'HH24')");
    });
  });

  describe('yearWeek', () => {
    it('uses %Y-%W for sqlite', () => {
      expect(yearWeek('sqlite', 'created_at')).toContain('%Y-%W');
    });

    it('uses IYYY-IW for postgresql', () => {
      expect(yearWeek('postgresql', 'created_at')).toContain('IYYY-IW');
    });
  });

  describe('dateOffsetLiteral', () => {
    it('returns datetime for sqlite', () => {
      const result = dateOffsetLiteral('sqlite', 7, 'days');
      expect(result).toContain("datetime('now'");
      expect(result).toContain('-7 days');
    });

    it('returns INTERVAL for postgresql', () => {
      const result = dateOffsetLiteral('postgresql', 7, 'days');
      expect(result).toContain('NOW()');
      expect(result).toContain("INTERVAL '7 days'");
    });
  });

  describe('dateOffsetParam', () => {
    it('returns datetime with || for sqlite', () => {
      expect(dateOffsetParam('sqlite', 'days')).toContain("? || ' days'");
    });

    it('returns ::interval for postgresql', () => {
      expect(dateOffsetParam('postgresql', 'days')).toContain('::interval');
    });
  });

  describe('groupConcat', () => {
    it('returns group_concat for sqlite', () => {
      expect(groupConcat('sqlite', 'name')).toBe("group_concat(name, ',')");
    });

    it('returns STRING_AGG for postgresql', () => {
      expect(groupConcat('postgresql', 'name')).toBe("STRING_AGG(name::text, ',')");
    });

    it('accepts custom separator', () => {
      expect(groupConcat('postgresql', 'name', ' | ')).toBe("STRING_AGG(name::text, ' | ')");
    });
  });

  describe('ilike', () => {
    it('returns LIKE for sqlite', () => {
      expect(ilike('sqlite', 'name')).toBe('name LIKE ?');
    });

    it('returns ILIKE for postgresql', () => {
      expect(ilike('postgresql', 'name')).toBe('name ILIKE ?');
    });
  });

  describe('listTablesQuery', () => {
    it('queries sqlite_master for sqlite', () => {
      expect(listTablesQuery('sqlite')).toContain('sqlite_master');
    });

    it('queries pg_tables for postgresql', () => {
      expect(listTablesQuery('postgresql')).toContain('pg_tables');
    });
  });

  describe('tableExistsQuery', () => {
    it('queries sqlite_master for sqlite', () => {
      expect(tableExistsQuery('sqlite')).toContain('sqlite_master');
    });

    it('queries pg_tables for postgresql', () => {
      expect(tableExistsQuery('postgresql')).toContain('pg_tables');
    });
  });

  describe('columnExistsQuery', () => {
    it('queries pragma_table_info for sqlite', () => {
      expect(columnExistsQuery('sqlite', 'users', 'email')).toContain('pragma_table_info');
    });

    it('queries information_schema for postgresql', () => {
      expect(columnExistsQuery('postgresql', 'users', 'email')).toContain('information_schema');
    });
  });

  describe('ftsMatch', () => {
    it('returns MATCH for sqlite', () => {
      expect(ftsMatch('sqlite')).toContain('MATCH');
    });

    it('returns @@ plainto_tsquery for postgresql', () => {
      expect(ftsMatch('postgresql')).toContain('@@');
      expect(ftsMatch('postgresql')).toContain('plainto_tsquery');
    });
  });

  describe('ftsRank', () => {
    it('returns rank for sqlite', () => {
      expect(ftsRank('sqlite')).toBe('rank');
    });

    it('returns ts_rank for postgresql', () => {
      expect(ftsRank('postgresql')).toContain('ts_rank');
    });
  });

  describe('upsert', () => {
    it('returns INSERT OR REPLACE for sqlite', () => {
      const result = upsert('sqlite', 'settings', ['key', 'value'], 'key');
      expect(result).toContain('INSERT OR REPLACE');
    });

    it('returns ON CONFLICT DO UPDATE for postgresql', () => {
      const result = upsert('postgresql', 'settings', ['key', 'value'], 'key');
      expect(result).toContain('ON CONFLICT');
      expect(result).toContain('DO UPDATE SET');
      expect(result).toContain('value = EXCLUDED.value');
    });
  });
});
