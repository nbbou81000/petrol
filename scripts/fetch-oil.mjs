// fetch-oil.mjs
// Récupère les cours WTI (CL=F) et Brent (BZ=F) via Yahoo Finance,
// calcule les statistiques détaillées, et écrit data.json à la racine
// pour publication via GitHub Pages.

import { writeFile } from 'fs/promises';

const SYMBOLS = {
  wti: 'CL=F',
  brent: 'BZ=F',
};

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

async function fetchSeries(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol
  )}?range=1y&interval=1d`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    throw new Error(`Yahoo Finance HTTP ${res.status} pour ${symbol}`);
  }
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) {
    throw new Error(`Pas de données renvoyées pour ${symbol}`);
  }
  return result;
}

function cleanCloses(result) {
  const closes = result.indicators?.quote?.[0]?.close || [];
  const timestamps = result.timestamp || [];
  return timestamps
    .map((t, i) => ({ t, c: closes[i] }))
    .filter((p) => typeof p.c === 'number' && !Number.isNaN(p.c));
}

function pctChange(current, past) {
  if (past === undefined || past === null || past === 0) return null;
  return ((current - past) / past) * 100;
}

function round2(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return null;
  return Math.round(n * 100) / 100;
}

// Génère une polyline SVG normalisée (points="x,y x,y ...") à partir
// d'une série de valeurs, prête à être injectée dans un <svg>.
function buildSparklinePoints(values, width = 200, height = 44, pad = 3) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (values.length - 1);
  return values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = height - pad - ((v - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

// Génère toute la géométrie prête à l'emploi pour la vue "Graphiques" :
// tracé de ligne, aplat de zone, et coordonnées du dernier point (marqueur).
// viewBox fixe 0 0 200 90 — le template Liquid n'a qu'à interpoler les
// chaînes directement, sans logique de calcul côté Liquid.
function buildChartGeometry(values, width = 200, height = 90, padTop = 6, padBottom = 6) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = padTop + (height - padTop - padBottom) * (1 - (v - min) / range);
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });

  const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ' ' + p[1]).join(' ');
  const last = pts[pts.length - 1];
  const first = pts[0];
  const areaPath = `${linePath} L ${last[0]} ${height} L ${first[0]} ${height} Z`;

  return {
    view_box: `0 0 ${width} ${height}`,
    line_path: linePath,
    area_path: areaPath,
    last_x: last[0],
    last_y: last[1],
    min: round2(min),
    max: round2(max),
  };
}

async function buildAsset(symbol) {
  const result = await fetchSeries(symbol);
  const meta = result.meta || {};
  const pairs = cleanCloses(result);
  const values = pairs.map((p) => p.c);

  // On utilise toujours l'avant-dernière clôture de notre propre série
  // (values[length-2]) plutôt que meta.previousClose / chartPreviousClose.
  // Ces champs Yahoo peuvent référencer une session désynchronisée
  // (ex: clôture d'il y a 2 jours sur les futures qui tradent quasi 24h/24),
  // ce qui double artificiellement le "day_change_pct" calculé.
  const current = meta.regularMarketPrice ?? values[values.length - 1];
  const prevClose = values[values.length - 2] ?? meta.previousClose ?? meta.chartPreviousClose;

  const dayChange = current - prevClose;
  const dayChangePct = pctChange(current, prevClose);

  // ~5 jours de bourse = 1 semaine, ~21 jours = 1 mois
  const weekIdx = Math.max(0, values.length - 1 - 5);
  const monthIdx = Math.max(0, values.length - 1 - 21);
  const weekChangePct = pctChange(current, values[weekIdx]);
  const monthChangePct = pctChange(current, values[monthIdx]);

  const low52w = Math.min(...values);
  const high52w = Math.max(...values);

  // Sparkline / graphique sur les 30 dernières séances
  const sparkValues = values.slice(-30);
  const sparklinePoints = buildSparklinePoints(sparkValues);
  const chart = buildChartGeometry(sparkValues);

  return {
    symbol,
    currency: meta.currency || 'USD',
    price: round2(current),
    day_change: round2(dayChange),
    day_change_pct: round2(dayChangePct),
    week_change_pct: round2(weekChangePct),
    month_change_pct: round2(monthChangePct),
    low_52w: round2(low52w),
    high_52w: round2(high52w),
    sparkline_points: sparklinePoints,
    chart,
    trend: dayChange >= 0 ? 'up' : 'down',
  };
}

async function main() {
  const [wti, brent] = await Promise.all([
    buildAsset(SYMBOLS.wti),
    buildAsset(SYMBOLS.brent),
  ]);

  const spread = round2(brent.price - wti.price);
  const spreadPct = round2(((brent.price - wti.price) / wti.price) * 100);

  const data = {
    generated_at: new Date().toISOString(),
    wti,
    brent,
    spread,
    spread_pct: spreadPct,
  };

  await writeFile('data.json', JSON.stringify(data, null, 2));
  console.log('data.json écrit :');
  console.log(JSON.stringify(data, null, 2));
}

main().catch((err) => {
  console.error('Erreur fetch-oil:', err);
  process.exit(1);
});
