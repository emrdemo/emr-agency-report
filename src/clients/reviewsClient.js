// Reviews MCP client — talks JSON-RPC 2.0 to {base}/api/mcp.
// Covers the review-side surface: AI Insights, aggregate metrics, reviews, GBP.
// Portable: depends only on a `fetch` implementation (global in Node 18+ and Workers).

/**
 * @typedef {Object} ReviewsClientOptions
 * @property {string} baseUrl   e.g. https://app.your-white-label.com
 * @property {string} token     Reviews MCP bearer token
 * @property {typeof fetch} [fetchImpl]
 */

export class ReviewsClient {
  /** @param {ReviewsClientOptions} opts */
  constructor({ baseUrl, token, fetchImpl }) {
    this.endpoint = `${baseUrl.replace(/\/+$/, '')}/api/mcp`;
    this.token = token;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this._id = 0;
  }

  /**
   * Call one MCP tool and return its structured result.
   * Returns `null` when the server responds with a JSON-RPC error whose code is
   * in `softErrorCodes` (e.g. -32002 "AI insight not found"), so callers can treat
   * "no data" as an empty section instead of a hard failure.
   * @param {string} name
   * @param {Record<string, unknown>} [args]
   * @param {{ softErrorCodes?: number[] }} [opts]
   */
  async call(name, args = {}, opts = {}) {
    const body = {
      jsonrpc: '2.0',
      id: ++this._id,
      method: 'tools/call',
      params: { name, arguments: args },
    };

    const res = await this.fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`MCP ${name} → HTTP ${res.status} ${res.statusText}`);
    }

    const json = await res.json();

    if (json.error) {
      const soft = opts.softErrorCodes ?? [];
      if (soft.includes(json.error.code)) return null;
      throw new Error(`MCP ${name} → error ${json.error.code}: ${json.error.message}`);
    }

    const result = json.result ?? {};
    if (result.isError) {
      const text = result.content?.[0]?.text ?? 'unknown tool error';
      throw new Error(`MCP ${name} → tool error: ${text}`);
    }

    // Prefer structuredContent; fall back to the text content block (JSON string).
    if (result.structuredContent !== undefined) return result.structuredContent;
    const text = result.content?.[0]?.text;
    if (typeof text === 'string') {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    return result;
  }

  // -- Convenience wrappers ------------------------------------------------

  listOrganizations(args = {}) {
    return this.call('list_organizations', args);
  }

  listLocations(args = {}) {
    return this.call('list_locations', args);
  }

  /** Pre-computed AI analysis. Returns null when none exists for the scope. */
  getAiInsights(args) {
    return this.call('get_ai_insights', args, { softErrorCodes: [-32002] });
  }

  /** Aggregate review metrics, optionally with a comparison period. */
  getMetrics(args) {
    return this.call('get_metrics', args);
  }

  listReviews(args = {}) {
    return this.call('list_reviews', args);
  }

  /** GBP performance — may be unavailable for a location; caller handles null. */
  listGbpMetrics(args) {
    return this.call('list_gbp_metrics', args, { softErrorCodes: [-32002, -32601] });
  }

  listGbpSearchTerms(args) {
    return this.call('list_gbp_search_terms', args, { softErrorCodes: [-32002, -32601] });
  }
}
