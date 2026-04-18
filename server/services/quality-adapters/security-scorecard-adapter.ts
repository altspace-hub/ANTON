/**
 * security-scorecard-adapter.ts — real ESP-IDF sdkconfig parser.
 *
 * Reads the project workspace's sdkconfig (or sdkconfig.defaults) and grades
 * the secure-update posture: secure boot v2, flash encryption, anti-rollback,
 * signed OTA. No mocks — what you see is what's actually configured in the
 * build.
 *
 * Tier 1 + tier1_secure_update_ack → adapter does not apply (matches Phase 4
 * mock behaviour). Tier 2/3 with missing chain → fail.
 */

import path from 'path';
import { promises as fs } from 'fs';
import type { QualityAdapter } from '../quality-pipeline-service.js';
import { workspacePathFor, pathExists } from './_shared.js';

const INSTALL_HINT = 'Generate sdkconfig with `idf.py menuconfig` (or copy sdkconfig.defaults from a working ESP-IDF project) into the project workspace, then re-run.';

interface SdkconfigPosture {
  secure_boot_v2: boolean;
  flash_encryption: boolean;
  anti_rollback: boolean;
  signed_apps: boolean;
  found: boolean;
  source_file: string | null;
}

async function readSdkconfig(workspace: string): Promise<SdkconfigPosture> {
  const candidates = [
    path.join(workspace, 'sdkconfig'),
    path.join(workspace, 'sdkconfig.defaults'),
  ];
  for (const f of candidates) {
    if (!(await pathExists(f))) continue;
    const text = await fs.readFile(f, 'utf-8');
    const isOn = (key: string) => new RegExp(`^${key}=y\\b`, 'm').test(text);
    return {
      secure_boot_v2: isOn('CONFIG_SECURE_BOOT') || isOn('CONFIG_SECURE_BOOT_V2_ENABLED'),
      flash_encryption: isOn('CONFIG_SECURE_FLASH_ENC_ENABLED') || isOn('CONFIG_SECURE_FLASH_ENCRYPTION_MODE_RELEASE'),
      anti_rollback: isOn('CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK'),
      signed_apps: isOn('CONFIG_SECURE_SIGNED_APPS_RSA_SCHEME') || isOn('CONFIG_SECURE_SIGNED_APPS_ECDSA_SCHEME') || isOn('CONFIG_SECURE_SIGNED_APPS_ECDSA_V2_SCHEME'),
      found: true,
      source_file: f,
    };
  }
  return { secure_boot_v2: false, flash_encryption: false, anti_rollback: false, signed_apps: false, found: false, source_file: null };
}

export async function detect(): Promise<{ installed: boolean; version: string | null; install_hint: string }> {
  // No external tool needed — but we report "installed" only when sdkconfig
  // would actually be findable for SOME ESP-IDF project. Adapter marks
  // installed=true unconditionally; the run() function reports skip-with-
  // reason when the specific project lacks one.
  return { installed: true, version: 'sdkconfig-parser-1.0', install_hint: INSTALL_HINT };
}

const securityScorecardAdapter: QualityAdapter = {
  gateKey: 'security-scorecard',
  displayLabel: 'Security Scorecard',
  isMandatory: true,
  kind: 'real',
  version: '0.2.0',
  appliesTo: (project) => {
    if (project.tier === 1 && project.tier1_secure_update_ack) return false;
    return true;
  },
  run: async ({ project }) => {
    const start = Date.now();
    const workspace = workspacePathFor(project);
    const posture = await readSdkconfig(workspace);

    if (!posture.found) {
      return {
        outcome: 'skip', score: null,
        summary: `No sdkconfig found in ${workspace} — security posture cannot be assessed.`,
        details: { workspace, install_hint: INSTALL_HINT },
        durationMs: Date.now() - start,
      };
    }

    const score =
      (posture.secure_boot_v2 ? 30 : 0) +
      (posture.flash_encryption ? 30 : 0) +
      (posture.anti_rollback ? 20 : 0) +
      (posture.signed_apps ? 20 : 0);

    let outcome: 'pass' | 'warn' | 'fail' = 'pass';
    if (project.tier === 3 && score < 100) outcome = 'fail';
    else if (project.tier === 2 && score < 60) outcome = 'fail';
    else if (score < 60) outcome = 'warn';

    return {
      outcome, score,
      summary: outcome === 'pass'
        ? `Secure-update chain present (${score}/100) — secure boot ${posture.secure_boot_v2 ? '✓' : '✗'}, flash enc ${posture.flash_encryption ? '✓' : '✗'}, anti-rollback ${posture.anti_rollback ? '✓' : '✗'}, signed OTA ${posture.signed_apps ? '✓' : '✗'}.`
        : outcome === 'warn'
        ? `Secure-update posture incomplete (${score}/100). Acceptable for Tier 1 with explicit acknowledgement.`
        : `Secure-update chain insufficient for Tier ${project.tier} (${score}/100). Enable in sdkconfig and re-build before shipping.`,
      details: {
        sdkconfig_path: posture.source_file,
        tier: project.tier,
        secure_boot_v2: posture.secure_boot_v2,
        flash_encryption: posture.flash_encryption,
        anti_rollback: posture.anti_rollback,
        signed_apps: posture.signed_apps,
      },
      durationMs: Date.now() - start,
    };
  },
};

export default securityScorecardAdapter;
