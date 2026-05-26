/**
 * Render docs/marketing-onepager.html → docs/marketing-onepager.pdf
 * A4 landscape, no margin, prefer-CSS-page-size honoured by Chromium.
 *
 * Usage:  node scripts/render-onepager-pdf.cjs
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const root = path.resolve(__dirname, '..');
  const htmlPath = path.join(root, 'docs', 'marketing-onepager.html');
  const pdfPath  = path.join(root, 'docs', 'marketing-onepager.pdf');

  if (!fs.existsSync(htmlPath)) {
    console.error('[render-onepager-pdf] Missing source HTML:', htmlPath);
    process.exit(1);
  }

  console.log('[render-onepager-pdf] Launching Chromium…');
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  console.log('[render-onepager-pdf] Loading:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  // Give web fonts (if any) a tick to settle. Inter is a system font fallback
  // here, so this is belt-and-braces.
  await page.waitForTimeout(200);

  console.log('[render-onepager-pdf] Writing PDF:', pdfPath);
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    preferCSSPageSize: true,
  });

  await browser.close();

  const bytes = fs.statSync(pdfPath).size;
  console.log(`[render-onepager-pdf] Done. ${pdfPath} (${(bytes / 1024).toFixed(1)} KB)`);
})().catch((err) => {
  console.error('[render-onepager-pdf] Failed:', err);
  process.exit(1);
});
