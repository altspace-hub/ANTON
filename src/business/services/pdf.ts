/**
 * pdf.ts — print + save-as-PDF using the WebView's native print dialog.
 *
 * v1 approach (zero new deps): pop the kvitto HTML into a hidden iframe
 * and call print() on it. Chromium-based WebViews on Android show
 * "Save as PDF" in the printer dropdown — the merchant picks that and
 * gets a real PDF in their Downloads folder, no jsPDF dependency.
 *
 * If we later need programmatic PDF bytes (e.g. to attach to an email
 * via Capacitor Share's `files` field), this is where jsPDF will land.
 */

/** Open the OS print dialog with the given HTML. */
export async function printHtml(html: string, jobTitle = 'Kvitto'): Promise<void> {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error('Could not open print frame');
  }
  doc.open();
  doc.write(`<!doctype html><html><head><title>${escapeHtml(jobTitle)}</title></head><body>${html}</body></html>`);
  doc.close();

  // Wait a tick for layout + fonts.
  await new Promise((r) => setTimeout(r, 100));

  try {
    const win = iframe.contentWindow;
    if (win) {
      win.focus();
      win.print();
    }
  } finally {
    // Give the browser a moment to spool the print job before removing
    // the frame. Some Android WebViews need it.
    setTimeout(() => iframe.remove(), 2000);
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
