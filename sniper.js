const $ = id => document.getElementById(id);
const base = globalThis.Capacitor?.isNativePlatform?.() ? 'https://www.jamddmaj.com' : '';
const state = { items: [], updatedAt: null, loading: false, usd: 5, solPrice: null, solPriceAt: 0 };
try { const saved = Number(JSON.parse(localStorage.getItem('jamd-sniper-usd') || 'null')); if (saved > 0) state.usd = saved; } catch {}

const marks = { ok: '✓', high: '✕', critical: '✕', medium: '!', low: '·' };
const verdictClass = verdict => verdict === 'ALTO RIESGO' ? 'alto' : verdict === 'MEDIO' ? 'medio' : verdict === 'PRUDENCIA' ? 'prudencia' : 'mejor';
const growthClass = label => label === 'ALTO' ? 'mejor' : label === 'MODERADO' ? 'prudencia' : 'medio';
const liquidityClass = label => label === 'ALTO' ? 'alto' : label === 'MEDIO' ? 'medio' : 'mejor';

function money(value) {
  if (!Number.isFinite(value)) return '—';
  if (value >= 1e9) return (value / 1e9).toFixed(2) + ' B';
  if (value >= 1e6) return (value / 1e6).toFixed(2) + ' M';
  if (value >= 1e3) return (value / 1e3).toFixed(1) + ' K';
  return Math.round(value).toString();
}
const age = value => !Number.isFinite(value) ? '—' : value < 60 ? value + ' min' : value < 1440 ? Math.round(value / 60) + ' h' : Math.round(value / 1440) + ' d';

function badge(text, kind) {
  const span = document.createElement('span');
  span.className = 'sniper-badge ' + kind;
  span.textContent = text;
  return span;
}

async function solPrice() {
  if (state.solPrice && Date.now() - state.solPriceAt < 30000) return state.solPrice;
  try {
    const response = await fetch(base + '/api/token-prices?ids=solana&x=' + Date.now(), { cache: 'no-store' });
    const data = await response.json();
    const price = Number(data?.solana?.usd);
    if (price > 0) { state.solPrice = price; state.solPriceAt = Date.now(); }
  } catch {}
  return state.solPrice;
}

function tradePanel(item, setStatusHook) {
  const wrap = document.createElement('div');
  wrap.className = 'sniper-trade';
  const api = () => globalThis.JamdSniperTrade;

  const instant = document.createElement('button');
  instant.type = 'button';
  instant.className = 'sniper-instant';
  const instantLabel = () => { instant.textContent = 'Comprar ' + state.usd + ' USD al instante'; };
  instantLabel();

  const quick = document.createElement('div');
  quick.className = 'sniper-quick';
  const quoteLine = document.createElement('div');
  quoteLine.className = 'sniper-quote';
  quoteLine.textContent = 'Elige un importe para ver el precio en vivo.';
  const statusLine = document.createElement('div');
  statusLine.className = 'sniper-trade-status';
  const buyButton = document.createElement('button');
  buyButton.type = 'button';
  buyButton.className = 'sniper-buy';
  buyButton.textContent = 'Comprar importe elegido';
  const sellButton = document.createElement('button');
  sellButton.type = 'button';
  sellButton.className = 'sniper-sell';
  sellButton.textContent = 'Vender todo';

  let solAmount = 0.1;
  let quoteAt = 0;
  let quoteToken = 0;

  const setStatus = text => { statusLine.textContent = text; if (setStatusHook) setStatusHook(text); };
  const report = signature => {
    setStatus('Enviada: ' + signature.slice(0, 10) + '...');
    const link = document.createElement('a');
    link.href = 'https://solscan.io/tx/' + signature;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'ver en Solscan';
    statusLine.append(' ', link);
  };

  const refreshQuote = async () => {
    if (!api() || !api().provider()) { quoteLine.textContent = 'Phantom no esta disponible en este navegador.'; return; }
    const token = ++quoteToken;
    try {
      const data = await api().quote({ mint: item.mint, solAmount, slippageBps: 120 });
      if (token !== quoteToken) return;
      quoteAt = Date.now();
      const decimals = Number.isInteger(item.decimals) ? item.decimals : 6;
      const tokens = Number(data.outAmount || 0) / Math.pow(10, decimals);
      quoteLine.textContent = solAmount + ' SOL ~ ' + tokens.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + (item.symbol || '') + ' - impacto ' + (Number(data.priceImpactPct) * 100).toFixed(2) + '%';
    } catch (error) {
      if (token === quoteToken) quoteLine.textContent = 'Sin ruta ahora mismo: ' + (error?.message || error);
    }
  };

  for (const amount of [0.05, 0.1, 0.25, 0.5]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.amount = String(amount);
    button.textContent = amount + ' SOL';
    button.addEventListener('click', () => {
      solAmount = amount;
      for (const other of quick.querySelectorAll('button')) other.classList.toggle('active', Number(other.dataset.amount) === amount);
      void refreshQuote();
    });
    quick.append(button);
  }

  instant.addEventListener('click', async () => {
    if (!api()) { setStatus('Recarga la pagina para cargar el modulo de compra.'); return; }
    try {
      if (!api().provider()) { setStatus('Phantom no esta instalado. Instalalo o abre esta pagina dentro de Phantom.'); return; }
      instant.disabled = true;
      instant.textContent = 'Comprando ' + state.usd + ' USD...';
      if (!api().key()) { setStatus('Conectando Phantom...'); await api().connect(); }
      const price = await solPrice();
      if (!price) throw new Error('sin precio de SOL');
      const sol = state.usd / price;
      setStatus('Cotizando ' + state.usd + ' USD (' + sol.toFixed(4) + ' SOL)...');
      const result = await api().buy({ mint: item.mint, solAmount: sol, slippageBps: 150 });
      report(result.signature);
    } catch (error) {
      const text = String(error?.message || error);
      setStatus(text === 'phantom-missing' ? 'Phantom no esta disponible aqui.' : 'No se pudo comprar: ' + text);
    } finally {
      instant.disabled = false;
      instantLabel();
    }
  });

  buyButton.addEventListener('click', async () => {
    if (!api()) { setStatus('Recarga la pagina para cargar el modulo de compra.'); return; }
    try {
      if (!api().provider()) { setStatus('Phantom no esta disponible aqui.'); return; }
      buyButton.disabled = true;
      if (!api().key()) { setStatus('Conectando Phantom...'); await api().connect(); }
      if (!quoteAt || Date.now() - quoteAt > 4000) await refreshQuote();
      setStatus('Firmando en Phantom...');
      const result = await api().buy({ mint: item.mint, solAmount, slippageBps: 120 });
      report(result.signature);
    } catch (error) {
      setStatus('No se pudo comprar: ' + (error?.message || error));
    } finally {
      buyButton.disabled = false;
    }
  });

  sellButton.addEventListener('click', async () => {
    if (!api()) { setStatus('Recarga la pagina para cargar el modulo de venta.'); return; }
    try {
      if (!api().provider()) { setStatus('Phantom no esta disponible aqui.'); return; }
      sellButton.disabled = true;
      if (!api().key()) { setStatus('Conectando Phantom...'); await api().connect(); }
      setStatus('Leyendo tu saldo...');
      const result = await api().sellAll({ mint: item.mint, slippageBps: 150 });
      report(result.signature);
    } catch (error) {
      const text = String(error?.message || error);
      setStatus(text === 'no-balance' ? 'No tienes este token en la wallet conectada.' : 'No se pudo vender: ' + text);
    } finally {
      sellButton.disabled = false;
    }
  });

  const warning = document.createElement('small');
  warning.className = 'sniper-warning';
  warning.textContent = 'Operacion real con tu wallet. Revisa el impacto antes de firmar.';

  wrap.append(instant, quick, quoteLine, statusLine, buyButton, sellButton, warning);
  return wrap;
}

function auditPanel(item) {
  const box = document.createElement('div');
  box.className = 'sniper-audit';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sniper-audit-btn';
  button.textContent = 'Auditoria profunda: web, X y cadena';
  const body = document.createElement('div');
  body.className = 'sniper-audit-body';
  body.hidden = true;
  let cached = null;

  const section = (title, lines, flags) => {
    const block = document.createElement('section');
    block.className = 'sniper-audit-section';
    const heading = document.createElement('strong');
    heading.textContent = title;
    block.append(heading);
    for (const line of lines) {
      const row = document.createElement('div');
      row.className = 'sniper-audit-row';
      row.innerHTML = line;
      block.append(row);
    }
    for (const flag of flags || []) {
      const row = document.createElement('div');
      row.className = 'sniper-audit-flag ' + flag.level;
      row.textContent = (marks[flag.level] || '·') + ' ' + flag.text;
      block.append(row);
    }
    return block;
  };

  const render = data => {
    body.replaceChildren();
    const site = data.website || {};
    const x = data.x || {};
    const chain = data.chain || {};
    const xName = x.handle ? '<a href="https://x.com/' + x.handle + '" target="_blank" rel="noopener noreferrer">@' + x.handle + '</a>' : 'no publicada';
    const siteName = site.url ? '<a href="' + site.url + '" target="_blank" rel="noopener noreferrer">' + (site.domain || site.url) + '</a>' : 'no publica web';
    body.append(section('Web', [
      'Sitio: ' + siteName,
      'Estado: ' + (site.ok ? 'responde' : 'no responde') + (site.title ? ' - ' + String(site.title).slice(0, 60) : ''),
      'Enlaza la X del token: ' + (site.hasXLink ? 'si' : 'no')
    ], site.flags));
    body.append(section('Cuenta de X', [
      'Cuenta: ' + xName,
      'Antiguedad: ' + (Number.isFinite(x.joinedDays) ? x.joinedDays + ' dias' : '—') + ' - Seguidores: ' + (Number.isFinite(x.followers) ? x.followers.toLocaleString('en-US') : '—'),
      'Tweets: ' + (Number.isFinite(x.tweets) ? x.tweets : '—') + ' - Verificada: ' + (x.verified ? 'si' : 'no')
    ], x.flags));
    body.append(section('Cadena (muestra reciente)', [
      'Transacciones: ' + (chain.sampled ?? 0),
      'Compras: ' + (chain.buys ?? 0) + ' - Ventas: ' + (chain.sells ?? 0),
      'Carteras: ' + (chain.uniqueTraders ?? 0) + ' - SOL comprado: ' + (chain.solVolume ?? 0),
      'Quemas: ' + (chain.burns ?? 0) + (chain.burnAmount ? ' - cantidad ' + chain.burnAmount : '')
    ], chain.flags));
    if (data.penaltyScore) {
      const summary = document.createElement('div');
      summary.className = 'sniper-audit-summary';
      summary.textContent = 'Penalizacion adicional estimada: ' + data.penaltyScore + '/100';
      body.append(summary);
    }
  };

  button.addEventListener('click', async () => {
    body.hidden = false;
    if (cached) { render(cached); return; }
    button.disabled = true;
    button.textContent = 'Analizando web, X y cadena...';
    try {
      const response = await fetch(base + '/api/sniper-audit?x=' + Date.now(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mint: item.mint, poolAddress: item.poolAddress, symbol: item.symbol, socials: item.socials || [], websites: item.websites || [] })
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      cached = await response.json();
      render(cached);
      button.textContent = 'Actualizar auditoria';
    } catch (error) {
      body.replaceChildren();
      const row = document.createElement('div');
      row.className = 'sniper-audit-flag high';
      row.textContent = 'No se pudo auditar: ' + (error?.message || error);
      body.append(row);
      button.textContent = 'Reintentar auditoria';
    } finally {
      button.disabled = false;
    }
  });

  box.append(button, body);
  return box;
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
  if (globalThis.SniperRadar) badges.append(globalThis.SniperRadar.button(item));
  top.append(symbol, badges);

  const scores = document.createElement('div');
  scores.className = 'sniper-scores';
  const safety = document.createElement('div');
  safety.className = 'sniper-score';
  safety.append(Object.assign(document.createElement('strong'), { textContent: String(item.score) }), Object.assign(document.createElement('span'), { textContent: 'seguridad - 100 es mejor' }));
  const growth = document.createElement('div');
  growth.className = 'sniper-score growth';
  growth.append(Object.assign(document.createElement('strong'), { textContent: String(item.growth?.score ?? '—') }), Object.assign(document.createElement('span'), { textContent: 'potencial estimado' }));
  scores.append(safety, growth);

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
  liquidity.append(badge('Retirada de liquidez: ' + item.liquidityLabel + ' (' + item.liquidityRisk + '/100)', liquidityClass(item.liquidityLabel)));
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
    title.textContent = 'Senales de scam o abuso';
    scams.append(title);
    for (const signal of item.scamSignals) {
      const chip = document.createElement('span');
      chip.className = 'signal';
      chip.textContent = signal.text + ' - ' + signal.source;
      chip.title = signal.detail || '';
      scams.append(chip);
    }
  } else {
    const clean = document.createElement('span');
    clean.className = 'clean';
    clean.textContent = 'Sin senales publicas de scam en el analizador ni en sus votos.';
    scams.append(clean);
  }

  const links = document.createElement('div');
  links.className = 'sniper-links';
  for (const social of item.socials || []) {
    const anchor = document.createElement('a');
    const type = String(social.type || '').toLowerCase();
    anchor.href = type.includes('twitter') || type.includes('x') ? 'https://x.com/' + encodeURIComponent(social.handle) : social.handle;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = type.includes('twitter') || type.includes('x') ? 'X - @' + social.handle : social.type + ' - ' + social.handle;
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
  chart.textContent = 'Grafico';
  links.append(search, chart);

  article.append(top, scores, meta, liquidity, checks);
  if (factors.children.length) article.append(factors);
  article.append(scams, tradePanel(item), auditPanel(item), links);
  return article;
}

function render() {
  const grid = $('sniperGrid');
  const status = $('sniperStatus');
  const minimum = Number($('sniperMin').value || 0);
  const hideHigh = $('sniperHideHigh').checked;
  const query = ($('sniperSearch').value || '').toLowerCase().trim();
  const items = state.items.filter(item => item.score >= minimum && (!hideHigh || item.verdict !== 'ALTO RIESGO') && (!query || String(item.symbol || '').toLowerCase().includes(query)));
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

const usdInput = $('sniperUsd');
if (usdInput) {
  usdInput.value = String(state.usd);
  usdInput.addEventListener('change', () => {
    const value = Number(usdInput.value);
    if (!(value > 0)) { usdInput.value = String(state.usd); return; }
    state.usd = value;
    try { localStorage.setItem('jamd-sniper-usd', JSON.stringify(value)); } catch {}
    render();
  });
}
// ---- Radar en vivo: vigila tokens y avisa de cambios buenos y malos ----
(() => {
  const WATCH_KEY = 'jamd-sniper-watch';
  const SNAP_KEY = 'jamd-sniper-snap';
  const watch = new Map();
  const snap = new Map();
  const alerts = [];
  let timer = null;
  let dock = null;
  let listEl = null;
  let countEl = null;

  try {
    for (const entry of JSON.parse(localStorage.getItem(WATCH_KEY) || '[]')) if (entry?.mint) watch.set(entry.mint, entry);
    for (const [mint, value] of Object.entries(JSON.parse(localStorage.getItem(SNAP_KEY) || '{}'))) snap.set(mint, value);
  } catch {}

  const persist = () => {
    try { localStorage.setItem(WATCH_KEY, JSON.stringify([...watch.values()])); } catch {}
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(Object.fromEntries(snap))); } catch {}
  };

  const stamp = () => new Date().toLocaleTimeString();

  const push = (kind, symbol, text) => {
    alerts.unshift({ kind, symbol, text, at: stamp() });
    if (alerts.length > 40) alerts.pop();
    renderList();
    try {
      if (globalThis.Notification && Notification.permission === 'granted') {
        new Notification(symbol + ' · Radar', { body: text });
      }
    } catch {}
  };

  const renderList = () => {
    if (!listEl) return;
    listEl.replaceChildren();
    if (!alerts.length) {
      const empty = document.createElement('div');
      empty.className = 'radar-empty';
      empty.textContent = watch.size ? 'Sin cambios desde que empezaste a vigilar.' : 'Pulsa "Vigilar" en un token para seguirlo en vivo.';
      listEl.append(empty);
      return;
    }
    for (const alert of alerts.slice(0, 20)) {
      const row = document.createElement('div');
      row.className = 'radar-alert ' + alert.kind;
      const title = document.createElement('b');
      title.textContent = alert.symbol + ' · ' + alert.at;
      const text = document.createElement('span');
      text.textContent = alert.text;
      row.append(title, text);
      listEl.append(row);
    }
  };

  const ensureDock = () => {
    if (dock) return dock;
    dock = document.createElement('aside');
    dock.className = 'radar-dock';
    const head = document.createElement('header');
    const title = document.createElement('strong');
    title.textContent = 'Radar en vivo';
    countEl = document.createElement('span');
    countEl.className = 'radar-count';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = '—';
    toggle.className = 'radar-toggle';
    toggle.addEventListener('click', () => { dock.classList.toggle('collapsed'); toggle.textContent = dock.classList.contains('collapsed') ? '+' : '—'; });
    head.append(title, countEl, toggle);
    listEl = document.createElement('div');
    listEl.className = 'radar-list';
    const foot = document.createElement('footer');
    const enable = document.createElement('button');
    enable.type = 'button';
    enable.textContent = 'Activar notificaciones';
    enable.addEventListener('click', async () => {
      try {
        const permission = await Notification.requestPermission();
        enable.textContent = permission === 'granted' ? 'Notificaciones activas' : 'Permiso denegado';
        enable.disabled = true;
      } catch { enable.textContent = 'No disponible'; enable.disabled = true; }
    });
    foot.append(enable);
    dock.append(head, listEl, foot);
    document.body.append(dock);
    renderList();
    return dock;
  };

  const evaluate = (mint, symbol, info) => {
    if (!info) return;
    const previous = snap.get(mint) || null;
    if (previous) {
      const beforeLiquidity = Number(previous.liquidityUsd);
      const nowLiquidity = Number(info.liquidityUsd);
      if (Number.isFinite(beforeLiquidity) && beforeLiquidity > 0 && Number.isFinite(nowLiquidity)) {
        const change = (nowLiquidity - beforeLiquidity) / beforeLiquidity;
        if (change <= -0.2) push('bad', symbol, 'Liquidez retirada: ' + (change * 100).toFixed(1) + '% (' + Math.round(nowLiquidity) + ' USD)');
        else if (change <= -0.08) push('warn', symbol, 'Liquidez bajando: ' + (change * 100).toFixed(1) + '%');
        else if (change >= 0.2) push('good', symbol, 'Liquidez añadida: +' + (change * 100).toFixed(1) + '% (' + Math.round(nowLiquidity) + ' USD)');
      }
      const sells = Number(info.sells5m);
      const buys = Number(info.buys5m);
      if (Number.isFinite(sells) && Number.isFinite(buys) && sells >= 5 && sells >= buys * 3) push('bad', symbol, 'Presion vendedora: ' + sells + ' ventas / ' + buys + ' compras en 5 min');
      else if (Number.isFinite(sells) && Number.isFinite(buys) && buys >= 8 && buys >= sells * 2.5) push('good', symbol, 'Compras fuertes: ' + buys + ' compras / ' + sells + ' ventas en 5 min');
      const move = Number(info.change5m);
      if (Number.isFinite(move) && move <= -20) push('bad', symbol, 'Caida rapida: ' + move.toFixed(1) + '% en 5 min');
      else if (Number.isFinite(move) && move >= 25) push('good', symbol, 'Subida fuerte: +' + move.toFixed(1) + '% en 5 min');
    }
    snap.set(mint, { liquidityUsd: info.liquidityUsd, at: Date.now() });
    persist();
  };

  const poll = async () => {
    if (!watch.size) { if (countEl) countEl.textContent = ''; return; }
    if (countEl) countEl.textContent = watch.size + ' en seguimiento';
    const mints = [...watch.keys()];
    try {
      const response = await fetch(base + '/api/sniper-watch?x=' + Date.now(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mints })
      });
      if (!response.ok) return;
      const data = await response.json();
      for (const mint of mints) evaluate(mint, watch.get(mint)?.symbol || mint.slice(0, 4), data.items?.[mint]);
    } catch {}
  };

  const schedule = () => {
    clearInterval(timer);
    const interval = document.hidden ? 25000 : 8000;
    timer = setInterval(poll, interval);
  };

  const button = item => {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = 'radar-follow';
    const sync = () => {
      const active = watch.has(item.mint);
      control.textContent = active ? 'Vigilando' : 'Vigilar';
      control.classList.toggle('active', active);
    };
    control.addEventListener('click', event => {
      event.stopPropagation();
      if (watch.has(item.mint)) watch.delete(item.mint);
      else watch.set(item.mint, { mint: item.mint, symbol: item.symbol, pool: item.poolAddress });
      persist();
      sync();
      ensureDock();
      renderList();
      void poll();
    });
    sync();
    return control;
  };

  document.addEventListener('visibilitychange', schedule);
  globalThis.SniperRadar = { button };
  ensureDock();
  schedule();
  void poll();
})();

$('sniperRefresh').addEventListener('click', load);
$('sniperMin').addEventListener('change', render);
$('sniperHideHigh').addEventListener('change', render);
$('sniperSearch').addEventListener('input', render);
load();
