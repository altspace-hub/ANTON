/**
 * share.ts — Comm App adapter over @capacitor/share + web fallback.
 *
 * Mirrors src/business/services/share.ts (commit f116954) — same
 * trade-offs: native chooser on Android via @capacitor/share, web
 * fallback via navigator.share or Blob download. Duplicated here
 * rather than shared because the modules don't import each other
 * and the file is small.
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
    const dataUrl = await stringToDataUrl(file.body, file.mimeType);
    const { Share } = await import('@capacitor/share');
    try {
      await Share.share({
        title: opts.title ?? file.filename,
        text: file.body.length < 4096 ? file.body : `${file.filename} — open with a text editor.`,
        url: dataUrl,
        dialogTitle: opts.title ?? file.filename,
      });
      return;
    } catch {
      await Share.share({ title: opts.title ?? file.filename, text: file.body });
      return;
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

async function stringToDataUrl(body: string, mimeType: string): Promise<string> {
  const enc = new TextEncoder();
  const bytes = enc.encode(body);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return `data:${mimeType};base64,${btoa(bin)}`;
}
