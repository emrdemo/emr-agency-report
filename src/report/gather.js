// Orchestration: pull every data source and normalise into one ReportData object.
// Portable — takes already-constructed clients, so the same function works in Node
// or a Worker. All optional sources fail soft (null) so one gap never kills the report.
import { monthRange } from './format.js';

/**
 * @param {{ reviews: import('../clients/reviewsClient.js').ReviewsClient,
 *           lsg: import('../clients/lsgClient.js').LsgClient }} clients
 * @param {any} config
 */
export async function gather(clients, config) {
  const range = monthRange(config.reportMonth);
  const [reviews, lsg] = await Promise.all([
    gatherReviews(clients.reviews, config, range),
    gatherLsg(clients.lsg, config),
  ]);

  return {
    meta: {
      reportMonth: config.reportMonth,
      range,
      generatedAt: new Date().toISOString(),
      locale: config.locale ?? 'fi-FI',
      branding: config.branding ?? {},
      business: config.business ?? {},
    },
    reviews,
    lsg,
  };
}

async function soft(promise) {
  try {
    return await promise;
  } catch (err) {
    return { __error: String(err?.message ?? err) };
  }
}

async function gatherReviews(client, config, range) {
  const { organizationId: organization_id, locationId: location_id } = config.reviews;
  const [metrics, insights, highlights] = await Promise.all([
    soft(
      client.getMetrics({
        organization_id,
        location_id,
        date_from: range.from,
        date_to: range.to,
        compare_to_date_from: range.prevFrom,
        compare_to_date_to: range.prevTo,
      }),
    ),
    soft(client.getAiInsights({ organization_id, location_id })),
    soft(
      client.listReviews({
        organization_id,
        location_id,
        sort_by: 'Newest First',
        per_page: config.reviews.highlightCount ?? 4,
        min_message_length: 1,
      }),
    ),
  ]);

  let gbp = null;
  if (config.reviews.includeGbp) {
    const [y, m] = config.reportMonth.split('-').map(Number);
    const [gbpMetrics, gbpTerms] = await Promise.all([
      soft(client.listGbpMetrics({ location_id, from: range.from, to: range.to })),
      soft(client.listGbpSearchTerms({ location_id, year: y, month: m, per_page: 10 })),
    ]);
    gbp = { metrics: unwrap(gbpMetrics), searchTerms: unwrap(gbpTerms) };
  }

  // Normalise: some orgs return deltas at the top level, others nest them under
  // `comparison.deltas`. Hoist so the template can always read `metrics.deltas`.
  const m = unwrap(metrics);
  if (m && !m.deltas && m.comparison?.deltas) m.deltas = m.comparison.deltas;

  return {
    metrics: m,
    insights: insights && !insights.__error ? insights : null,
    highlights: unwrap(highlights)?.data ?? [],
    gbp,
  };
}

async function gatherLsg(client, config) {
  const { scanUuid, primaryKeyword } = config.lsg;

  // Scan metadata (location, keywords, summary, available snapshots, target coords).
  const scanMeta = await soft(findScanMeta(client, scanUuid));
  const meta = unwrap(scanMeta);
  const available = meta?.available_snapshots ?? [];
  const snapshotAt = selectSnapshot(available, config.reportMonth);

  const [insights, snapshots, pinsResult] = await Promise.all([
    soft(client.getInsights(scanUuid, { snapshotAt })),
    soft(client.getSnapshots(scanUuid)),
    soft(client.getAllDataPoints(scanUuid, { keyword: primaryKeyword, snapshotAt, topN: 5 })),
  ]);

  const pinsData = unwrap(pinsResult);
  return {
    scanUuid,
    primaryKeyword,
    meta,
    snapshotAt,
    insights: clean(insights),
    snapshots: unwrap(snapshots) ?? [],
    pins: pinsData?.data ?? [],
    pinsMeta: pinsData?.meta ?? null,
    center: resolveCenter(meta, pinsData?.data ?? []),
  };
}

/** Find a scan's metadata row by UUID via the list endpoint (cheaper than get_scan). */
async function findScanMeta(client, uuid) {
  let page = 1;
  for (let guard = 0; guard < 50; guard++) {
    const json = await client.listScans({ per_page: 100, page, include_archived: true });
    const hit = (json.data ?? []).find((s) => s.uuid === uuid);
    if (hit) return hit;
    const last = json.meta?.last_page ?? 1;
    if (page >= last) break;
    page += 1;
  }
  // Fall back to the per-scan endpoint (returns the same metadata fields).
  return client.getScan(uuid, { topN: 0 });
}

/** Latest snapshot whose month is <= the report month; else the most recent. */
function selectSnapshot(available, reportMonth) {
  if (!available?.length) return undefined;
  const sorted = [...available].sort();
  const within = sorted.filter((s) => String(s).slice(0, 7) <= reportMonth);
  return (within.length ? within[within.length - 1] : sorted[sorted.length - 1]);
}

function resolveCenter(meta, pins) {
  const lat = Number(meta?.target_place_lat);
  const lng = Number(meta?.target_place_lng);
  if (!Number.isNaN(lat) && !Number.isNaN(lng) && lat && lng) return { lat, lng };
  if (pins.length) {
    const avg = pins.reduce((a, p) => ({ lat: a.lat + p.lat, lng: a.lng + p.lng }), { lat: 0, lng: 0 });
    return { lat: avg.lat / pins.length, lng: avg.lng / pins.length };
  }
  return { lat: 0, lng: 0 };
}

function unwrap(v) {
  return v && v.__error ? null : v ?? null;
}
function clean(v) {
  return v && v.__error ? null : v ?? null;
}
