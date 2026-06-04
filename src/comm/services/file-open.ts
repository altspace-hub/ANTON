/**
 * file-open.ts — save a received file attachment to the device + open it (#91).
 *
 * CRITICAL: writes the base64 bytes as BINARY (no `encoding` param → Capacitor
 * Filesystem treats `data` as base64). The shared services/share.ts shareFile
 * writes with Encoding.UTF8 which would CORRUPT a PDF / .docx / .xlsx — so file
 * attachments must NOT reuse it.
 *
 * Native: Filesystem.writeFile(Cache) → getUri → Share.share({files:[uri]}) —
 * the system chooser doubles as the "open with…" sheet (Drive / a PDF viewer /
 * email). Web: Blob from base64 + an anchor download.
 */

/** Strip path separators / control chars / leading dots so a peer-supplied
 *  filename can't escape the Cache directory on write. Falls back to 'file'. */
export function sanitizeFilename(name: string): string {
  return (name || 'file').replace(/[\\/\x00-\x1f]/g, '_').replace(/^\.+/, '') || 'file';
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function saveAndOpenFile(file: {
  filename: string;
  mimeType: string;
  base64: string;
}): Promise<void> {
  const safe = sanitizeFilename(file.filename);
  // One try/catch over BOTH paths: the most common reject is the user
  // dismissing the native share chooser (benign); a genuine write/decode
  // failure just leaves the file unopened. Either way never surface an
  // unhandled rejection at the fire-and-forget call site.
  try {
    if (await isCapacitorNative()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      // NO `encoding` → `data` is written as base64 (binary-safe).
      await Filesystem.writeFile({ path: safe, data: file.base64, directory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ path: safe, directory: Directory.Cache });
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: file.filename, files: [uri], dialogTitle: file.filename });
      return;
    }

    // Web fallback — Blob from base64 + anchor download.
    const bytes = base64ToBytes(file.base64);
    const blob = new Blob([bytes as BlobPart], { type: file.mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.filename || safe;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.warn('[file-open] saveAndOpenFile failed', err);
  }
}

async function isCapacitorNative(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}
