const $ = id => document.getElementById(id);
const state = { items: [], updatedAt: null, loading: false };

const base = globalThis.Capacitor?.isNativePlatform?.() ? 'https://www.jamddmaj.com' : '';

function verdictClass(verdict) {
  if (verdict === 'ALTO RIESGO') return 'alto';
  if (verdict === 'MEDIO') return 'medio';
  if (verdict === 'PRUDENCIA') return 'prudencia';
  return 'mejor';
}

function money(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e9) return (value / 1e9).toFixed(2) + ' B';
  if (value >= 1e6) return (value / 1e6).toFixed(2) + ' M';
  if (value >= 1e3) return (value / 1e3).toFixed(1) + ' K';
  return Math.round(value).toString();
}

function age(value) {
  if (!Number.isFinite(value)) return '—';
  if (value < 60) return value + ' min';
  if (value < 1440) return Math.round(value / 60) + ' h';
  return Math.round(value / 1440) + ' d';
}

const marks = { ok: '✓', high: '✕', critical: '✕', medium: '!' };

function badge(text, kind) {
  const span = document.createElement('span');
  span.className = 'sniper-badge ' + kind;
  span.textContent = text;
  return span;
}

function growthClass(label) {
  if (label === 'ALTO') return 'mejor';
  if (label === 'MODERADO') return 'prudencia';
  return 'medio';
}

function liquidityClass(label) {
  if (label === 'ALTO') return 'alto';
  if (label === 'MEDIO') return 'medio';
  return 'mejor';
}

function card(item) {
  const article = document.createElement('article');
  article.className = 'sniper-card';

  const top = document.createElement('div');
  top.className = 'sniper-card-top';
  const symbol = document.createElement('span');
  symbol.className = 'sniper-symbol';
  symbol.textContent = item.symbol || '—';
  const badges = document.createElement('div');
  badges.className = 'sniper-badges';
  badges.append(badge(item.verdict, verdictClass(item.verdict)), badge('Potencial ' + (item.growth?.label || '—'), growthClass(item.growth?.label)));
  top.append(symbol, badges);

  const scores = document.createElement('div');
  scores.className = 'sniper-scores';
  const safetyBlock = document.createElement('div');
  safetyBlock.className = 'sniper-score';
  const safetyNumber = document.createElement('strong');
  safetyNumber.textContent = String(item.score);
  const safetyLabel = document.createElement('span');
  safetyLabel.textContent = 'seguridad · 100 es mejor';
  safetyBlock.append(safetyNumber, safetyLabel);
  const growthBlock = document.createElement('div');
  growthBlock.className = 'sniper-score growth';
  const growthNumber = document.createElement('strong');
  growthNumber.textContent = String(item.growth?.score ?? '—');
  const growthLabel = document.createElement('span');
  growthLabel.textContent = 'potencial estimado · no es una promesa';
  growthBlock.append(growthNumber, growthLabel);
  scores.append(safetyBlock, growthBlock);

  const meta = document.createElement('div');
  meta.className = 'sniper-metabar';
  const metaItem = (name, value) => { const span = document.createElement('span'); span.innerHTML = name + ' <b>' + value + '</b>'; meta.append(span); };
  metaItem('Vida', age(item.ageMinutes));
  metaItem('Liquidez', money(item.liquidity) + ' USD');
  metaItem('Holders', Number.isFinite(item.holders) ? String(item.holders) : '—');
  metaItem('LP bloqueado', Number.isFinite(item.lpLockedPct) ? Math.round(item.lpLockedPct) + '%' : '—');
  metaItem('Creador', Number.isFinite(item.creatorPct) ? item.creatorPct + '%' : '—');

  const liquidity = document.createElement('div');
  liquidity.className = 'sniper-liquidity';
  const liquidityBadge = badge('Retirada de liquidez: ' + item.liquidityLabel + ' (' + item.liquidityRisk + '/100)', liquidityClass(item.liquidityLabel));
  liquidity.append(liquidityBadge);
  if (item.liquidityLabel === 'ALTO') {
    const note = document.createElement('small');
    note.textContent = 'El LP puede vaciarse: revisa el bloqueo y quien controla la liquidez.';
    liquidity.append(note);
  }

  const checks = document.createElement('ul');
  checks.className = 'sniper-checks';
  for (const check of item.checks || []) {
    const li = document.createElement('li');
    li.className = check.ok ? 'ok' : (check.severity || 'high');
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = marks[check.ok ? 'ok' : (check.severity || 'high')] || '·';
    const text = document.createElement('span');
    text.textContent = check.label;
    const small = document.createElement('small');
    small.textContent = check.detail;
    text.append(small);
    li.append(mark, text);
    checks.append(li);
  }

  const factors = document.createElement('ul');
  factors.className = 'sniper-factors';
  for (const factor of item.growth?.factors || []) {
    const li = document.createElement('li');
    li.className = factor.points >= 0 ? 'pos' : 'neg';
    li.innerHTML = '<span>' + factor.label + '</span><b>' + (factor.points > 0 ? '+' : '') + factor.points + '</b><small>' + factor.value + '</small>';
    factors.append(li);
  }

  const scams = document.createElement('div');
  scams.className = 'sniper-scams';
  if ((item.scamSignals || []).length) {
    const title = document.createElement('strong');
    title.textContent = 'Señales de scam o abuso';
    scams.append(title);
    for (const signal of item.scamSignals) {
      const chip = document.createElement('span');
      chip.className = 'signal';
      chip.textContent = signal.text + ' · ' + signal.source;
      chip.title = signal.detail || '';
      scams.append(chip);
    }
  } else {
    const ok = document.createElement('span');
    ok.className = 'clean';
    ok.textContent = 'Sin señales públicas de scam en el analizador ni en sus votos.';
    scams.append(ok);
  }

  const links = document.createElement('div');
  links.className = 'sniper-links';
  for (const social of item.socials || []) {
    const anchor = document.createElement('a');
    const type = String(social.type || '').toLowerCase();
    anchor.href = type.includes('twitter') || type.includes('x') ? 'https://x.com/' + encodeURIComponent(social.handle) : social.handle;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = type.includes('twitter') || type.includes('x') ? 'X · @' + social.handle : social.type + ' · ' + social.handle;
    links.append(anchor);
  }
  const search = document.createElement('a');
  search.href = 'https://x.com/search?q=' + encodeURIComponent((item.symbol || '') + ' scam');
  search.target = '_blank';
  search.rel = 'noopener noreferrer';
  search.textContent = 'Buscar "scam" en X';
  const chart = document.createElement('a');
  chart.href = 'https://www.geckoterminal.com/solana/pools/' + encodeURIComponent(item.poolAddress || '');
  chart.target = '_blank';
  chart.rel = 'noopener noreferrer';
  chart.textContent = 'Gráfico';
  links.append(search, chart);

  article.append(top, scores, meta, liquidity, checks);
  if (factors.children.length) article.append(factors);
  article.append(scams, links);
  return article;
}

function render() {
  const grid = $('sniperGrid');
  const status = $('sniperStatus');
  const minimum = Number($('sniperMin').value || 0);
  const hideHigh = $('sniperHideHigh').checked;
  const query = ($('sniperSearch').value || '').toLowerCase().trim();
  const items = state.items.filter(item =>
    item.score >= minimum &&
    (!hideHigh || item.verdict !== 'ALTO RIESGO') &&
    (!query || String(item.symbol || '').toLowerCase().includes(query))
  );
  grid.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'sniper-empty';
    empty.textContent = state.loading ? 'Analizando tokens nuevos...' : 'Ningun token cumple esos filtros ahora mismo.';
    grid.append(empty);
    return;
  }
  for (const item of items) grid.append(card(item));
  status.textContent = items.length + ' token(es) analizados de ' + state.items.length + '.';
}

async function load() {
  if (state.loading) return;
  state.loading = true;
  $('sniperStatus').textContent = 'Analizando tokens nuevos y revisando seguridad...';
  $('sniperRefresh').disabled = true;
  try {
    const response = await fetch(base + '/api/sniper?x=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const data = await response.json();
    state.items = Array.isArray(data.items) ? data.items : [];
    state.updatedAt = data.observedAt || Date.now();
    $('sniperUpdated').textContent = 'Actualizado ' + new Date(state.updatedAt).toLocaleTimeString();
    render();
  } catch (error) {
    $('sniperStatus').textContent = 'No se pudo analizar ahora: ' + (error?.message || error);
  } finally {
    state.loading = false;
    $('sniperRefresh').disabled = false;
  }
}

$('sniperRefresh').addEventListener('click', load);
$('sniperMin').addEventListener('change', render);
$('sniperHideHigh').addEventListener('change', render);
$('sniperSearch').addEventListener('input', render);
load();
