// Formatting + small domain helpers. Portable (no Node/DOM APIs).

/** Escape a string for safe interpolation into HTML text/attributes. */
export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function makeFormatters(locale = 'fi-FI') {
  const num = (v, opts = {}) =>
    v === null || v === undefined || Number.isNaN(Number(v))
      ? '–'
      : new Intl.NumberFormat(locale, opts).format(Number(v));

  return {
    int: (v) => num(v, { maximumFractionDigits: 0 }),
    dec: (v, d = 1) => num(v, { minimumFractionDigits: d, maximumFractionDigits: d }),
    /** A 0..1 ratio as a percentage. */
    pct: (v, d = 0) =>
      v === null || v === undefined ? '–' : `${num(v * 100, { maximumFractionDigits: d })}%`,
    /** A value already expressed in percent points (e.g. 24.5 → "24.5%"). */
    pctPoints: (v, d = 1) =>
      v === null || v === undefined ? '–' : `${num(v, { maximumFractionDigits: d })}%`,
    monthLabel: (ym) => formatMonth(ym, locale),
    date: (iso) => formatDate(iso, locale),
  };
}

function formatMonth(ym, locale) {
  // ym = "2026-05"
  const [y, m] = String(ym).split('-').map(Number);
  if (!y || !m) return String(ym);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

function formatDate(iso, locale) {
  if (!iso) return '–';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

/** First and last day (YYYY-MM-DD) of a "YYYY-MM" month, plus the previous month's range. */
export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 0));
  const prevStart = new Date(Date.UTC(y, m - 2, 1));
  const prevEnd = new Date(Date.UTC(y, m - 1, 0));
  const fmt = (d) => d.toISOString().slice(0, 10);
  return {
    from: fmt(start),
    to: fmt(end),
    prevFrom: fmt(prevStart),
    prevTo: fmt(prevEnd),
  };
}

/** Render a delta with sign + arrow. `goodWhenUp` flips the colour semantics. */
export function deltaBadge(value, { goodWhenUp = true, suffix = '', digits = 1, fmt } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '<span class="delta delta--flat">–</span>';
  }
  const v = Number(value);
  const rounded = Number(v.toFixed(digits));
  const dir = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  const good = rounded === 0 ? 'flat' : (rounded > 0) === goodWhenUp ? 'good' : 'bad';
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■';
  const shown = fmt ? fmt(Math.abs(rounded)) : `${Math.abs(rounded)}${suffix}`;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return `<span class="delta delta--${good}">${arrow} ${sign}${esc(shown)}</span>`;
}

// -- Local Search Grid rank bands ----------------------------------------

export const RANK_BANDS = [
  { key: 'top3', label: 'Positions 1–3', min: 1, max: 3, color: '#2e7d52' },
  { key: 'top10', label: 'Positions 4–10', min: 4, max: 10, color: '#8aab5c' },
  { key: 'below', label: 'Positions 11–20', min: 11, max: 20, color: '#c9962f' },
  { key: 'nr', label: 'Not ranked', min: null, max: null, color: '#a93f2e' },
];

/** Map a rank (or null/NR) to its band descriptor. */
export function rankBand(rank) {
  if (rank === null || rank === undefined || rank > 20) return RANK_BANDS[3];
  for (const b of RANK_BANDS) {
    if (b.min !== null && rank >= b.min && rank <= b.max) return b;
  }
  return RANK_BANDS[3];
}

export function rankLabel(rank) {
  return rank === null || rank === undefined ? 'NR' : String(rank);
}
