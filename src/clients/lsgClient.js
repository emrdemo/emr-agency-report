// Local Search Grid (LSG) client — Agency REST API at {base}/api/agency/v1/scans.
// Agency-only: requires a tenant-owner token. Portable (fetch-only).

/**
 * @typedef {Object} LsgClientOptions
 * @property {string} baseUrl   e.g. https://app.your-white-label.com
 * @property {string} token     Agency / tenant-owner bearer token
 * @property {typeof fetch} [fetchImpl]
 */

export class LsgClient {
  /** @param {LsgClientOptions} opts */
  constructor({ baseUrl, token, fetchImpl }) {
    this.base = `${baseUrl.replace(/\/+$/, '')}/api/agency/v1`;
    this.token = token;
    this.fetch = fetchImpl ?? globalThis.fetch;
  }

  /**
   * @param {string} path  path under /api/agency/v1, e.g. `/scans/{uuid}/insights`
   * @param {Record<string, string|number|boolean|undefined>} [query]
   */
  async get(path, query = {}) {
    const url = new URL(`${this.base}${path}`);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const res = await this.fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`LSG GET ${path} → HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`);
    }
    return res.json();
  }

  /** List scans (metadata). Returns the full envelope ({ data, meta }). */
  listScans(query = {}) {
    return this.get('/scans', query);
  }

  /** One scan with per-pin results for a snapshot. Returns the `data` object. */
  async getScan(uuid, { snapshotAt, topN } = {}) {
    const json = await this.get(`/scans/${uuid}`, { snapshot_at: snapshotAt, top_n: topN });
    return json.data;
  }

  /** Deep insights: summary, trends, geographic strength, competitors, recommendations. */
  async getInsights(uuid, { keyword, snapshotAt } = {}) {
    const json = await this.get(`/scans/${uuid}/insights`, { keyword, snapshot_at: snapshotAt });
    return json.data;
  }

  /** Aggregated per-snapshot trend rows. Returns an array. */
  async getSnapshots(uuid, { keyword } = {}) {
    const json = await this.get(`/scans/${uuid}/snapshots`, { keyword });
    return json.data ?? [];
  }

  /**
   * Paginated per-pin data for one snapshot. Walks every page and returns the
   * flattened pin array plus the resolved meta (snapshot_at, keyword, top_n).
   */
  async getAllDataPoints(uuid, { keyword, snapshotAt, topN = 5, perPage = 500 } = {}) {
    /** @type {any[]} */
    const all = [];
    let page = 1;
    let meta = null;
    // Hard page cap guards against an unexpected pagination loop.
    for (let guard = 0; guard < 200; guard++) {
      const json = await this.get(`/scans/${uuid}/data_points`, {
        keyword,
        snapshot_at: snapshotAt,
        top_n: topN,
        per_page: perPage,
        page,
      });
      meta = json.meta ?? meta;
      const rows = json.data ?? [];
      all.push(...rows);
      const lastPage = json.meta?.last_page ?? 1;
      if (page >= lastPage || rows.length === 0) break;
      page += 1;
    }
    return { data: all, meta };
  }
}
