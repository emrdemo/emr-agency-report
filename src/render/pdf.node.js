// Node-only PDF driver. This is the ONLY platform-specific module — to run on a
// Cloudflare Worker later, swap this for the Browser Rendering binding; everything
// upstream (clients, gather, template) is portable as-is.
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

/**
 * Render an on-disk HTML file to PDF. Navigating to a file:// URL lets the page's
 * relative asset paths (../assets/styles.css) and the Leaflet CDN/tiles resolve.
 * @param {{ htmlPath:string, pdfPath:string, timeoutMs?:number }} opts
 */
export async function renderPdf({ htmlPath, pdfPath, timeoutMs = 60000 }) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'networkidle', timeout: timeoutMs });

    // Wait for web fonts so headings don't reflow mid-print.
    await page.evaluate(() => (document.fonts ? document.fonts.ready : null)).catch(() => {});

    // Wait for the Leaflet map to signal it has painted (falls through on timeout).
    await page
      .waitForFunction(() => window.__mapReady === true, { timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(800); // let the final tiles settle

    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
  } finally {
    await browser.close();
  }
}
