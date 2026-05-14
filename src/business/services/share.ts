/**
 * share.ts — adapter over @capacitor/share + the web fallback.
 *
 * On Android, `@capacitor/share` opens the native chooser (email,
 * messages, Drive, etc). On desktop, the Web Share API may be
 * available; otherwise we fall back to a Blob download so the
 * merchant gets the file out somehow during dev.
 *
 * Files are passed in-memory (string body + filename + mime). The
 * adapter writes to the Cache directory only when it has to (native
 * share with a file URI), and lets the OS clean it up. PDFs are not
 * generated here — kvitto-export.ts uses window.print() with a
 * Save-as-PDF dialog instead, which keeps the dep footprint to zero.
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

/** Share plain text + optional URL. Native: opens chooser. Web:
 *  navigator.share if available, else copies to clipboard. */
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

/** Share a generated file. Native: writes to cache + invokes Share with
 *  the file URI. Web: triggers a browser download. */
export async function shareFile(file: SharedFile, opts: { title?: string } = {}): Promise<void> {
  if (await isCapacitorNative()) {
    // Write to Capacitor Filesystem cache, then share the resulting URI.
    // @capacitor/filesystem isn't in the slimmed plugin list (yet) so use
    // a base64 data URL via the Share plugin's `files` field which accepts
    // file:// URIs OR base64 data URIs (Android only). For the v1 launch
    // we share the URL + text — the merchant emails the kvitto link, and
    // the file body shows up in the OS share dialog as inline text.
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
      // Some Android share targets reject data: URLs. Fall back to text.
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
  // Last-resort: temp textarea (jsdom + very old browsers)
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch { /* ignore */ }
  ta.remove();
}

async function stringToDataUrl(body: string, mimeType: string): Promise<string> {
  // btoa requires Latin-1 — encode UTF-8 first.
  const enc = new TextEncoder();
  const bytes = enc.encode(body);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return `data:${mimeType};base64,${btoa(bin)}`;
}
