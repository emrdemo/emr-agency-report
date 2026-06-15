# Agency Monthly Report (EmbedMyReviews)

A small, self-contained generator that turns your EmbedMyReviews (EMR) data into a
**white-label, client-ready monthly PDF** — your agency's name and colours, your
client's numbers. It combines three data surfaces into one A4 document.

## In plain English — what you need, and what happens if it's missing

You point this at **one client location** and it builds **one PDF for one month**,
using data that already lives in your EMR account. The only thing a location truly
needs is **some reviews** — everything else makes the report richer if it's there,
and is **quietly skipped if it isn't**. The report never errors because a client is
missing a feature; that section just shrinks or disappears.

Here's what feeds the report and what happens when a client doesn't have it:

| Ingredient | What it powers | If the client doesn't have it |
|---|---|---|
| **Reviews & ratings** | The backbone — cover stats, the reputation page, the review-volume trend, per-platform breakdown | This is the minimum. With very few reviews the reputation pages are simply sparse. |
| **AI Insights** (EMR generates these automatically, usually weekly) | The "Voice of the Customer" page, review themes & sentiment, the wins/priorities on the summary, and the action plan | Those parts show a short *"not computed yet"* note. The rest of the report is unaffected. |
| **Google Business Profile (GBP) connection** | The "profile views → calls & clicks" funnel and the search-terms list on the Search Performance page | That block is **hidden automatically** (no empty boxes). |
| **Local Search Grid (LSG) scan** | The ranking **map**, the **competitor** table, and the **rank trends** | Needs **at least one** completed scan run for the map + competitors. **Several months of runs** also unlock the trend lines and the "since tracking began / vs last scan" comparisons; with **only one run** those comparisons are skipped. The scan must track the keyword you name. No scan at all → the map/search/competitor pages show a brief "no data" note. |

**One report = one location.** Each run covers a single location — one organization +
one location + that location's LSG scan. For a **multi-location** client, run it once
per location with that location's IDs; there's no cross-location roll-up (and since
the map is about one physical address, keeping it per-location is what makes it
coherent).

### What you need to provide

Everything lives in a **single `.env` file** — copy `.env.example` to `.env` and fill
in the blanks. No JSON, no second file to edit.

- **Once per agency** (set and forget): your EMR host, your two API tokens (your **MCP
  token** and your agency/tenant token), and your branding (name, colours, logo).
- **Per report** (the handful of lines you change each time): the client's organization
  + location IDs, the LSG scan UUID and the keyword it tracks, the client's display
  name, and optionally the month.

### Configure a client — hand it to a coding agent

The easiest path: run a coding agent (e.g. Claude Code) **inside this folder**, with
your EMR MCP connected. It can look up the IDs, find the scan using the tenant token
that's already in your `.env`, and write everything in for you. Paste this:

```
You're in the emr-agency-report project folder. Configure a monthly report for my
client "<CLIENT NAME>" (location in <CITY / ADDRESS>). Do all of this, then stop:

1. If .env doesn't exist yet, copy it from .env.example.
2. Using my <YOUR EMR MCP NAME> MCP tools:
   - list_organizations → find the org matching the client; note its id.
   - list_locations (for that org) → find the location matching the address; note its id.
   - get_metrics and get_ai_insights for that organization_id + location_id to confirm data;
     tell me whether AI Insights exist (they drive the Voice-of-the-Customer page).
   - list_gbp_metrics for that location; tell me whether a Google Business Profile is
     connected (non-zero views).
3. Find the Local Search Grid scan (it's NOT on MCP — it's the Agency API). Read
   EMR_BASE_URL and EMR_TENANT_API_TOKEN from .env and list the scans:
     curl -s -H "Authorization: Bearer $EMR_TENANT_API_TOKEN" \
       "$EMR_BASE_URL/api/agency/v1/scans?per_page=100" | jq '.data'
   Pick the scan whose address matches the client; note its uuid and one keyword it tracks.
4. Write these into .env, updating each line in place (leave my tokens and branding alone):
   EMR_ORGANIZATION_ID, EMR_LOCATION_ID, EMR_SCAN_UUID, EMR_SCAN_KEYWORD,
   BUSINESS_NAME, BUSINESS_LOCATION_LABEL. Leave REPORT_MONTH blank (defaults to last month).
5. Show me the per-report block of .env you wrote, plus a one-line summary:
   AI Insights present? GBP connected? scan matched? Then I'll run `npm run report`.
```

If anything's ambiguous (two similar org names, no scan matches the address) the agent
will ask instead of guessing. Once it's written `.env`, run `npm run report`. Next
month, just rerun it (the month rolls forward on its own); to switch clients, re-run the
prompt with a different client.

### Prefer to do it by hand?

Get the org + location ids from the MCP (`list_organizations`, `list_locations`). For
the scan UUID, open the client's **Local Search Grid scan** in the EMR app — it's the
id in the page URL, between `/scans/` and `/report`:

```
https://app.your-white-label.com/scans/8ecf7dff-da7f-44a4-86a2-8bbe775a7f76/report
                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ copy this — the LSG scan UUID
```

(here that's `8ecf7dff-da7f-44a4-86a2-8bbe775a7f76`). Or list every scan via the Agency API:

```bash
curl -s -H "Authorization: Bearer $EMR_TENANT_API_TOKEN" \
  "$EMR_BASE_URL/api/agency/v1/scans?per_page=100" \
  | jq -r '.data[] | "\(.uuid)\t\(.address // "")"'
```

Then paste each value into the matching `.env` line:

| The value you found | The line in `.env` |
|---|---|
| organization id | `EMR_ORGANIZATION_ID=` |
| location id | `EMR_LOCATION_ID=` |
| scan UUID | `EMR_SCAN_UUID=` |
| keyword the scan tracks | `EMR_SCAN_KEYWORD=` |
| client's name + location label | `BUSINESS_NAME=` / `BUSINESS_LOCATION_LABEL=` |
| month to cover *(optional)* | `REPORT_MONTH=` — blank uses the previous complete month |

## What it produces (9 pages)

| # | Page | Built from |
|---|---|---|
| 1 | Cover (hero stats + table of contents) | metrics, LSG trends |
| 2 | Executive summary — scorecard with status pills, wins/priorities, last month's recommendations tracked | `get_metrics`, `get_ai_insights`, LSG insights |
| 3 | Reputation & reviews — KPIs, star/sentiment split, volume trend, per-platform table | `get_metrics`, AI insights |
| 4 | Voice of the customer — themes, category scores, keyword phrases, curated verbatim quotes | AI insights, `list_reviews` |
| 5 | Local map visibility — explainer, Leaflet grid map, strength by area | Agency REST `/api/agency/v1/scans/...` |
| 6 | Search performance — rank distribution, visibility/position trends, GBP views→calls funnel | LSG snapshots, `list_gbp_metrics`, `list_gbp_search_terms` |
| 7 | Competitive landscape — deduped competitor table with "you" row + data-driven takeaways | LSG insights |
| 8 | Action plan — 3 prioritized actions, quick-win checklist, next-steps strip | AI recommendations + quick wins, LSG recommendations |
| 9 | Methodology & glossary — data sources, metric definitions, disclaimers | static + scan metadata |

Output: `out/report.html` and `out/report.pdf`.

## Quick start (no tokens needed)

```bash
npm install
npx playwright install chromium      # one-time: downloads the headless browser
npm run report:demo                  # renders the bundled fictional sample → out/report.pdf
```

Set your branding in `.env` first (see below) and the demo renders in *your* brand,
so it doubles as a one-command preview to show prospects.

## How it works

```
.env  →  src/index.js  →  gather()  →  renderReport()  →  Playwright → PDF
          (Node CLI)      (fetch)      (HTML string)     (headless Chromium)
```

Two data sources, two tokens (both go in `.env`):

| Surface | Transport | Token |
|---|---|---|
| AI Insights, metrics, reviews, GBP | MCP JSON-RPC → `POST /api/mcp` | `EMR_MCP_TOKEN` — the bearer token from your EMR MCP connection (the same one your MCP client uses) |
| Local Search Grid (scans, insights, competitors) | Agency REST → `GET /api/agency/v1/...` | `EMR_TENANT_API_TOKEN` — **agency / tenant-owner** token, not a customer token |

Both surfaces live under the host you set in `EMR_BASE_URL` (your EMR app domain).

## Setup

```bash
npm install
npx playwright install chromium      # one-time: downloads the headless browser

cp .env.example .env                 # then fill it in (host, tokens, branding, the client)
```

`.env` is the **only file you edit** — it holds your EMR host, the two tokens, your
agency branding, and the client + month for the report. Every field is documented
inline in `.env.example`, and `.env` is gitignored so your tokens never get committed.
The demo (`npm run report:demo`) needs none of it and runs straight after install.

## Usage

```bash
npm run report                 # live fetch → HTML + PDF
npm run report:demo            # fictional sample data (demo/report-data.json) — no tokens needed
node src/index.js --month=2026-05   # override the report month (default: previous month)
npm run report:html            # HTML only (skip Playwright; open out/report.html in a browser)
npm run fetch                  # live fetch, save fixtures, HTML only
npm run report:fixtures        # render from cached out/fixtures/report-data.json (offline)
```

Flags: `--fixtures[=path]`, `--demo`, `--save-fixtures`, `--html-only`, `--month=YYYY-MM`.

Iterate on the template fast: `npm run report:demo -- --html-only` (or `npm run fetch`
once, then `npm run report:fixtures`) — no network beyond the map CDN, no token use.

## What to report on (the per-report lines in `.env`)

These are the values you change for each client/month (all documented in `.env.example`):

| Variable | What it is |
|---|---|
| `EMR_ORGANIZATION_ID` | the client's organization id (from `list_organizations`) |
| `EMR_LOCATION_ID` | the client's location id (from `list_locations`) |
| `EMR_SCAN_UUID` | the location's Local Search Grid scan |
| `EMR_SCAN_KEYWORD` | the keyword (tracked by that scan) the map + competitor pages centre on |
| `BUSINESS_NAME` | client name shown on the cover + footers |
| `BUSINESS_LOCATION_LABEL` | e.g. "City / Area", shown under the name |
| `REPORT_MONTH` | `YYYY-MM`; **leave blank** to use the previous complete month |

Advanced and optional (sensible defaults, uncomment in `.env.example` to change):
`REPORT_LOCALE`, `EMR_INCLUDE_GBP`, `EMR_HIGHLIGHT_COUNT`, `EMR_COMPETITOR_LIMIT`.

Pair the **same** business across both surfaces: `EMR_ORGANIZATION_ID` /
`EMR_LOCATION_ID` and `EMR_SCAN_UUID` should belong to one client, or the reputation
pages and the map pages will describe two different businesses.

## Branding (`.env`)

White-label is driven entirely from `.env` so your brand is set once and applies to
every report (and the demo):

| Variable | Sets |
|---|---|
| `AGENCY_NAME` | Cover wordmark + "Prepared by …" footers |
| `AGENCY_TAGLINE` | Strapline under the wordmark |
| `AGENCY_ACCENT` | Strong brand colour (headings, rules, charts) |
| `AGENCY_ACCENT_SOFT` | Pale tint for highlighted table rows |
| `AGENCY_LOGO_URL` | Optional public logo URL, shown instead of the wordmark |

## Demo / sample mode

`demo/report-data.json` is a committed, fully fictional dataset — **"Bluebird
Heating & Air"** in Boulder, CO — that tells one coherent story across all three
data surfaces. Use it to preview the layout, smoke-test a template change, or show
the format to a prospect without touching live data. `npm run report:demo` renders
it in whatever branding your `.env` carries.

## Architecture — built for a Cloudflare Worker upgrade

Everything except `src/render/pdf.node.js` is **portable** (depends only on `fetch`
+ string building) and runs unchanged on a Worker:

```
src/
  clients/        reviewsClient.js, lsgClient.js   ← portable (fetch)
  report/         gather.js, template.js, charts.js, map.js, format.js  ← portable
  render/
    pdf.node.js   ← Node-only (Playwright). The ONLY thing to swap.
  index.js        ← Node CLI wiring
```

To move to Cloudflare: keep `clients/` + `report/`, replace `pdf.node.js` with the
[Browser Rendering](https://developers.cloudflare.com/browser-rendering/) binding
(`env.BROWSER` → `puppeteer.launch` → `page.setContent(html)` → `page.pdf()`), and
turn `index.js` into a `fetch`/cron handler. Charts are inline SVG and the map is
Leaflet-from-CDN, so the rendered HTML is self-contained. On a Worker there is no
`out/` folder — the bytes come back in memory, so you'd return them over HTTP, store
them in R2, or email a link.

## Notes & limitations

- **Template chrome is English.** Review/AI content renders in whatever language the
  source data is in — it's data, not chrome.
- **AI Insights are pre-computed (typically weekly)**, so the latest insight period
  may not line up exactly with the report month. The Voice-of-the-customer page
  prints its own analysis period explicitly so the two never get conflated.
- **The GBP block auto-hides** when a location has no connected Google Business
  Profile (all-zero totals). Sections degrade to an explanatory empty state when
  their source is missing or a token is absent.
- **The map needs network at render time** (Leaflet CDN + OpenStreetMap tiles); the
  PDF renderer waits for tiles to paint before printing.
- Requires **Node ≥ 20.12** (uses `process.loadEnvFile`).

## License

MIT — see [LICENSE](LICENSE). Free to use, modify, and white-label, including for paid
client work; just keep the copyright notice. Provided **as is, without warranty** — you
run it against your own account and are responsible for what you send to clients.

> Independent tool — **not affiliated with or endorsed by EmbedMyReviews**. The licence
> covers only the code in this repo. You bring your own EMR account and API tokens, and
> your use of the EMR platform is governed by EMR's own terms; nothing here grants any
> rights to the EmbedMyReviews platform or API.
