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

  const trade = document.createElement('div');
  trade.className = 'sniper-trade';
  const quick = document.createElement('div');
  quick.className = 'sniper-quick';
  const amounts = [0.05, 0.1, 0.25, 0.5];
  const quoteLine = document.createElement('div');
  quoteLine.className = 'sniper-quote';
  quoteLine.textContent = 'Elige un importe para ver el precio en vivo.';
  const statusLine = document.createElement('div');
  statusLine.className = 'sniper-trade-status';
  const buyButton = document.createElement('button');
  buyButton.type = 'button';
  buyButton.className = 'sniper-buy';
  buyButton.textContent = 'Comprar';
  const sellButton = document.createElement('button');
  sellButton.type = 'button';
  sellButton.className = 'sniper-sell';
  sellButton.textContent = 'Vender todo';

  let solAmount = 0.1;
  let latestQuote = null;
  let quoteAt = 0;
  let quoteToken = 0;

  const trade$ = () => globalThis.JamdSniperTrade;
  const setQuoteLine = text => { quoteLine.textContent = text; };
  const setStatus = text => { statusLine.textContent = text; };

  const refreshQuote = async (force) => {
    const api = trade$();
    if (!api || !api.provider()) { setQuoteLine('Phantom no está disponible en este navegador.'); return; }
    const token = ++quoteToken;
    try {
      const data = await api.quote({ mint: item.mint, solAmount, slippageBps: 120 });
      if (token !== quoteToken) return;
      latestQuote = data;
      quoteAt = Date.now();
      const out = Number(data.outAmount || 0);
      const decimals = Number.isInteger(item.decimals) ? item.decimals : 6;
      const tokens = out / Math.pow(10, decimals);
      setQuoteLine(solAmount + ' SOL ≈ ' + tokens.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + (item.symbol || '') + ' · impacto ' + (Number(data.priceImpactPct) * 100).toFixed(2) + '%' + (data.routes?.length ? ' · ' + data.routes.join('/') : ''));
    } catch (error) {
      if (token === quoteToken) setQuoteLine('Sin ruta ahora mismo: ' + (error?.message || error));
    }
  };

  const preset = value => {
    solAmount = value;
    for (const button of quick.querySelectorAll('button')) button.classList.toggle('active', Number(button.dataset.amount) === value);
    setStatus('');
    void refreshQuote(false);
  };
  for (const amount of amounts) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.amount = String(amount);
    button.textContent = amount + ' SOL';
    button.addEventListener('click', () => preset(amount));
    quick.append(button);
  }
  const custom = document.createElement('input');
  custom.type = 'number';
  custom.step = '0.01';
  custom.min = '0.005';
  custom.placeholder = 'otro';
  custom.className = 'sniper-amount';
  custom.addEventListener('change', () => { const value = Number(custom.value); if (value > 0) preset(value); });
  quick.append(custom);

  buyButton.addEventListener('click', async () => {
    const api = trade$();
    if (!api) { setStatus('Recarga la página para cargar el módulo de compra.'); return; }
    try {
      if (!api.provider()) { setStatus('Phantom no está instalado. Instálalo o abre esta página dentro de Phantom.'); return; }
      buyButton.disabled = true;
      if (!api.key()) { setStatus('Conectando Phantom…'); await api.connect(); }
      if (!latestQuote || Date.now() - quoteAt > 4000) { setStatus('Actualizando precio…'); await refreshQuote(true); }
      setStatus('Firmando en Phantom…');
      const result = await api.buy({ mint: item.mint, solAmount, slippageBps: 120 });
      setStatus('Compra enviada: ' + result.signature.slice(0, 10) + '…');
      const link = document.createElement('a');
      link.href = 'https://solscan.io/tx/' + result.signature;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'ver en Solscan';
      statusLine.append(' ', link);
    } catch (error) {
      const code = String(error?.message || error);
      setStatus(code === 'phantom-missing' ? 'Phantom no está disponible aquí.' : 'No se pudo comprar: ' + code);
    } finally {
      buyButton.disabled = false;
    }
  });

  sellButton.addEventListener('click', async () => {
    const api = trade$();
    if (!api) { setStatus('Recarga la página para cargar el módulo de venta.'); return; }
    try {
      if (!api.provider()) { setStatus('Phantom no está disponible aquí.'); return; }
      sellButton.disabled = true;
      if (!api.key()) { setStatus('Conectando Phantom…'); await api.connect(); }
      setStatus('Leyendo tu saldo…');
      const result = await api.sellAll({ mint: item.mint, slippageBps: 150 });
      setStatus('Venta enviada: ' + result.signature.slice(0, 10) + '…');
    } catch (error) {
      const code = String(error?.message || error);
      setStatus(code === 'no-balance' ? 'No tienes este token en la wallet conectada.' : 'No se pudo vender: ' + code);
    } finally {
      sellButton.disabled = false;
    }
  });

  const warning = document.createElement('small');
  warning.className = 'sniper-warning';
  warning.textContent = 'Operacion real con tu wallet. Revisa el impacto de precio antes de firmar; el mercado puede moverse.';
  trade.append(quick, quoteLine, statusLine, buyButton, sellButton, warning);

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
  article.append(scams, trade, links);
  const auditBox = document.createElement('div');
  auditBox.className = 'sniper-audit';
  const auditButton = document.createElement('button');
  auditButton.type = 'button';
  auditButton.className = 'sniper-audit-btn';
  auditButton.textContent = 'Auditoria profunda: web, X y cadena';
  const auditBody = document.createElement('div');
  auditBody.className = 'sniper-audit-body';
  auditBody.hidden = true;
  let auditCache = null;

  const levelIcon = level => level === 'critical' ? '✕' : level === 'high' ? '✕' : level === 'medium' ? '!' : '·';

  const renderAudit = data => {
    auditBody.replaceChildren();
    const block = (title, lines, flags) => {
      const section = document.createElement('section');
      section.className = 'sniper-audit-section';
      const heading = document.createElement('strong');
      heading.textContent = title;
      section.append(heading);
      for (const line of lines) {
        const row = document.createElement('div');
        row.className = 'sniper-audit-row';
        row.innerHTML = line;
        section.append(row);
      }
      for (const flag of flags || []) {
        const row = document.createElement('div');
        row.className = 'sniper-audit-flag ' + flag.level;
        row.textContent = levelIcon(flag.level) + ' ' + flag.text;
        section.append(row);
      }
      return section;
    };
    const site = data.website || {};
    const x = data.x || {};
    const chain = data.chain || {};
    auditBody.append(block('Web', [
      'URL: ' + (site.url ? '<a href="' + site.url + '" target="_blank" rel="noopener noreferrer">' + (site.domain || site.url) + '</a>' : 'no publica web'),
      'Estado: ' + (site.ok ? 'responde' : 'no responde') + (site.title ? ' · ' + site.title.slice(0, 60) : ''),
      'Enlaza X del token: ' + (site.hasXLink ? 'si' : 'no')
    ], site.flags));
    auditBody.append(block('Cuenta de X', [
      'Cuenta: ' + (x.handle ? '<a href="https://x.com/' + x.handle + '" target="_blank" rel="noopener noreferrer">@' + x.handle + '</a>' : 'no publicada'),
      'Antiguedad: ' + (Number.isFinite(x.joinedDays) ? x.joinedDays + ' dias' : '—') + ' · Seguidores: ' + (Number.isFinite(x.followers) ? x.followers.toLocaleString('en-US') : '—'),
      'Tweets: ' + (Number.isFinite(x.tweets) ? x.tweets : '—') + ' · Verificada: ' + (x.verified ? 'si' : 'no')
    ], x.flags));
    auditBody.append(block('Cadena (muestra reciente)', [
      'Transacciones analizadas: ' + (chain.sampled ?? 0),
      'Compras: ' + (chain.buys ?? 0) + ' · Ventas: ' + (chain.sells ?? 0),
      'Carteras distintas: ' + (chain.uniqueTraders ?? 0) + ' · SOL comprado: ' + (chain.solVolume ?? 0),
      'Quemas detectadas: ' + (chain.burns ?? 0) + (chain.burnAmount ? ' · cantidad ' + chain.burnAmount : '')
    ], chain.flags));
    if (data.penaltyScore) {
      const summary = document.createElement('div');
      summary.className = 'sniper-audit-summary';
      summary.textContent = 'Penalizacion adicional estimada: ' + data.penaltyScore + '/100';
      auditBody.append(summary);
    }
  };

  auditButton.addEventListener('click', async () => {
    auditBody.hidden = false;
    if (auditCache) { renderAudit(auditCache); return; }
    auditButton.disabled = true;
    auditButton.textContent = 'Analizando web, X y cadena...';
    try {
      const response = await fetch(base + '/api/sniper-audit?x=' + Date.now(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mint: item.mint, poolAddress: item.poolAddress, symbol: item.symbol, socials: item.socials || [], websites: item.websites || [] })
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      auditCache = await response.json();
      renderAudit(auditCache);
      auditButton.textContent = 'Actualizar auditoria';
    } catch (error) {
      auditBody.replaceChildren();
      const row = document.createElement('div');
      row.className = 'sniper-audit-flag high';
      row.textContent = 'No se pudo auditar: ' + (error?.message || error);
      auditBody.append(row);
      auditButton.textContent = 'Reintentar auditoria';
    } finally {
      auditButton.disabled = false;
    }
  });

  auditBox.append(auditButton, auditBody);
  article.append(auditBox);

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
