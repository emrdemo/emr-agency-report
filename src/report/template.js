// ReportData -> full HTML document. Portable (string assembly only).
//
// Page structure (an agency-style deliverable, not a data dump):
//   Cover → Executive summary → Reputation → Voice of the customer →
//   Map visibility → Search performance → Competitive landscape →
//   Action plan → Methodology & glossary
import { esc, makeFormatters, deltaBadge, RANK_BANDS } from './format.js';
import { donut, legend, hbars, sparkline, stackbar } from './charts.js';
import { buildMap } from './map.js';

const TREND_EN = {
  stable: 'Stable', improving: 'Improving', declining: 'Declining',
  new: 'New', growing: 'Growing', up: 'Up', down: 'Down', flat: 'Flat',
};
const URGENCY_EN = { critical: 'Critical', high: 'High priority', medium: 'Medium priority', low: 'Low priority' };
const EFFORT_EN = { quick_win: 'Quick win', moderate: 'Moderate effort', major_initiative: 'Major initiative' };
const STATUS_EN = { improving: 'Improving', improved: 'Improved', resolved: 'Done', unchanged: 'Unchanged', declining: 'Declining' };

export function renderReport(data) {
  const f = makeFormatters(data.meta.locale);
  const accent = data.meta.branding.accent ?? '#15554a';
  const accentSoft = data.meta.branding.accentSoft ?? '#ecf2ee';

  // Build content pages first so the cover can print a real table of contents.
  const sections = [
    { id: '01', title: 'Executive summary', render: executiveSummaryPage },
    { id: '02', title: 'Reputation & reviews', render: reputationPage },
    { id: '03', title: 'Voice of the customer', render: voicePage },
    { id: '04', title: 'Local map visibility', render: visibilityMapPage },
    { id: '05', title: 'Search performance', render: searchPerformancePage },
    { id: '06', title: 'Competitive landscape', render: competitorsPage },
    { id: '07', title: 'Action plan', render: actionPlanPage },
    { id: '08', title: 'Methodology & glossary', render: appendixPage },
  ];
  const total = sections.length + 1;

  const pages = [coverPage(data, f, sections)];
  sections.forEach((s, i) => {
    pages.push(pageShell(s.render(data, f, s), { data, f, pageNo: i + 2, total }));
  });

  return `<!doctype html>
<html lang="${esc(data.meta.locale.split('-')[0])}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(data.meta.business.name ?? 'Client')} — Monthly Performance Report — ${esc(f.monthLabel(data.meta.reportMonth))}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,500&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>:root{--accent:${accent};--accent-soft:${accentSoft};}</style>
<link rel="stylesheet" href="${data.meta.__stylesHref ?? '../assets/styles.css'}" />
${data.meta.__inlineStyles ? `<style>${data.meta.__inlineStyles}</style>` : ''}
</head>
<body>
${pages.join('\n')}
</body>
</html>`;
}

// ------------------------------------------------------------- page chrome ----

function pageShell(content, { data, f, pageNo, total }) {
  const brand = data.meta.branding;
  return `<section class="page">
  <div class="page-body">${content}</div>
  <footer class="page-foot">
    <span>${esc(brand.productName ?? '')}${brand.tagline ? ` · ${esc(brand.tagline)}` : ''}</span>
    <span>${esc(data.meta.business.name ?? '')} — ${esc(f.monthLabel(data.meta.reportMonth))}</span>
    <span class="page-foot-no">${String(pageNo).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span>
  </footer>
</section>`;
}

function sectionHead(sec, sub) {
  return `<header class="sec-head">
    <div class="sec-kicker">Section ${esc(sec.id)}</div>
    <h2 class="sec-title">${esc(sec.title)}</h2>
    ${sub ? `<p class="sec-sub">${sub}</p>` : ''}
  </header>`;
}

function pill(label, kind) {
  return `<span class="pill pill--${kind}">${esc(label)}</span>`;
}

function tag(text, kind = '') {
  return `<span class="tag ${kind ? `tag--${kind}` : ''}">${esc(text)}</span>`;
}

function note(text) {
  return `<p class="footnote">${text}</p>`;
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

/** Shorten long copy at a sentence boundary instead of mid-word. */
function clipSentence(str, n) {
  if (!str || str.length <= n) return str ?? '';
  const cut = str.indexOf('. ', 50);
  return cut > 0 && cut < n ? str.slice(0, cut + 1) : truncate(str, n);
}

function pctChange(cur, prev) {
  if (cur == null || prev == null || !Number(prev)) return null;
  return ((cur - prev) / prev) * 100;
}

// ---------------------------------------------------------------- 1 · Cover ----

function coverPage(data, f, sections) {
  const b = data.meta.business;
  const brand = data.meta.branding;
  const t = data.reviews.metrics?.totals;
  const tf = data.lsg.insights?.trends_vs_first_snapshot;

  const heroStats = [
    t && { value: f.int(t.total_reviews), label: `new reviews in ${f.monthLabel(data.meta.reportMonth).split(' ')[0]}` },
    t && { value: `${f.dec(t.avg_rating, 1)}★`, label: 'average rating' },
    tf?.improved && tf.percent_change != null && {
      value: `+${f.dec(tf.percent_change, 1)}%`,
      label: `map-rank improvement since ${shortMonthYear(tf.first_snapshot_at, f)}`,
    },
  ].filter(Boolean);

  const toc = sections
    .map((s, i) => `<li><span class="toc-no">${esc(s.id)}</span><span class="toc-title">${esc(s.title)}</span><span class="toc-line"></span><span class="toc-page">${String(i + 2).padStart(2, '0')}</span></li>`)
    .join('');

  return `<section class="page page--cover">
  <header class="cover-head">
    <div>
      ${brand.logoUrl ? `<img src="${esc(brand.logoUrl)}" alt="" class="cover-logo" />` : `<div class="cover-wordmark">${esc(brand.productName ?? 'Agency')}</div>`}
      ${brand.tagline ? `<div class="cover-tagline">${esc(brand.tagline)}</div>` : ''}
    </div>
    <div class="cover-doctype">Monthly Performance<br/>Report</div>
  </header>

  <div class="cover-main">
    <div class="cover-kicker">Prepared for</div>
    <h1 class="cover-name">${esc(b.name ?? 'Client')}</h1>
    ${b.locationLabel ? `<div class="cover-loc">${esc(b.locationLabel)}</div>` : ''}
    <div class="cover-period">${esc(f.monthLabel(data.meta.reportMonth))}</div>
  </div>

  ${heroStats.length ? `<div class="cover-stats">${heroStats
    .map((s) => `<div class="cover-stat"><div class="cover-stat-val">${esc(s.value)}</div><div class="cover-stat-label">${esc(s.label)}</div></div>`)
    .join('<div class="cover-stat-rule"></div>')}</div>` : ''}

  <div class="cover-toc">
    <div class="cover-toc-head">In this report</div>
    <ul class="toc">${toc}</ul>
  </div>

  <footer class="cover-foot">
    <span>Prepared by ${esc(brand.productName ?? '')} · ${esc(f.date(data.meta.generatedAt))}</span>
    ${brand.sampleNote ? `<span class="sample-tag">${esc(brand.sampleNote)}</span>` : `<span>Confidential — prepared for ${esc(b.name ?? 'the client')}</span>`}
  </footer>
</section>`;
}

function shortMonthYear(iso, f) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(d);
}

// -------------------------------------------------- 2 · Executive summary ----

function executiveSummaryPage(data, f, sec) {
  const t = data.reviews.metrics?.totals;
  const c = data.reviews.metrics?.comparison?.totals;
  const d = data.reviews.metrics?.deltas;
  const ai = data.reviews.insights?.analysis;
  const lsg = data.lsg.insights;
  const targets = data.meta.targets ?? {};

  const lead = ai?.executive_summary
    ? `<div class="lead">
        <p class="lead-text">${esc(ai.executive_summary)}</p>
        ${ai.insights?.benchmark_note ? `<p class="lead-bench">${esc(ai.insights.benchmark_note)}</p>` : ''}
      </div>`
    : '';

  // -- Scorecard ---------------------------------------------------------
  const rows = [];
  if (t) {
    rows.push(scoreRow('Reviews received', f.int(t.total_reviews), c && f.int(c.total_reviews),
      deltaBadge(d?.total_reviews?.absolute),
      (d?.total_reviews?.absolute ?? 0) >= 0 ? ['On track', 'good'] : ['Monitor', 'warn']));
    rows.push(scoreRow('Average rating', `${f.dec(t.avg_rating, 2)}★`, c && `${f.dec(c.avg_rating, 2)}★`,
      deltaBadge(d?.avg_rating?.absolute, { suffix: '★', digits: 2 }),
      t.avg_rating < 4.0 ? ['Needs attention', 'bad'] : (d?.avg_rating?.absolute ?? 0) <= -0.1 ? ['Monitor', 'warn'] : ['On track', 'good']));
    rows.push(scoreRow('Review response rate', f.pct(t.response_rate), c && f.pct(c.response_rate),
      deltaBadge((d?.response_rate?.absolute ?? 0) * 100, { suffix: ' pp' }),
      targets.response_rate && t.response_rate >= targets.response_rate ? ['On track', 'good']
        : (d?.response_rate?.absolute ?? 0) > 0 ? ['Monitor', 'warn'] : ['Needs attention', 'bad'],
      targets.response_rate ? `target ${f.pct(targets.response_rate)}` : null));
  }
  if (ai?.review_score) {
    rows.push(scoreRow('Review score', `${f.int(ai.review_score.overall)} / 100`,
      ai.review_score.previous != null ? `${f.int(ai.review_score.previous)} / 100` : null,
      deltaBadge(ai.review_score.delta),
      (ai.review_score.delta ?? 0) >= 0 ? ['On track', 'good'] : ['Monitor', 'warn']));
  }
  if (lsg?.summary) {
    const visDelta = lsg.trends_vs_previous_snapshot?.visibility_change;
    rows.push(scoreRow('Map visibility', f.pctPoints(lsg.summary.visibility_score),
      lsg.trends_vs_previous_snapshot?.previous_summary ? f.pctPoints(lsg.trends_vs_previous_snapshot.previous_summary.visibility_score) : null,
      deltaBadge(visDelta, { suffix: ' pp' }),
      targets.visibility && lsg.summary.visibility_score >= targets.visibility ? ['On track', 'good']
        : (visDelta ?? 0) >= 0 ? ['Monitor', 'warn'] : ['Needs attention', 'bad'],
      targets.visibility ? `target ${f.pctPoints(targets.visibility, 0)}` : null));
    const rankDelta = lsg.trends_vs_previous_snapshot?.avg_rank_change;
    rows.push(scoreRow('Average map position', f.dec(lsg.summary.avg_rank),
      lsg.trends_vs_previous_snapshot?.previous_summary ? f.dec(lsg.trends_vs_previous_snapshot.previous_summary.avg_rank) : null,
      deltaBadge(rankDelta, { goodWhenUp: false }),
      (rankDelta ?? 0) <= 0 ? ['On track', 'good'] : ['Monitor', 'warn']));
  }

  const scorecard = rows.length
    ? `<div class="block">
        <h3 class="block-title">The month on one card</h3>
        <table class="dtable scorecard">
          <thead><tr><th>Metric</th><th>This month</th><th>Last month</th><th>Change</th><th>Status</th></tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>`
    : '';

  // -- Wins / priorities ---------------------------------------------------
  // (Resolved action-tracking items are deliberately excluded — they get their
  // own accountability block below.)
  const tracked = ai?.action_tracking ?? [];
  const wins = [];
  if (ai?.insights?.top_strength) wins.push(ai.insights.top_strength);
  if (ai?.insights?.competitive_advantage) wins.push(ai.insights.competitive_advantage);
  for (const r of data.lsg.insights?.recommendations ?? []) if (r.type === 'success') wins.push(r.description);

  const priorities = [];
  if (ai?.insights?.biggest_concern) priorities.push(ai.insights.biggest_concern);
  if (ai?.insights?.improvement_opportunity) priorities.push(ai.insights.improvement_opportunity);
  for (const r of data.lsg.insights?.recommendations ?? []) if (r.type === 'warning') priorities.push(r.description);

  const winsPriorities = (wins.length || priorities.length)
    ? `<div class="grid-2 block">
        <div class="callout callout--good">
          <h3 class="callout-title">Working in your favor</h3>
          <ul class="plainlist">${wins.slice(0, 3).map((w) => `<li>${esc(clipSentence(w, 175))}</li>`).join('')}</ul>
        </div>
        <div class="callout callout--warn">
          <h3 class="callout-title">Where we're focused</h3>
          <ul class="plainlist">${priorities.slice(0, 3).map((p) => `<li>${esc(clipSentence(p, 175))}</li>`).join('')}</ul>
        </div>
      </div>`
    : '';

  // -- Accountability --------------------------------------------------------
  const tracking = tracked.length
    ? `<div class="block">
        <h3 class="block-title">Last month's recommendations — where they stand</h3>
        ${tracked.map((tr) => `<div class="track">
          <div class="track-top"><strong>${esc(tr.previous_recommendation)}</strong>${pill(STATUS_EN[tr.current_status] ?? tr.current_status, tr.current_status === 'resolved' ? 'good' : tr.current_status === 'improving' || tr.current_status === 'improved' ? 'good' : 'warn')}</div>
          <div class="track-bar"><span style="width:${Math.max(0, Math.min(100, tr.progress_percentage || 0))}%"></span></div>
          ${tr.verdict ? `<p class="track-verdict">${esc(tr.verdict)}</p>` : ''}
          ${tr.evidence ? `<p class="track-evidence">${esc(tr.evidence)}</p>` : ''}
        </div>`).join('')}
      </div>`
    : '';

  return `${sectionHead(sec, `${esc(f.monthLabel(data.meta.reportMonth))} · all changes vs the previous month`)}
  ${lead}
  ${scorecard}
  ${winsPriorities}
  ${tracking}`;
}

function scoreRow(metric, cur, prev, delta, [statusLabel, statusKind], targetNote = null) {
  return `<tr>
    <td class="sc-metric">${esc(metric)}${targetNote ? `<span class="sc-target">${esc(targetNote)}</span>` : ''}</td>
    <td class="sc-cur">${cur ?? '–'}</td>
    <td>${prev ?? '–'}</td>
    <td>${delta ?? ''}</td>
    <td>${pill(statusLabel, statusKind)}</td>
  </tr>`;
}

// ------------------------------------------------------- 3 · Reputation ----

function reputationPage(data, f, sec) {
  const m = data.reviews.metrics;
  const ai = data.reviews.insights?.analysis;
  if (!m?.totals) {
    return `${sectionHead(sec, '')}<div class="empty"><p>No review data was available for this period.</p></div>`;
  }
  const t = m.totals;
  const d = m.deltas;

  const kpis = [
    ['Reviews received', f.int(t.total_reviews), deltaBadge(d?.total_reviews?.absolute)],
    ['Average rating', `${f.dec(t.avg_rating, 2)}★`, deltaBadge(d?.avg_rating?.absolute, { suffix: '★', digits: 2 })],
    ['Response rate', f.pct(t.response_rate), deltaBadge((d?.response_rate?.absolute ?? 0) * 100, { suffix: ' pp' })],
    ai?.review_score && ['Review score', `${f.int(ai.review_score.overall)} / 100`, deltaBadge(ai.review_score.delta)],
  ].filter(Boolean);

  let starBars = '<p class="dim">No data.</p>';
  if (t.star_distribution) {
    const sd = t.star_distribution;
    const rows = [5, 4, 3, 2, 1].map((s) => ({
      label: `${s}★`, value: sd[s] ?? 0,
      color: s >= 4 ? 'var(--good)' : s === 3 ? 'var(--warn)' : 'var(--bad)',
    }));
    starBars = hbars(rows);
  }

  let sentiment = '<p class="dim">No data.</p>';
  if (t.sentiment_distribution) {
    const s = t.sentiment_distribution;
    const segs = [
      { label: 'Positive', value: s.positive ?? 0, color: '#2e7d52' },
      { label: 'Neutral', value: s.neutral ?? 0, color: '#c9962f' },
      { label: 'Negative', value: s.negative ?? 0, color: '#a93f2e' },
    ];
    const totalN = segs.reduce((a, x) => a + x.value, 0);
    sentiment = `<div class="donut-wrap">${donut(segs, { size: 132, thickness: 20, centerTop: f.int(totalN), centerSub: 'reviews' })}${legend(segs, (v) => f.int(v))}</div>`;
  }

  const trend = ai?.temporal_patterns?.monthly_trend ?? [];
  const trendChart = trend.length >= 2
    ? `<div class="block"><h3 class="block-title">Review volume — last ${trend.length} months</h3>${sparkline(trend.map((p) => ({ x: p.month, y: p.volume })), { fmt: (v) => f.int(v), width: 660, height: 150 })}</div>`
    : '';

  const sources = (ai?.source_analysis ?? []);
  const sourceTable = sources.length
    ? `<div class="block"><h3 class="block-title">Where your reviews come from</h3>
      <table class="dtable">
        <thead><tr><th>Platform</th><th>Reviews</th><th>Rating</th><th>Responded</th><th>Most-mentioned theme</th></tr></thead>
        <tbody>${sources.map((s) => `<tr>
          <td class="sc-metric">${esc(s.source)}</td>
          <td>${f.int(s.review_count)}</td>
          <td>${f.dec(s.avg_rating, 1)}★</td>
          <td>${s.response_rate != null ? `${f.int(s.response_rate)}%` : '–'}</td>
          <td class="td-note">${esc(s.top_theme ?? '–')}</td>
        </tr>`).join('')}</tbody>
      </table>
      ${sources[0]?.notable ? note(esc(sources[0].notable)) : ''}
    </div>`
    : '';

  const seasonal = ai?.temporal_patterns?.seasonal_note
    ? `<div class="aside">${esc(ai.temporal_patterns.seasonal_note)}</div>` : '';

  return `${sectionHead(sec, `${esc(f.monthLabel(data.meta.reportMonth))} · compared with the previous month`)}
  <div class="kpi-row block">${kpis.map(([l, v, dl]) => `<div class="kpi"><div class="kpi-label">${esc(l)}</div><div class="kpi-value">${v}</div><div class="kpi-delta">${dl ?? ''}</div></div>`).join('')}</div>
  <div class="grid-2 block">
    <div><h3 class="block-title">Rating distribution</h3>${starBars}</div>
    <div><h3 class="block-title">Sentiment</h3>${sentiment}</div>
  </div>
  ${trendChart}
  ${sourceTable}
  ${seasonal}`;
}

// ------------------------------------------- 4 · Voice of the customer ----

function voicePage(data, f, sec) {
  const ins = data.reviews.insights;
  if (!ins?.analysis) {
    return `${sectionHead(sec, '')}<div class="empty"><p>Review analysis has not been computed for this location yet.</p></div>`;
  }
  const a = ins.analysis;
  const sub = `What ${esc(String(ins.text_review_count ?? ins.review_count ?? ''))} written reviews said between ${esc(f.date(ins.period_start))} and ${esc(f.date(ins.period_end))}, read and grouped by theme`;

  const renderTheme = (t, kind) => `<div class="theme theme--${kind}">
    <div class="theme-head"><strong>${esc(t.topic)}</strong><span class="theme-meta">${f.int(t.count)} mentions${t.trend ? ` · ${esc(TREND_EN[t.trend] ?? t.trend)}` : ''}</span></div>
    ${t.sample_quote ? `<p class="theme-quote">“${esc(t.sample_quote)}”</p>` : ''}
  </div>`;
  const pos = (a.themes?.positive ?? []).slice(0, 3).map((t) => renderTheme(t, 'pos')).join('');
  const neg = (a.themes?.negative ?? []).slice(0, 3).map((t) => renderTheme(t, 'neg')).join('');
  const themes = (pos || neg)
    ? `<div class="grid-2 block">
        <div><h3 class="block-title block-title--good">What customers praise</h3>${pos || '<p class="dim">No recurring positive themes this period.</p>'}</div>
        <div><h3 class="block-title block-title--bad">What costs you stars</h3>${neg || '<p class="dim">No recurring complaints this period.</p>'}</div>
      </div>`
    : '';

  const cats = (a.categories ?? []).slice(0, 4);
  const categories = cats.length
    ? `<div class="block"><h3 class="block-title">Service categories, scored from review content</h3>
      <div class="cats">${cats.map((cat) => `<div class="cat">
        <div class="cat-top"><strong>${esc(cat.name)}</strong><span class="cat-score">${f.int(cat.score)}<span class="dim">/100</span> ${deltaBadge(cat.delta)}</span></div>
        <div class="cat-bar"><span style="width:${Math.max(0, Math.min(100, cat.score))}%;background:${cat.strength ? 'var(--good)' : 'var(--warn)'}"></span></div>
        <div class="cat-meta">${f.int(cat.mentions)} mentions · ${esc(TREND_EN[cat.trend] ?? cat.trend ?? '')}</div>
        ${cat.action_note ? `<p class="cat-note">${esc(cat.action_note)}</p>` : ''}
      </div>`).join('')}</div></div>`
    : '';

  const chip = (k, kind) => `<span class="chip chip--${kind}">${esc(k.phrase)}<span class="chip-n">${k.count}</span></span>`;
  const posChips = (a.keywords?.positive ?? []).map((k) => chip(k, 'pos')).join('');
  const negChips = (a.keywords?.negative ?? []).map((k) => chip(k, 'neg')).join('');
  const keywords = (posChips || negChips)
    ? `<div class="block"><h3 class="block-title">Phrases customers keep using</h3>
       <div class="chips">${posChips}${negChips}</div></div>`
    : '';

  const quotes = quotesBlock(data.reviews.highlights, f);

  return `${sectionHead(sec, sub)}
  ${themes}
  ${categories}
  ${keywords}
  ${quotes}`;
}

function quotesBlock(highlights, f) {
  const usable = (highlights ?? []).filter((r) => (r.message ?? '').trim().length >= 60);
  if (!usable.length) return '';
  // Curate: the best 5★ story, one critical voice if present, one more positive.
  const picks = [];
  const positive = usable.filter((r) => (r.rating ?? 0) >= 5);
  const critical = usable.filter((r) => (r.rating ?? 0) <= 4);
  if (positive[0]) picks.push(positive[0]);
  if (critical[0]) picks.push(critical[0]);
  if (picks.length < 3 && positive[1]) picks.push(positive[1]);

  return `<div class="block"><h3 class="block-title">In their own words</h3>
  <div class="reviews">${picks.map((r) => `<blockquote class="review">
      <div class="review-top">
        <span class="review-stars">${'★'.repeat(Math.round(r.rating || 0))}<span class="review-dim">${'★'.repeat(Math.max(0, 5 - Math.round(r.rating || 0)))}</span></span>
        ${r.responded || r.reply_message ? '<span class="responded">✓ Responded</span>' : '<span class="unresponded">No response yet</span>'}
      </div>
      <p class="review-msg">${esc(truncate(r.message, 300))}</p>
      <footer class="review-foot">${esc(r.author ?? 'Customer')} · ${esc(r.source ?? '')} · ${esc(f.date(r.published_on))}</footer>
      ${r.reply_message ? `<p class="review-reply"><span class="review-reply-label">Owner response —</span> ${esc(truncate(r.reply_message, 140))}</p>` : ''}
    </blockquote>`).join('')}</div></div>`;
}

// --------------------------------------------- 5 · Local map visibility ----

function visibilityMapPage(data, f, sec) {
  const lsg = data.lsg;
  const sum = lsg.insights?.summary;
  if (!lsg.pins?.length) {
    return `${sectionHead(sec, '')}<div class="empty"><p>No map-ranking data was available for this period.</p></div>`;
  }

  const explainer = `<p class="explainer">Each pin below is a real Google search for
    <strong>“${esc(lsg.primaryKeyword)}”</strong> run from that exact spot in your service area.
    The number is where ${esc(data.meta.business.name ?? 'your business')} appears in the local map results
    seen by a customer standing there. Green pins are top-3 positions — where nearly all calls go.</p>`;

  const map = buildMap(lsg.pins, {
    centerLat: lsg.center.lat,
    centerLng: lsg.center.lng,
    businessName: lsg.meta?.location ?? data.meta.business.name ?? 'Business',
    keyword: lsg.primaryKeyword,
  });

  const legendHtml = `<div class="map-legend">${RANK_BANDS.map((b) => `<span class="map-legend-item"><span class="pin pin--${b.key} pin--sm">${b.key === 'nr' ? '·' : ''}</span>${esc(b.label)}</span>`).join('')}<span class="map-legend-item"><span class="pin pin--target pin--sm">★</span>Your location</span></div>`;

  const stats = sum
    ? `<div class="stat-strip block">
        <div class="stat"><div class="stat-val">${f.dec(sum.avg_rank)}</div><div class="stat-label">Average position</div></div>
        <div class="stat"><div class="stat-val">${f.pctPoints(sum.visibility_score)}</div><div class="stat-label">Visibility score</div></div>
        <div class="stat"><div class="stat-val">${f.int(sum.top_3_pins)}<span class="stat-den">/${f.int(sum.total_pins)}</span></div><div class="stat-label">Top-3 points</div></div>
        <div class="stat"><div class="stat-val">${f.int(sum.top_10_pins)}<span class="stat-den">/${f.int(sum.total_pins)}</span></div><div class="stat-label">Top-10 points</div></div>
        <div class="stat"><div class="stat-val">${f.int(sum.best_rank)}–${f.int(sum.worst_rank)}</div><div class="stat-label">Best–worst</div></div>
      </div>`
    : '';

  // Geographic strength quadrants.
  const geo = lsg.insights?.geographic_strength ?? {};
  const geoPrev = lsg.insights?.trends_vs_previous_snapshot?.geographic ?? {};
  const quadrants = ['north', 'south', 'east', 'west'].filter((q) => geo[q]);
  const geoBlock = quadrants.length
    ? `<div class="block"><h3 class="block-title">Strength by area</h3>
      <div class="quad-grid">${quadrants.map((q) => {
        const g = geo[q];
        const label = { north: 'North', south: 'South', east: 'East', west: 'West' }[q];
        return `<div class="quad">
          <div class="quad-name">${esc(label)}</div>
          <div class="quad-vis">${f.pctPoints(g.visibility)}</div>
          <div class="quad-meta">avg position ${f.dec(g.avg_rank)}</div>
          ${geoPrev[q] ? `<div class="quad-delta">${deltaBadge(geoPrev[q].visibility_change, { suffix: ' pp' })} vs last scan</div>` : ''}
        </div>`;
      }).join('')}</div></div>`
    : '';

  const snapNote = lsg.snapshotAt ? `Snapshot ${esc(f.date(lsg.snapshotAt))} · ${esc(lsg.meta?.address ?? '')}` : '';
  return `${sectionHead(sec, snapNote)}
  ${explainer}
  ${map.html}
  ${legendHtml}
  ${stats}
  ${geoBlock}`;
}

// ----------------------------------------------- 6 · Search performance ----

function searchPerformancePage(data, f, sec) {
  const lsg = data.lsg;
  const ins = lsg.insights;
  const gbp = data.reviews.gbp;
  const parts = [];

  if (ins?.summary) {
    const sum = ins.summary;
    const top3 = sum.top_3_pins ?? 0;
    const top10 = sum.top_10_pins ?? 0;
    const nr = sum.not_ranking ?? 0;
    const total = sum.total_pins ?? top10 + nr;
    const segs = [
      { label: RANK_BANDS[0].label, value: top3, color: RANK_BANDS[0].color },
      { label: RANK_BANDS[1].label, value: Math.max(0, top10 - top3), color: RANK_BANDS[1].color },
      { label: RANK_BANDS[2].label, value: Math.max(0, total - top10 - nr), color: RANK_BANDS[2].color },
      { label: RANK_BANDS[3].label, value: nr, color: RANK_BANDS[3].color },
    ];
    parts.push(`<div class="block"><h3 class="block-title">Where your ${f.int(total)} grid points rank — all keywords</h3>${stackbar(segs, (v) => f.int(v))}</div>`);
  }

  // Monthly visibility trend (snapshots collapse to the last one per month).
  const monthly = lastSnapshotPerMonth(lsg.snapshots ?? []);
  if (monthly.length >= 2) {
    parts.push(`<div class="grid-2 block">
      <div><h3 class="block-title">Visibility score over time</h3>${sparkline(monthly.map((s) => ({ x: s.label, y: s.visibility_score })), { fmt: (v) => f.pctPoints(v, 0), width: 325, height: 130 })}</div>
      <div><h3 class="block-title">Average position over time <span class="dim">(up = better)</span></h3>${sparkline(monthly.map((s) => ({ x: s.label, y: s.avg_rank })), { invert: true, fmt: (v) => f.dec(v), width: 325, height: 130 })}</div>
    </div>`);
  }

  const tf = ins?.trends_vs_first_snapshot;
  const tp = ins?.trends_vs_previous_snapshot;
  if (tf || tp) {
    parts.push(`<div class="grid-2 block">
      ${tf ? `<div class="trend-card"><div class="trend-label">Since tracking began (${esc(shortMonthYear(tf.first_snapshot_at, f))})</div>
        <div class="trend-val">${deltaBadge(tf.change, { goodWhenUp: false, suffix: ' positions' })}</div>
        <div class="trend-meta">position ${f.dec(tf.start_avg)} → ${f.dec(tf.current_avg)} across ${f.int(tf.snapshot_count)} scans</div></div>` : ''}
      ${tp ? `<div class="trend-card"><div class="trend-label">Vs previous scan (${esc(f.date(tp.previous_snapshot_at))})</div>
        <div class="trend-val">${deltaBadge(tp.avg_rank_change, { goodWhenUp: false, suffix: ' positions' })}&ensp;${deltaBadge(tp.visibility_change, { suffix: ' pp visibility' })}</div>
        <div class="trend-meta">top-3 points ${deltaBadge(tp.top_3_change)} · top-10 points ${deltaBadge(tp.top_10_change)}</div></div>` : ''}
    </div>`);
  }

  // Google Business Profile: the demand funnel.
  const gt = gbp?.metrics?.data?.totals ?? gbp?.metrics?.totals;
  const gp = gbp?.metrics?.data?.previous_period?.totals;
  if (gt && (gt.impressions_total || gt.call_clicks || gt.website_clicks || gt.direction_requests)) {
    const cell = (label, cur, prev, fmtV = f.int) => `<div class="stat">
      <div class="stat-val">${fmtV(cur)}</div><div class="stat-label">${esc(label)}</div>
      ${prev != null ? `<div class="stat-delta">${deltaBadge(pctChange(cur, prev), { suffix: '%', digits: 0 })}</div>` : ''}
    </div>`;
    const terms = (gbp.searchTerms?.data ?? []).slice(0, 6);
    parts.push(`<div class="block"><h3 class="block-title">Google Business Profile — from views to customers</h3>
      <div class="stat-strip">
        ${cell('Profile views', gt.impressions_total, gp?.impressions_total)}
        ${cell('Via Search', gt.impressions_search, gp?.impressions_search)}
        ${cell('Via Maps', gt.impressions_maps, gp?.impressions_maps)}
        ${cell('Calls', gt.call_clicks, gp?.call_clicks)}
        ${cell('Website visits', gt.website_clicks, gp?.website_clicks)}
        ${cell('Direction requests', gt.direction_requests, gp?.direction_requests)}
      </div>
      ${terms.length ? `<div class="terms"><span class="terms-title">Searches that surfaced your profile:</span> ${terms.map((tm) => `<span class="chip">${esc(tm.keyword)}${tm.below_threshold || tm.impressions == null ? '' : `<span class="chip-n">${f.int(tm.impressions)}</span>`}</span>`).join('')}</div>` : ''}
    </div>`);
  }

  if (!parts.length) {
    return `${sectionHead(sec, '')}<div class="empty"><p>No search-performance data was available for this period.</p></div>`;
  }
  return `${sectionHead(sec, 'Map-ranking trend and Google Business Profile activity')}${parts.join('')}`;
}

function lastSnapshotPerMonth(snapshots) {
  const byMonth = new Map();
  for (const s of snapshots) {
    const d = new Date(s.snapshot_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    byMonth.set(key, s); // snapshots arrive oldest→newest; last write wins
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, s]) => {
      const d = new Date(s.snapshot_at);
      return { ...s, label: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(d) };
    });
}

// --------------------------------------------- 7 · Competitive landscape ----

function competitorsPage(data, f, sec) {
  const ins = data.lsg.insights;
  const comps = ins?.top_competitors ?? [];
  if (!comps.length) {
    return `${sectionHead(sec, '')}<div class="empty"><p>No competitor data was available for this period.</p></div>`;
  }

  // Dedupe multi-listing businesses (same name, several pins) keeping the
  // strongest listing; flag the client's own listing if it appears.
  const targetId = data.lsg.meta?.target_place_id;
  const selfName = (data.lsg.meta?.location || data.meta.business?.name || '').trim().toLowerCase();
  const seen = new Set();
  const deduped = [];
  for (const c of comps) {
    const key = (c.name ?? '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(c);
  }

  const sum = ins.summary;
  const selfRow = sum
    ? `<tr class="is-self">
        <td class="c-name">${esc(data.meta.business.name ?? 'You')}<span class="self-tag">you</span></td>
        <td>${data.reviews.metrics?.totals?.avg_rating != null ? `${f.dec(data.reviews.metrics.totals.avg_rating, 1)}★` : '–'}</td>
        <td>–</td>
        <td>${f.dec(sum.avg_rank)}</td>
        <td>${f.pctPoints(sum.visibility_score)}</td>
        <td>${sum.total_pins ? f.int(((sum.total_pins - (sum.not_ranking ?? 0)) / sum.total_pins) * 100) : '–'}%</td>
        <td>–</td>
      </tr>`
    : '';

  const rows = deduped.slice(0, 7).map((c) => {
    const isSelf = (targetId && c.place_id === targetId) || (selfName && (c.name ?? '').toLowerCase() === selfName);
    return `<tr class="${isSelf ? 'is-self' : ''}">
      <td class="c-name">${esc(c.name)}${isSelf ? '<span class="self-tag">you</span>' : ''}</td>
      <td>${c.rating != null ? `${f.dec(c.rating, 1)}★` : '–'}</td>
      <td>${f.int(c.reviews)}</td>
      <td>${f.dec(c.avg_rank)}</td>
      <td>${f.pctPoints(c.visibility)}</td>
      <td>${f.int(c.coverage)}%</td>
      <td><span class="pressure" style="--t:${Math.min(100, c.threat_score)}%">${f.int(c.threat_score)}</span></td>
    </tr>`;
  });

  // Data-driven takeaways.
  const byPressure = [...deduped].sort((a, b) => (b.threat_score ?? 0) - (a.threat_score ?? 0));
  const byVisibility = [...deduped].sort((a, b) => (b.visibility ?? 0) - (a.visibility ?? 0));
  const byReviews = [...deduped].sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0));
  const ownRating = data.reviews.metrics?.totals?.avg_rating;

  const facts = [];
  if (byPressure[0]) {
    facts.push(['Closest competitor', `${byPressure[0].name} — visible on ${f.int(byPressure[0].coverage)}% of the grid with ${f.int(byPressure[0].reviews)} reviews. Watch their review velocity.`]);
  }
  if (byVisibility[0] && byVisibility[0] !== byPressure[0]) {
    facts.push(['Visibility leader', `${byVisibility[0].name} holds ${f.pctPoints(byVisibility[0].visibility)} visibility (avg position ${f.dec(byVisibility[0].avg_rank)}) — the benchmark to chase.`]);
  }
  if (ownRating != null && byReviews[0]) {
    const better = deduped.filter((c) => (c.rating ?? 0) > ownRating).length;
    facts.push(['Your edge', better === 0
      ? `Your ${f.dec(ownRating, 1)}★ rating beats every mapped competitor — reviews are your strongest asset in this market.`
      : `Your ${f.dec(ownRating, 1)}★ rating is ahead of ${deduped.length - better} of ${deduped.length} mapped competitors; ${byReviews[0].name} leads on volume with ${f.int(byReviews[0].reviews)} reviews.`]);
  }

  return `${sectionHead(sec, `Who shows up beside you for “${esc(data.lsg.primaryKeyword)}” and related searches`)}
  <div class="block">
    <table class="dtable comp-table">
      <thead><tr><th>Business</th><th>Rating</th><th>Reviews</th><th>Avg position</th><th>Visibility</th><th>Coverage</th><th>Pressure</th></tr></thead>
      <tbody>${selfRow}${rows.join('')}</tbody>
    </table>
    ${note('Pressure blends a competitor’s visibility with how much of your service area they cover — a high score means they compete with you almost everywhere. Multi-listing businesses are shown once, strongest listing kept.')}
  </div>
  ${facts.length ? `<div class="fact-grid block">${facts.map(([t2, b]) => `<div class="fact"><div class="fact-title">${esc(t2)}</div><p>${esc(b)}</p></div>`).join('')}</div>` : ''}`;
}

// ------------------------------------------------------- 8 · Action plan ----

function actionPlanPage(data, f, sec) {
  const ai = data.reviews.insights?.analysis;
  const recs = ai?.recommendations;
  const horizons = [
    ['immediate', 'Now'],
    ['short_term', 'This month'],
    ['long_term', 'This quarter'],
  ];

  const priorityCards = recs
    ? horizons.filter(([k]) => recs[k]).map(([k, when], i) => {
        const r = recs[k];
        return `<div class="action">
          <div class="action-no">${i + 1}</div>
          <div class="action-body">
            <div class="action-top"><span class="action-when">${esc(when)}</span>${r.urgency ? tag(URGENCY_EN[r.urgency] ?? r.urgency, r.urgency === 'critical' || r.urgency === 'high' ? 'urgent' : '') : ''}${r.effort ? tag(EFFORT_EN[r.effort] ?? r.effort) : ''}</div>
            <div class="action-title">${esc(r.title)}</div>
            <p class="action-text">${esc(r.action)}</p>
            ${r.impact ? `<p class="action-impact"><span>Why it matters —</span> ${esc(r.impact)}</p>` : ''}
          </div>
        </div>`;
      }).join('')
    : '';

  const quickWins = (ai?.quick_wins ?? []).slice(0, 4);
  const quickWinsBlock = quickWins.length
    ? `<div class="block"><h3 class="block-title">Quick wins — under an hour each</h3>
      <ul class="checklist">${quickWins.map((q) => `<li>${esc(q.action)}</li>`).join('')}</ul></div>`
    : '';

  const radar = (data.lsg.insights?.recommendations ?? []).filter((r) => r.type !== 'success').slice(0, 3);
  const radarBlock = radar.length
    ? `<div class="block"><h3 class="block-title">Also on our radar — from the map-rank scan</h3>
      ${radar.map((r) => `<div class="radar"><strong>${esc(r.title)}.</strong> ${esc(r.description)}</div>`).join('')}</div>`
    : '';

  const next = `<div class="next-strip">
    <div class="next"><div class="next-label">Next grid scan</div><div class="next-val">Mid-${esc(nextMonthName(data.meta.reportMonth))}</div></div>
    <div class="next"><div class="next-label">Next report</div><div class="next-val">Early ${esc(monthAfterName(data.meta.reportMonth))}</div></div>
    ${data.meta.targets?.response_rate ? `<div class="next"><div class="next-label">Response-rate target</div><div class="next-val">${f.pct(data.meta.targets.response_rate)}</div></div>` : ''}
    ${data.meta.targets?.visibility ? `<div class="next"><div class="next-label">Visibility target</div><div class="next-val">${f.pctPoints(data.meta.targets.visibility, 0)}</div></div>` : ''}
  </div>`;

  if (!priorityCards && !quickWins.length && !radar.length) {
    return `${sectionHead(sec, '')}<div class="empty"><p>No recommendations were generated for this period.</p></div>`;
  }

  return `${sectionHead(sec, `Agreed focus for ${esc(nextMonthName(data.meta.reportMonth))} — three priorities, in order`)}
  ${priorityCards ? `<div class="block">${priorityCards}</div>` : ''}
  ${quickWinsBlock}
  ${radarBlock}
  ${next}`;
}

function nextMonthName(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  if (!y || !m) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m, 1)));
}
function monthAfterName(ym) {
  const [y, m] = String(ym).split('-').map(Number);
  if (!y || !m) return '';
  return new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m + 1, 1)));
}

// --------------------------------------------------------- 9 · Appendix ----

function appendixPage(data, f, sec) {
  const lsgMeta = data.lsg.meta;
  const range = data.meta.range;
  const ins = data.reviews.insights;

  const gridDesc = lsgMeta
    ? `A ${esc(String(lsgMeta.grid_size ?? '–'))}×${esc(String(lsgMeta.grid_size ?? '–'))} grid of live Google searches across a ${esc(String(lsgMeta.distance ?? '–'))} ${esc(lsgMeta.distance_unit ?? 'km')} radius, repeated ${esc(lsgMeta.frequency ?? 'monthly')} for ${(lsgMeta.keywords ?? []).length || 1} keyword${(lsgMeta.keywords ?? []).length === 1 ? '' : 's'}: ${(lsgMeta.keywords ?? [lsgMeta.keyword]).filter(Boolean).map((k) => `“${esc(k)}”`).join(', ')}.`
    : 'Not available this period.';

  const sources = `<div class="block"><h3 class="block-title">Data sources</h3>
    <table class="dtable">
      <thead><tr><th>Surface</th><th>What it measures</th><th>Period</th></tr></thead>
      <tbody>
        <tr><td class="sc-metric">Reviews &amp; responses</td><td class="td-note">Every public review and owner response across your connected platforms (Google, Yelp, Facebook…).</td><td>${range ? `${esc(f.date(range.from))} – ${esc(f.date(range.to))}` : '–'}</td></tr>
        <tr><td class="sc-metric">Review analysis</td><td class="td-note">Each written review is read, classified by theme and sentiment, and scored. Quotes in this report are verbatim.</td><td>${ins ? `${esc(f.date(ins.period_start))} – ${esc(f.date(ins.period_end))}` : '–'}</td></tr>
        <tr><td class="sc-metric">Google Business Profile</td><td class="td-note">Profile impressions on Search and Maps, plus the actions that follow: calls, website visits, direction requests.</td><td>${range ? `${esc(f.date(range.from))} – ${esc(f.date(range.to))}` : '–'}</td></tr>
        <tr><td class="sc-metric">Map-rank grid</td><td class="td-note">${gridDesc}</td><td>${data.lsg.snapshotAt ? esc(f.date(data.lsg.snapshotAt)) : '–'}</td></tr>
      </tbody>
    </table></div>`;

  const glossary = `<div class="block"><h3 class="block-title">How to read the numbers</h3>
    <dl class="glossary">
      <div><dt>Average map position</dt><dd>Your mean position in local map results across every grid point. Lower is better; positions 1–3 appear without tapping “more places”.</dd></div>
      <div><dt>Visibility score</dt><dd>The share of available search exposure you capture, weighting top positions far more heavily — position 1 is worth many times position 10.</dd></div>
      <div><dt>Coverage</dt><dd>The share of grid points where a business ranks at all for the tracked keywords.</dd></div>
      <div><dt>Pressure</dt><dd>A 0–100 blend of a competitor's visibility and coverage. High pressure means they compete with you across most of your service area, not just near their office.</dd></div>
      <div><dt>Response rate</dt><dd>The share of reviews that received an owner response. Top-rated local businesses typically hold 80%+ — and response activity is a trust signal customers see.</dd></div>
      <div><dt>Review score</dt><dd>A 0–100 composite of rating level, response behavior, and review sentiment, comparable month to month.</dd></div>
      <div><dt>Rank bands</dt><dd><span class="bandkey">${RANK_BANDS.map((b) => `<span class="bandkey-item"><span class="bandkey-dot" style="background:${b.color}"></span>${esc(b.label)}</span>`).join('')}</span></dd></div>
    </dl></div>`;

  const brand = data.meta.branding;
  const closing = `<div class="closing">
    ${brand.sampleNote ? `<p><strong>${esc(brand.sampleNote)}.</strong> Business names, reviews and figures in this document are fictional and for demonstration only.</p>` : ''}
    <p>Comparisons marked “vs last month” use the full previous calendar month. Map-rank comparisons use the two most recent scans. Where a platform exposes no data for the period, the section is omitted rather than estimated.</p>
  </div>`;

  return `${sectionHead(sec, 'What we measure, where it comes from, and how to read it')}
  ${sources}
  ${glossary}
  ${closing}`;
}
