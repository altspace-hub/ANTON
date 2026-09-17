/**
 * ModuleFingerprintLine — one line under the Provenance header for a run
 * whose module is a CUSTOM / IMPORTED module (Wave 6, track G):
 *
 *   Module fingerprint: 3f9a1c0b2d4e · signed by Compliance Team
 *
 * Renders nothing for built-in modules (they are in MODULES and have no
 * fingerprint route), for dynamic area modules (the route answers 404), and
 * while nothing is known yet. Results are cached per module id for the page
 * lifetime — the fingerprint of an installed module does not change between
 * answers.
 */
import { useEffect, useState } from 'react';
import { Fingerprint } from 'lucide-react';
import { fetchModuleFingerprint, type ModuleFingerprint } from '@/lib/api';
import { MODULES } from '@/lib/constants';

const cache = new Map<string, Promise<ModuleFingerprint | null>>();

function lookup(moduleId: string): Promise<ModuleFingerprint | null> {
  let pending = cache.get(moduleId);
  if (!pending) {
    pending = fetchModuleFingerprint(moduleId).then((fp) => {
      // Only a found fingerprint is cached: a 404 (dynamic area module) or a
      // failed request is retried on the next mount, e.g. after an import.
      if (!fp) cache.delete(moduleId);
      return fp;
    });
    cache.set(moduleId, pending);
  }
  return pending;
}

/** Test seam: forget cached fingerprints (e.g. after a re-import). */
export function clearModuleFingerprintCache(): void {
  cache.clear();
}

export function ModuleFingerprintLine({ moduleId }: { moduleId: string | null | undefined }) {
  const [fp, setFp] = useState<ModuleFingerprint | null>(null);
  const isBuiltIn = !!moduleId && MODULES.some((m) => m.id === moduleId);

  useEffect(() => {
    let cancelled = false;
    setFp(null);
    if (!moduleId || isBuiltIn) return undefined;
    lookup(moduleId).then((result) => { if (!cancelled) setFp(result); });
    return () => { cancelled = true; };
  }, [moduleId, isBuiltIn]);

  if (!fp) return null;
  const hex = fp.checksum.replace(/^sha256:/i, '').slice(0, 12);
  const signer = fp.signedBy ? `signed by ${fp.signedBy}` : 'unsigned';
  const title = [
    `checksum ${fp.checksum}`,
    `prompt ${fp.promptSha256}`,
    `config ${fp.configSha256}`,
    fp.signerPubkey ? `signer pubkey ${fp.signerPubkey}` : null,
    fp.signedAt ? `signed at ${fp.signedAt}` : null,
    fp.source === 'import' ? `imported ${fp.importedAt ?? ''}`.trim() : 'built on this instance',
    fp.acceptedInjectionFindings > 0 ? `${fp.acceptedInjectionFindings} injection finding(s) accepted at import` : null,
  ].filter(Boolean).join('\n');

  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-adv-gray" title={title} data-testid="module-fingerprint">
      <Fingerprint className="h-3 w-3 text-adv-teal" aria-hidden="true" />
      Module fingerprint: <span className="font-mono text-adv-off-white">{hex}</span> · {signer}
      {fp.acceptedInjectionFindings > 0 && (
        <span className="text-adv-gold"> · {fp.acceptedInjectionFindings} accepted finding{fp.acceptedInjectionFindings === 1 ? '' : 's'}</span>
      )}
    </span>
  );
}
