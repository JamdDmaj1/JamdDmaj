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

function card(item) {
  const article = document.createElement('article');
  article.className = 'sniper-card';
  const top = document.createElement('div');
  top.className = 'sniper-card-top';
  const symbol = document.createElement('span');
  symbol.className = 'sniper-symbol';
  symbol.textContent = item.symbol || '—';
  const badge = document.createElement('span');
  badge.className = 'sniper-badge ' + verdictClass(item.verdict);
  badge.textContent = item.verdict;
  top.append(symbol, badge);

  const score = document.createElement('div');
  score.className = 'sniper-score';
  const number = document.createElement('strong');
  number.textContent = String(item.score);
  const label = document.createElement('span');
  label.textContent = 'seguridad estimada · 100 es mejor';
  score.append(number, label);

  const meta = document.createElement('div');
  meta.className = 'sniper-metabar';
  const metaItem = (name, value) => { const span = document.createElement('span'); span.innerHTML = name + ' <b>' + value + '</b>'; meta.append(span); };
  metaItem('Vida', age(item.ageMinutes));
  metaItem('Liquidez', money(item.liquidity) + ' USD');
  metaItem('FDV', item.fdvUsd ? money(item.fdvUsd) + ' USD' : '—');
  metaItem('Holders', Number.isFinite(item.holders) ? String(item.holders) : '—');

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

  const risks = document.createElement('div');
  risks.className = 'sniper-risks';
  for (const risk of item.risks || []) {
    const chip = document.createElement('span');
    chip.textContent = risk.name;
    chip.title = risk.description || risk.name;
    risks.append(chip);
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
  const chart = document.createElement('a');
  chart.href = 'https://www.geckoterminal.com/solana/pools/' + encodeURIComponent(item.poolAddress || '');
  chart.target = '_blank';
  chart.rel = 'noopener noreferrer';
  chart.textContent = 'Grafico';
  links.append(chart);

  article.append(top, score, meta, checks);
  if (risks.children.length) article.append(risks);
  article.append(links);
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
