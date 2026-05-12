/**
 * useBlobUrl — memoize a base64 → Blob ObjectURL conversion for media.
 *
 * Why: chat / Wassup screens previously rendered images as
 *
 *   <img src={`data:${m.mimeType};base64,${m.data}`}>
 *
 * which rebuilt a multi-hundred-KB data-URL string on every React render
 * (when a thread polls or a new message arrives) and never released the
 * resulting decoded image from the WebView memory cache because each
 * render produced a fresh src URL.
 *
 * useBlobUrl memoizes by (base64, mimeType) pair: at first render it
 * decodes the base64 into a Blob and asks the browser for an
 * ObjectURL (a ~30-byte token). Subsequent renders reuse the same URL.
 * On unmount the URL is revoked so the Blob is GC-eligible.
 *
 * The caller passes `null/undefined` when there is no media — the hook
 * then returns null and skips all work.
 */
import { useEffect, useMemo, useRef } from 'react';

export function useBlobUrl(base64: string | undefined | null, mimeType: string | undefined | null): string | null {
  // React's useMemo is the right primitive — Blob + URL.createObjectURL
  // are both cheap to call but allocate. We tag the URL on a ref so the
  // unmount cleanup hook can revoke it regardless of dep changes.
  const urlRef = useRef<string | null>(null);

  const url = useMemo<string | null>(() => {
    // Always revoke any prior URL before allocating the next one. This
    // makes the hook safe across base64 changes for the same instance
    // (e.g. editing a message's media in place).
    if (urlRef.current) {
      try { URL.revokeObjectURL(urlRef.current); } catch { /* ignore */ }
      urlRef.current = null;
    }
    if (!base64 || !mimeType) return null;
    try {
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mimeType });
      const u = URL.createObjectURL(blob);
      urlRef.current = u;
      return u;
    } catch {
      return null;
    }
  }, [base64, mimeType]);

  useEffect(() => {
    return () => {
      if (urlRef.current) {
        try { URL.revokeObjectURL(urlRef.current); } catch { /* ignore */ }
        urlRef.current = null;
      }
    };
  }, []);

  return url;
}
