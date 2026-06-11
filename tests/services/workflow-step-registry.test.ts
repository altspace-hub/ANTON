import { describe, it, expect } from 'vitest';
import {
  STEP_REGISTRY,
  getStepEntry,
  isStubStep,
  resolveExplicitDbDriver,
  DB_QUERY_DRIVERS,
} from '../../server/services/workflow-step-registry';

describe('workflow-step-registry', () => {
  describe('stub step honesty (item 0.7)', () => {
    it('marks notification as a stub (executor logs + returns sent:false)', () => {
      const entry = getStepEntry('notification');
      expect(entry).toBeDefined();
      expect(entry?.status).toBe('stub');
      expect(isStubStep('notification')).toBe(true);
    });

    it('marks email_send as a stub', () => {
      const entry = getStepEntry('email_send');
      expect(entry).toBeDefined();
      expect(entry?.status).toBe('stub');
      expect(isStubStep('email_send')).toBe(true);
    });

    it('does not advertise retries on stub steps (a retry count implies a real side-effect)', () => {
      expect(getStepEntry('notification')?.defaultRetries).toBe(0);
      expect(getStepEntry('email_send')?.defaultRetries).toBe(0);
    });

    it('keeps implemented steps available (no stub flag)', () => {
      for (const id of ['api_call', 'database_query', 'llm', 'messaging_notification', 'transform', 'wait']) {
        expect(isStubStep(id), `${id} should not be a stub`).toBe(false);
      }
    });

    it('every registry entry has a valid status when set', () => {
      for (const entry of STEP_REGISTRY) {
        if (entry.status !== undefined) {
          expect(['available', 'stub']).toContain(entry.status);
        }
      }
    });
  });

  describe('resolveExplicitDbDriver (item 0.8 — no silent sqlite default)', () => {
    it('throws a clear config error when driver is unset', () => {
      expect(() => resolveExplicitDbDriver({})).toThrow(
        /database_query step requires an explicit driver.*postgresql \| mysql \| mssql \| sqlite/
      );
    });

    it('throws when driver is empty / null / whitespace', () => {
      expect(() => resolveExplicitDbDriver({ driver: '' })).toThrow(/explicit driver/);
      expect(() => resolveExplicitDbDriver({ driver: null })).toThrow(/explicit driver/);
      expect(() => resolveExplicitDbDriver({ driver: '   ' })).toThrow(/explicit driver/);
      expect(() => resolveExplicitDbDriver(undefined)).toThrow(/explicit driver/);
      expect(() => resolveExplicitDbDriver(null)).toThrow(/explicit driver/);
    });

    it('never falls back to sqlite implicitly (old behavior: cfg.driver || "sqlite")', () => {
      try {
        const driver = resolveExplicitDbDriver({});
        expect.fail(`expected throw, got driver=${driver}`);
      } catch (err) {
        expect(String(err)).toMatch(/explicit driver/);
      }
    });

    it('accepts every supported driver explicitly', () => {
      for (const driver of DB_QUERY_DRIVERS) {
        expect(resolveExplicitDbDriver({ driver })).toBe(driver);
      }
    });

    it('sqlite stays allowed as an EXPLICIT external read connector', () => {
      expect(resolveExplicitDbDriver({ driver: 'sqlite' })).toBe('sqlite');
    });

    it('normalizes case and whitespace', () => {
      expect(resolveExplicitDbDriver({ driver: ' PostgreSQL ' })).toBe('postgresql');
      expect(resolveExplicitDbDriver({ driver: 'MSSQL' })).toBe('mssql');
    });

    it('rejects unsupported drivers with the valid list', () => {
      expect(() => resolveExplicitDbDriver({ driver: 'oracle' })).toThrow(
        /Unsupported database_query driver: "oracle".*postgresql \| mysql \| mssql \| sqlite/
      );
    });
  });
});
