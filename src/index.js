// Node CLI entrypoint. Loads config + tokens, gathers data, renders HTML, prints PDF.
//
// Flags:
//   --fixtures[=path] render from a cached JSON (default out/fixtures/report-data.json)
//   --demo            render the bundled fictional sample (demo/report-data.json)
//   --save-fixtures   write the gathered data to the fixture cache for offline iteration
//   --html-only       stop after writing out/report.html (skip Playwright/PDF)
//   --month=YYYY-MM   override REPORT_MONTH (default: previous complete month)
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { ReviewsClient } from './clients/reviewsClient.js';
import { LsgClient } from './clients/lsgClient.js';
import { gather } from './report/gather.js';
import { renderReport } from './report/template.js';

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(PROJECT_ROOT, 'out');
const FIXTURE_PATH = join(OUT_DIR, 'fixtures', 'report-data.json');

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvFiles([join(PROJECT_ROOT, '.env')]);

  const config = configFromEnv();
  if (args.month) config.reportMonth = args.month;

  await mkdir(join(OUT_DIR, 'fixtures'), { recursive: true });

  let data;
  if (args.fixtures) {
    const path = args.fixtures === true ? FIXTURE_PATH : join(PROJECT_ROOT, args.fixtures);
    console.log(`• Loading cached data from ${rel(path)}`);
    data = JSON.parse(await readFile(path, 'utf8'));
    if (args.month) data.meta.reportMonth = args.month;
  } else {
    const baseUrl = process.env.EMR_BASE_URL;
    const tenantToken = process.env.EMR_TENANT_API_TOKEN;
    const mcpToken = process.env.EMR_MCP_TOKEN;

    if (!baseUrl) throw new Error('Set EMR_BASE_URL in .env to your EmbedMyReviews app host (e.g. https://app.your-white-label.com).');
    if (!mcpToken) throw new Error('No MCP token — set EMR_MCP_TOKEN in .env (copy .env.example to .env).');
    if (!tenantToken) console.warn('⚠  EMR_TENANT_API_TOKEN not set — Local Search Grid sections will be empty.');
    if (!config.reviews.organizationId || !config.reviews.locationId)
      console.warn('⚠  EMR_ORGANIZATION_ID / EMR_LOCATION_ID not set — review pages will be empty. See .env.example.');
    if (!config.lsg.scanUuid)
      console.warn('⚠  EMR_SCAN_UUID not set — the map, competitors, and rank trends will be empty.');

    const clients = {
      reviews: new ReviewsClient({ baseUrl, token: mcpToken }),
      lsg: new LsgClient({ baseUrl, token: tenantToken ?? '' }),
    };

    console.log(`• Gathering data for ${config.business?.name ?? 'business'} (${config.reportMonth}) …`);
    data = await gather(clients, config);

    if (args.saveFixtures) {
      await writeFile(FIXTURE_PATH, JSON.stringify(data, null, 2));
      console.log('• Saved fixtures → out/fixtures/report-data.json');
    }
  }

  // Agency white-label comes from .env (single source of truth); it overlays whatever
  // branding the config/fixture carried, so a recipient's brand shows on live AND demo.
  data.meta.branding = { ...(data.meta.branding ?? {}), ...brandingFromEnv() };

  // Relative href resolves from out/report.html → ../assets/styles.css.
  data.meta.__stylesHref = '../assets/styles.css';

  const html = renderReport(data);
  const htmlPath = join(OUT_DIR, 'report.html');
  await writeFile(htmlPath, html);
  console.log(`• Wrote HTML → ${rel(htmlPath)}`);

  if (args.htmlOnly) {
    console.log('✓ Done (HTML only). Open it in a browser, or drop --html-only to render the PDF.');
    return;
  }

  const { renderPdf } = await import('./render/pdf.node.js');
  const pdfPath = join(OUT_DIR, 'report.pdf');
  console.log('• Rendering PDF with Playwright …');
  await renderPdf({ htmlPath, pdfPath });
  console.log(`✓ Done → ${rel(pdfPath)}`);
}

function parseArgs(argv) {
  const out = { fixtures: false, saveFixtures: false, htmlOnly: false, month: null };
  for (const a of argv) {
    if (a === '--fixtures') out.fixtures = true;
    else if (a.startsWith('--fixtures=')) out.fixtures = a.slice('--fixtures='.length);
    else if (a === '--demo') out.fixtures = 'demo/report-data.json';
    else if (a === '--save-fixtures') out.saveFixtures = true;
    else if (a === '--html-only') out.htmlOnly = true;
    else if (a.startsWith('--month=')) out.month = a.slice('--month='.length);
  }
  return out;
}

function loadEnvFiles(paths) {
  for (const p of paths) {
    try {
      process.loadEnvFile(p); // Node ≥ 20.12
    } catch {
      /* missing file is fine */
    }
  }
}

/** Build the report config (which client + which month) entirely from .env. */
function configFromEnv() {
  const num = (v) => (v == null || v === '' ? undefined : Number(v));
  return {
    reportMonth: process.env.REPORT_MONTH || previousMonth(),
    locale: process.env.REPORT_LOCALE || 'en-US',
    business: {
      name: process.env.BUSINESS_NAME || 'Client',
      locationLabel: process.env.BUSINESS_LOCATION_LABEL || '',
    },
    reviews: {
      organizationId: num(process.env.EMR_ORGANIZATION_ID),
      locationId: num(process.env.EMR_LOCATION_ID),
      includeGbp: process.env.EMR_INCLUDE_GBP !== 'false',
      highlightCount: num(process.env.EMR_HIGHLIGHT_COUNT) ?? 4,
    },
    lsg: {
      scanUuid: process.env.EMR_SCAN_UUID || '',
      primaryKeyword: process.env.EMR_SCAN_KEYWORD || '',
      competitorLimit: num(process.env.EMR_COMPETITOR_LIMIT) ?? 8,
    },
  };
}

/** Previous complete calendar month as YYYY-MM — the usual monthly-report target. */
function previousMonth() {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Agency white-label fields, read from .env. Only the keys that are set are returned. */
function brandingFromEnv() {
  const map = {
    productName: process.env.AGENCY_NAME,
    tagline: process.env.AGENCY_TAGLINE,
    accent: process.env.AGENCY_ACCENT,
    accentSoft: process.env.AGENCY_ACCENT_SOFT,
    logoUrl: process.env.AGENCY_LOGO_URL,
  };
  return Object.fromEntries(Object.entries(map).filter(([, v]) => v != null && v !== ''));
}

function rel(p) {
  return p.startsWith(PROJECT_ROOT) ? p.slice(PROJECT_ROOT.length + 1) : p;
}

main().catch((err) => {
  console.error('✗ Report generation failed:', err);
  process.exitCode = 1;
});
