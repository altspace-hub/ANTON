/**
 * gap-domains.test.ts — every shipped framework is assessed by the right kind
 * of specialist.
 *
 * Every Gap Assessor prompt used to say "senior AML/CFT compliance specialist
 * for Nordic and European financial institutions" whatever the framework;
 * 56 of the 60 shipped frameworks are not AML.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { FRAMEWORK_DOMAINS, frameworkDomain, domainForFrameworks, domainProfile } from '../../server/services/gap-domains.js';
import { listAvailableFrameworks } from '../../server/services/gap-assessment-engine.js';

const FRAMEWORKS_DIR = path.join(process.cwd(), 'data', 'frameworks');

describe('gap-domains', () => {
  it('maps every shipped framework file explicitly — a new file must get a line', () => {
    const ids = fs.readdirSync(FRAMEWORKS_DIR).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    const unmapped = ids.filter((id) => !(id in FRAMEWORK_DOMAINS));
    expect(unmapped).toEqual([]);
  });

  it('gives DORA an ICT-resilience specialist and GDPR a data-protection one, not an AML one', () => {
    expect(frameworkDomain('dora-2022')).toBe('ict-resilience');
    expect(frameworkDomain('gdpr-2016')).toBe('privacy');
    expect(frameworkDomain('amlr-2024')).toBe('aml');
    expect(domainProfile(frameworkDomain('dora-2022')).assessorPersona).not.toMatch(/AML/);
    expect(domainProfile(frameworkDomain('amlr-2024')).assessorPersona).toMatch(/AML\/CFT/);
  });

  it('falls back to a generalist for an unknown framework and for a mixed assessment', () => {
    expect(frameworkDomain('something-new-2027')).toBe('compliance');
    expect(domainForFrameworks(['amlr-2024', 'amld6-2024'])).toBe('aml');
    expect(domainForFrameworks(['amlr-2024', 'dora-2022'])).toBe('compliance');
  });

  it('is served with the framework list so the wizard can adapt its entity types and roles', () => {
    const listed = listAvailableFrameworks();
    expect(listed.length).toBeGreaterThan(50);
    const dora = listed.find((f) => f.id === 'dora-2022') as { domain?: string } | undefined;
    expect(dora?.domain).toBe('ict-resilience');
  });
});
