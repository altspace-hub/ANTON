/**
 * share.ts — Pay App adapter over @capacitor/share + web fallback.
 *
 * Ported verbatim from src/comm/services/share.ts (#78) — same
 * trade-offs: native chooser on Android via @capacitor/share, web
 * fallback via navigator.share or a Blob download. Duplicated per the
 * per-app copy pattern rather than shared.
 *
 * Used by the Tax report screen to export K4 CSV / ledger CSV.
 */

export interface SharedFile {
  filename: string;
  mimeType: string;
  /** UTF-8 body. */
  body: string;
}

export interface ShareTextOptions {
  title?: string;
  text?: string;
  url?: string;
}

export async function shareText(opts: ShareTextOptions): Promise<void> {
  if (await isCapacitorNative()) {
    const { Share } = await import('@capacitor/share');
    await Share.share({
      title: opts.title,
      text: opts.text,
      url: opts.url,
      dialogTitle: opts.title,
    });
    return;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: opts.title, text: opts.text, url: opts.url });
      return;
    } catch {
      // fall through to clipboard
    }
  }
  const payload = [opts.title, opts.text, opts.url].filter(Boolean).join('\n');
  await copyToClipboard(payload);
}

export async function shareFile(file: SharedFile, opts: { title?: string } = {}): Promise<void> {
  if (await isCapacitorNative()) {
    // Write the file to the app cache, then share its file:// URI so it
    // attaches as a REAL file in the native chooser (email / Drive / Files).
    // The Android Share plugin only honours file:// URIs — a data: URL is
    // silently ignored, which is why the export used to degrade to an inline
    // text paste. (#90)
    try {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      await Filesystem.writeFile({
        path: file.filename, data: file.body, directory: Directory.Cache, encoding: Encoding.UTF8,
      });
      const { uri } = await Filesystem.getUri({ path: file.filename, directory: Directory.Cache });
      const { Share } = await import('@capacitor/share');
      await Share.share({
        title: opts.title ?? file.filename, files: [uri], dialogTitle: opts.title ?? file.filename,
      });
      return;
    } catch {
      // Filesystem/Share unavailable or failed — fall back to a text share so
      // the content still reaches the chooser.
      try {
        const { Share } = await import('@capacitor/share');
        await Share.share({ title: opts.title ?? file.filename, text: file.body });
        return;
      } catch { /* fall through to the web path */ }
    }
  }
  // Web fallback — Blob + anchor click.
  const blob = new Blob([file.body], { type: file.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function isCapacitorNative(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return cap?.isNativePlatform?.() === true;
}

async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  ta.remove();
}
