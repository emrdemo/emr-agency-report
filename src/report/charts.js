// Inline-SVG chart helpers. No JS execution, no canvas → renders perfectly in PDF.
import { esc } from './format.js';

/**
 * Donut chart from labelled segments.
 * @param {{label:string,value:number,color:string}[]} segments
 * @param {{ size?:number, thickness?:number, centerTop?:string, centerSub?:string }} [opts]
 */
export function donut(segments, opts = {}) {
  const size = opts.size ?? 160;
  const thickness = opts.thickness ?? 26;
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + (x.value || 0), 0);

  let offset = 0;
  const arcs = total <= 0
    ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e9e9f0" stroke-width="${thickness}" />`
    : segments
        .filter((s) => s.value > 0)
        .map((s) => {
          const frac = s.value / total;
          const dash = frac * circ;
          const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
            stroke="${s.color}" stroke-width="${thickness}"
            stroke-dasharray="${dash.toFixed(2)} ${(circ - dash).toFixed(2)}"
            stroke-dashoffset="${(-offset).toFixed(2)}"
            transform="rotate(-90 ${cx} ${cy})" />`;
          offset += dash;
          return seg;
        })
        .join('');

  const center = opts.centerTop
    ? `<text x="${cx}" y="${cy - 2}" text-anchor="middle" class="donut-top">${esc(opts.centerTop)}</text>
       <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="donut-sub">${esc(opts.centerSub ?? '')}</text>`
    : '';

  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="chart-donut" role="img">
    ${arcs}${center}
  </svg>`;
}

/** Legend rows for a set of segments, with values. */
export function legend(segments, formatValue = (v) => String(v)) {
  return `<ul class="legend">${segments
    .map(
      (s) => `<li><span class="legend-dot" style="background:${s.color}"></span>
        <span class="legend-label">${esc(s.label)}</span>
        <span class="legend-val">${esc(formatValue(s.value))}</span></li>`,
    )
    .join('')}</ul>`;
}

/**
 * Single horizontal stacked bar with a legend — a print-friendly alternative
 * to a donut when the segments are an exhaustive split of one total.
 * @param {{label:string,value:number,color:string}[]} segments
 */
export function stackbar(segments, formatValue = (v) => String(v)) {
  const total = Math.max(1, segments.reduce((s, x) => s + (x.value || 0), 0));
  const bar = segments
    .filter((s) => (s.value || 0) > 0)
    .map((s) => `<span class="stackbar-seg" style="width:${(((s.value || 0) / total) * 100).toFixed(2)}%;background:${s.color}"></span>`)
    .join('');
  return `<div class="stackbar"><div class="stackbar-track">${bar}</div>
    <div class="stackbar-legend">${segments
      .map((s) => `<span class="stackbar-key"><span class="legend-dot" style="background:${s.color}"></span>${esc(s.label)}&nbsp;<strong>${esc(formatValue(s.value || 0))}</strong></span>`)
      .join('')}</div></div>`;
}

/**
 * Horizontal bar rows (e.g. star distribution).
 * @param {{label:string,value:number,color?:string,caption?:string}[]} rows
 */
export function hbars(rows, opts = {}) {
  const max = Math.max(1, ...rows.map((r) => r.value || 0));
  const color = opts.color ?? 'var(--accent)';
  return `<div class="hbars">${rows
    .map((r) => {
      const w = ((r.value || 0) / max) * 100;
      return `<div class="hbar-row">
        <span class="hbar-label">${esc(r.label)}</span>
        <span class="hbar-track"><span class="hbar-fill" style="width:${w.toFixed(1)}%;background:${r.color ?? color}"></span></span>
        <span class="hbar-val">${esc(r.caption ?? r.value)}</span>
      </div>`;
    })
    .join('')}</div>`;
}

/**
 * Line/area sparkline for a series of numbers. Lower-is-better series can be
 * inverted so an improving line still trends upward visually.
 * @param {{x:string,y:number}[]} points
 */
export function sparkline(points, opts = {}) {
  const width = opts.width ?? 520;
  const height = opts.height ?? 120;
  const pad = { t: 12, r: 12, b: 22, l: 32 };
  const color = opts.color ?? '#15554a';
  const invert = opts.invert ?? false;

  const ys = points.map((p) => p.y).filter((y) => y !== null && !Number.isNaN(y));
  if (points.length < 2 || ys.length < 2) {
    return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="chart-spark"></svg>`;
  }
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const sx = (i) => pad.l + (i / (points.length - 1)) * innerW;
  const sy = (y) => {
    const norm = (y - min) / (max - min);
    const v = invert ? norm : 1 - norm;
    return pad.t + v * innerH;
  };

  const linePts = points.map((p, i) => `${sx(i).toFixed(1)},${sy(p.y).toFixed(1)}`);
  const areaPath = `M ${linePts[0]} L ${linePts.join(' L ')} L ${sx(points.length - 1).toFixed(1)},${(pad.t + innerH).toFixed(1)} L ${sx(0).toFixed(1)},${(pad.t + innerH).toFixed(1)} Z`;
  const dots = points
    .map((p, i) => `<circle cx="${sx(i).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="2.6" fill="${color}" />`)
    .join('');

  // Sparse x labels: first, middle, last (end labels anchored inward so they
  // don't clip at the chart edges).
  const idxs = [0, Math.floor((points.length - 1) / 2), points.length - 1];
  const xlabels = [...new Set(idxs)]
    .map((i) => {
      const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
      const x = i === 0 ? Math.max(0, pad.l - 14) : sx(i);
      return `<text x="${x.toFixed(1)}" y="${height - 6}" text-anchor="${anchor}" class="spark-x">${esc(points[i].x)}</text>`;
    })
    .join('');

  // The top of the chart shows the best value: max normally, min when inverted.
  const topVal = invert ? min : max;
  const bottomVal = invert ? max : min;
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="chart-spark" role="img">
    <path d="${areaPath}" fill="${color}" opacity="0.10" />
    <polyline points="${linePts.join(' ')}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" />
    ${dots}
    <text x="${pad.l - 6}" y="${(pad.t + 4).toFixed(1)}" text-anchor="end" class="spark-y">${esc(opts.fmt ? opts.fmt(topVal) : topVal)}</text>
    <text x="${pad.l - 6}" y="${(pad.t + innerH).toFixed(1)}" text-anchor="end" class="spark-y">${esc(opts.fmt ? opts.fmt(bottomVal) : bottomVal)}</text>
    ${xlabels}
  </svg>`;
}
