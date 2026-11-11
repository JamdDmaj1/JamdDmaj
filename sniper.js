const $ = id => document.getElementById(id);
const base = globalThis.Capacitor?.isNativePlatform?.() ? 'https://www.jamddmaj.com' : '';
const state = { items: [], data: {}, updatedAt: null, loading: false, usd: 5, solPrice: null, solPriceAt: 0, tab: 'new' };
const favorites = new Map();
try { for (const entry of JSON.parse(localStorage.getItem('jamd-sniper-favs') || '[]')) if (entry?.mint && Number(entry.savedAt) > 0) favorites.set(entry.mint, entry); } catch {}
const saveFavorites = () => { try { localStorage.setItem('jamd-sniper-favs', JSON.stringify([...favorites.values()])); } catch {} };
const history = [];
try { history.push(...JSON.parse(localStorage.getItem('jamd-sniper-history') || '[]')); } catch {}
const saveHistory = () => { try { localStorage.setItem('jamd-sniper-history', JSON.stringify(history.slice(0, 300))); } catch {} };
const recordTrade = entry => { history.unshift({ ...entry, at: entry.at || Date.now() }); saveHistory(); if (globalThis.paintTabs) globalThis.paintTabs(); };
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
  const decimalsOf = () => Number.isInteger(item.decimals) ? item.decimals : 6;
  const logTrade = (side, extra) => recordTrade({ mint: item.mint, symbol: item.symbol, side, venue: item.venue, priceUsd: item.priceUsd, mcap: item.marketCapUsd, tokens: extra.tokens || 0, usd: extra.usd || 0, sol: extra.sol || 0, tx: extra.tx || '' });

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
      logTrade('buy', { tokens: Number(result.outAmount) / Math.pow(10, decimalsOf()), usd: state.usd, sol, tx: result.signature });
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
      logTrade('buy', { tokens: Number(result.outAmount) / Math.pow(10, decimalsOf()), usd: solAmount * (state.solPrice || 0), sol: solAmount, tx: result.signature });
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
      logTrade('sell', { tokens: Number(result.rawAmount) / Math.pow(10, decimalsOf()), usd: (Number(result.outAmount) / 1e9) * (state.solPrice || 0), sol: Number(result.outAmount) / 1e9, tx: result.signature });
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
  if (item.boost) badges.append(badge('BOOST ' + (Number(item.boost.total) || Number(item.boost.amount) || 0) + ' USD', 'mejor'));
  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'sniper-star' + (favorites.has(item.mint) ? ' active' : '');
  star.textContent = favorites.has(item.mint) ? '★' : '☆';
  star.title = 'Guardar en favoritos';
  star.addEventListener('click', event => {
    event.stopPropagation();
    if (favorites.has(item.mint)) favorites.delete(item.mint);
    else favorites.set(item.mint, { ...item, savedAt: Date.now() });
    saveFavorites();
    star.textContent = favorites.has(item.mint) ? '★' : '☆';
    star.classList.toggle('active', favorites.has(item.mint));
    paintTabs();
    if (state.tab === 'fav') void load('fav');
  });
  badges.append(star);
  if (globalThis.SniperRadar) badges.append(globalThis.SniperRadar.button(item));
  top.append(symbol, badges);

  const cats = document.createElement('div');
  cats.className = 'sniper-cats';
  for (const category of item.categories || []) {
    const chip = document.createElement('span');
    chip.textContent = category;
    cats.append(chip);
  }

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
  metaItem('Market cap', money(item.marketCapUsd) + ' USD');
  const athItem = document.createElement('span');
  athItem.setAttribute('data-ath', item.mint);
  athItem.innerHTML = 'ATH mcap <b>cargando...</b>';
  meta.append(athItem);
  metaItem('Mercados', (item.pairsCount || 1) + ' - ' + ((item.venues || []).join('/') || 'n/d'));
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

  const contract = document.createElement('div');
  contract.className = 'sniper-contract';
  const contractLabel = document.createElement('span');
  contractLabel.textContent = 'Contrato';
  const contractCode = document.createElement('code');
  contractCode.textContent = item.mint;
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'sniper-copy';
  copyButton.textContent = 'Copiar';
  copyButton.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(item.mint); copyButton.textContent = 'Copiado'; }
    catch { copyButton.textContent = 'No disponible'; }
    setTimeout(() => { copyButton.textContent = 'Copiar'; }, 1600);
  });
  const solscan = document.createElement('a');
  solscan.href = 'https://solscan.io/token/' + item.mint;
  solscan.target = '_blank';
  solscan.rel = 'noopener noreferrer';
  solscan.textContent = 'Solscan';
  contract.append(contractLabel, contractCode, copyButton, solscan);

  const chartBox = document.createElement('details');
  chartBox.className = 'sniper-chart';
  const chartSummary = document.createElement('summary');
  chartSummary.textContent = 'Grafico en vivo';
  const chartFrameBox = document.createElement('div');
  chartFrameBox.className = 'sniper-chart-frame';
  chartBox.append(chartSummary, chartFrameBox);
  let chartLoaded = false;
  chartBox.addEventListener('toggle', () => {
    if (!chartBox.open || chartLoaded) return;
    chartLoaded = true;
    const frame = document.createElement('iframe');
    frame.loading = 'lazy';
    frame.title = 'Grafico ' + (item.symbol || '');
    frame.src = 'https://www.geckoterminal.com/solana/pools/' + encodeURIComponent(item.poolAddress || '') + '?embed=1&info=0&swaps=0&light_chart=1';
    frame.setAttribute('allowfullscreen', 'true');
    chartFrameBox.append(frame);
  });

  const trades = document.createElement('details');
  trades.className = 'sniper-trades';
  const tradesSummary = document.createElement('summary');
  tradesSummary.textContent = 'Quien compra y vende (en vivo)';
  const tradesBody = document.createElement('div');
  tradesBody.className = 'sniper-trades-body';
  trades.append(tradesSummary, tradesBody);
  let tradesTimer = null;
  let tradesLoaded = false;

  const short = value => String(value || '').slice(0, 4) + '...' + String(value || '').slice(-4);
  const when = value => { if (!value) return ''; const date = new Date(value); return date.toLocaleTimeString(); };

  const paintTrades = data => {
    tradesBody.replaceChildren();
    const head = document.createElement('div');
    head.className = 'sniper-trades-head';
    head.textContent = (data?.venue ? data.venue + ' · ' : '') + 'ultimas ' + (data?.items?.length || 0) + ' operaciones';
    tradesBody.append(head);
    if (!data?.items?.length) {
      const empty = document.createElement('div');
      empty.className = 'sniper-trades-empty';
      empty.textContent = 'Sin operaciones recientes detectadas.';
      tradesBody.append(empty);
      return;
    }
    for (const trade of data.items) {
      const row = document.createElement('div');
      row.className = 'sniper-trade-row ' + trade.side;
      const side = document.createElement('b');
      side.textContent = trade.side === 'buy' ? 'COMPRA' : 'VENTA';
      const amount = document.createElement('span');
      amount.textContent = (Number.isFinite(trade.usd) ? trade.usd.toFixed(2) + ' USD' : (Number.isFinite(trade.sol) ? trade.sol.toFixed(3) + ' SOL' : '—'));
      const wallet = document.createElement('a');
      wallet.href = 'https://solscan.io/account/' + trade.wallet;
      wallet.target = '_blank';
      wallet.rel = 'noopener noreferrer';
      wallet.textContent = short(trade.wallet);
      const time = document.createElement('small');
      time.textContent = when(trade.at);
      const link = document.createElement('a');
      link.href = 'https://solscan.io/tx/' + trade.tx;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'tx';
      row.append(side, amount, wallet, time, link);
      tradesBody.append(row);
    }
  };

  const loadTrades = async () => {
    try {
      const response = await fetch(base + '/api/sniper-trades?pool=' + encodeURIComponent(item.poolAddress || '') + '&mint=' + encodeURIComponent(item.mint) + '&x=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json();
      paintTrades({ ...data, venue: item.venue });
    } catch {}
  };

  trades.addEventListener('toggle', () => {
    if (trades.open) {
      if (!tradesLoaded) { tradesLoaded = true; tradesBody.textContent = 'Leyendo operaciones...'; void loadTrades(); }
      clearInterval(tradesTimer);
      tradesTimer = setInterval(loadTrades, 6000);
    } else {
      clearInterval(tradesTimer);
      tradesTimer = null;
    }
  });

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

  article.append(top, cats, actions, scores, liquidity, checks);
  if (factors.children.length) article.append(factors);
  article.append(contract, meta, scams, tradePanel(item), chartBox, trades, auditPanel(item), links);
  return article;
}

const TABS = [
  { id: 'new', label: 'Nuevos' },
  { id: 'trending', label: 'Trending' },
  { id: 'safe', label: 'Confiables' },
  { id: 'risk', label: 'Alto riesgo' },
  { id: 'fav', label: 'Favoritos' },
  { id: 'mine', label: 'Mis tokens' },
  { id: 'hist', label: 'Historial' },
  { id: 'volume', label: 'Mayor volumen' },
  { id: 'marketcap', label: 'Mayor market cap' }
];

function paintTabs() {
  const host = $('sniperTabs');
  if (!host) return;
  host.replaceChildren();
  for (const tab of TABS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sniper-tab' + (state.tab === tab.id ? ' active' : '');
    button.textContent = tab.label + (tab.id === 'fav' && favorites.size ? ' (' + favorites.size + ')' : '');
    button.addEventListener('click', () => { void load(tab.id); });
    host.append(button);
  }
}

const fmtPrice = value => { const number = Number(value); if (!Number.isFinite(number) || number <= 0) return '—'; return number >= 1 ? number.toFixed(4) : number.toPrecision(4); };
const fmtDate = value => new Date(value).toLocaleString();
const fmtHold = ms => { if (!Number.isFinite(ms) || ms <= 0) return '—'; const minutes = Math.round(ms / 60000); if (minutes < 60) return minutes + ' min'; const hours = Math.floor(minutes / 60); if (hours < 24) return hours + 'h ' + (minutes % 60) + 'm'; return Math.floor(hours / 24) + 'd ' + (hours % 24) + 'h'; };

function shareTrade(data) {
  if (!globalThis.JamdShare) { alert('El modulo de compartir todavia no esta cargado.'); return; }
  const basis = Math.max(0.01, Number(data.basis) || 0.01);
  const result = Number(data.pnlUsd) || 0;
  const details = [
    'Precio: $' + fmtPrice(data.priceUsd),
    'Market cap: ' + (Number.isFinite(Number(data.mcap)) ? money(Number(data.mcap)) + ' USD' : 'sin dato'),
    'Fecha: ' + fmtDate(data.at),
    'Tiempo de hold: ' + fmtHold(data.holdMs)
  ];
  globalThis.JamdShare.open({ doc: document, language: 'es', sourceButton: data.button || undefined, isCurrent: () => true, onClose: () => {}, item: { kind: 'SNIPER_TRADE', asset: String(data.symbol || '').toUpperCase(), closedAt: Number(data.at) || Date.now(), performance: { resultUsdcUnits: String(Math.round(result * 1e6)), returnBps: String(Math.round((result / basis) * 10000)), basisUsdcUnits: String(Math.round(basis * 1e6)) }, receivedUsdcUnits: String(Math.round(result * 1e6)), state: 'COMPLETED', details } });
}

function holdingsList() {
  const map = new Map();
  for (const trade of [...history].reverse()) {
    const tokens = Number(trade.tokens) || 0;
    if (!map.has(trade.mint)) map.set(trade.mint, { mint: trade.mint, symbol: trade.symbol, tokens: 0, invested: 0, entry: null, firstAt: trade.at, lastPrice: trade.priceUsd, lastMcap: trade.mcap });
    const row = map.get(trade.mint);
    if (trade.side === 'buy') {
      row.tokens += tokens; row.invested += Number(trade.usd) || 0;
      if (!row.entry && trade.priceUsd) row.entry = Number(trade.priceUsd);
      row.firstAt = Math.min(row.firstAt || trade.at, trade.at);
      if (trade.priceUsd) row.lastPrice = trade.priceUsd;
      if (trade.mcap) row.lastMcap = trade.mcap;
    } else {
      row.tokens = Math.max(0, row.tokens - tokens);
      row.invested = Math.max(0, row.tokens * (row.entry || 0));
    }
    if (trade.symbol) row.symbol = trade.symbol;
  }
  return [...map.values()].filter(row => row.tokens > 0.0000001);
}

async function renderHoldings() {
  const grid = document.getElementById('sniperGrid');
  const status = document.getElementById('sniperStatus');
  const rows = holdingsList();
  grid.replaceChildren();
  if (!rows.length) { status.textContent = 'Aun no tienes tokens comprados desde Sniper.'; return; }
  status.textContent = 'Leyendo precios en vivo de ' + rows.length + ' token(es)...';
  let live = {};
  try {
    const response = await fetch(base + '/api/sniper-watch?x=' + Date.now(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mints: rows.map(row => row.mint) }) });
    if (response.ok) live = (await response.json()).items || {};
  } catch {}
  for (const row of rows) {
    const info = live[row.mint] || {};
    const price = Number(info.priceUsd) || row.lastPrice;
    const value = price && row.tokens ? price * row.tokens : row.invested;
    const pnl = value - row.invested;
    const pct = row.invested > 0 ? (pnl / row.invested) * 100 : 0;
    const article = document.createElement('article');
    article.className = 'sniper-card';
    const top = document.createElement('div'); top.className = 'sniper-card-top';
    const symbol = document.createElement('span'); symbol.className = 'sniper-symbol'; symbol.textContent = row.symbol || row.mint.slice(0, 6);
    const badges = document.createElement('div'); badges.className = 'sniper-badges';
    badges.append(badge((pnl >= 0 ? '+' : '') + pct.toFixed(2) + '%', pnl >= 0 ? 'mejor' : 'alto'));
    top.append(symbol, badges);
    const meta = document.createElement('div'); meta.className = 'sniper-metabar';
    const metaItem = (name, valueText) => { const span = document.createElement('span'); span.innerHTML = name + ' <b>' + valueText + '</b>'; meta.append(span); };
    metaItem('Invertido', row.invested.toFixed(2) + ' USD');
    metaItem('Valor', value.toFixed(2) + ' USD');
    metaItem('Entrada', fmtPrice(row.entry) + ' USD');
    metaItem('Precio', fmtPrice(price) + ' USD');
    metaItem('MCap', Number.isFinite(Number(row.lastMcap)) ? money(Number(row.lastMcap)) + ' USD' : 'sin dato');
    metaItem('Hold', fmtHold(Date.now() - (row.firstAt || Date.now())));
    const share = document.createElement('button'); share.type = 'button'; share.className = 'sniper-share-btn'; share.textContent = 'Compartir imagen';
    share.addEventListener('click', () => shareTrade({ symbol: row.symbol, priceUsd: price, mcap: row.lastMcap, at: Date.now(), holdMs: Date.now() - (row.firstAt || Date.now()), pnlUsd: pnl, basis: row.invested, button: share }));
    article.append(top, meta, share);
    grid.append(article);
  }
  status.textContent = rows.length + ' token(s) en cartera segun tus operaciones.';
}

function renderHistory() {
  const grid = document.getElementById('sniperGrid');
  const status = document.getElementById('sniperStatus');
  grid.replaceChildren();
  if (!history.length) { status.textContent = 'Tu historial de Sniper esta vacio.'; return; }
  for (const trade of history.slice(0, 60)) {
    const row = document.createElement('div'); row.className = 'sniper-history-row';
    const side = document.createElement('b'); side.className = trade.side; side.textContent = trade.side === 'buy' ? 'COMPRA' : 'VENTA';
    const symbol = document.createElement('strong'); symbol.textContent = trade.symbol || '—';
    const amount = document.createElement('span'); amount.textContent = (Number(trade.usd) ? Number(trade.usd).toFixed(2) : '—') + ' USD';
    const price = document.createElement('span'); price.textContent = 'Precio ' + fmtPrice(trade.priceUsd) + ' USD';
    const mcap = document.createElement('span'); mcap.textContent = 'MCap ' + (Number.isFinite(Number(trade.mcap)) ? money(Number(trade.mcap)) : 'sin dato');
    const date = document.createElement('small'); date.textContent = fmtDate(trade.at);
    const hold = document.createElement('small');
    const first = [...history].reverse().find(entry => entry.mint === trade.mint && entry.side === 'buy');
    hold.textContent = trade.side === 'sell' && first ? 'Hold ' + fmtHold(trade.at - first.at) : '';
    const share = document.createElement('button'); share.type = 'button'; share.className = 'sniper-share-btn'; share.textContent = 'Compartir';
    share.addEventListener('click', () => shareTrade({ symbol: trade.symbol, priceUsd: trade.priceUsd, mcap: trade.mcap, at: trade.at, holdMs: trade.side === 'sell' && first ? trade.at - first.at : Date.now() - trade.at, pnlUsd: trade.side === 'sell' ? (Number(trade.usd) || 0) - (Number(trade.invested) || Number(trade.usd) || 0) : 0, basis: Number(trade.invested) || Number(trade.usd) || 1, button: share }));
    row.append(side, symbol, amount, price, mcap, date, hold, share);
    grid.append(row);
  }
  status.textContent = history.length + ' operacion(es) registradas.';
}

const athCache = (() => { try { return JSON.parse(localStorage.getItem('jamd-sniper-ath') || '{}'); } catch { return {}; } })();
const saveAthCache = () => { try { localStorage.setItem('jamd-sniper-ath', JSON.stringify(athCache)); } catch {} };
const applyAth = (mint, value) => {
  const element = document.querySelector('[data-ath="' + mint + '"]');
  if (!element) return;
  if (!value || !value.available) { element.innerHTML = 'ATH mcap <b>sin dato</b>'; return; }
  const fromAth = Number(value.fromAthPct);
  element.innerHTML = 'ATH mcap <b>' + (value.athMarketCap ? money(value.athMarketCap) + ' USD' : 'sin dato') + '</b>' + (Number.isFinite(fromAth) ? ' · ' + fromAth.toFixed(1) + '% del ATH' : '');
};
let athQueueRunning = false;
async function loadAth(items) {
  if (athQueueRunning) return;
  athQueueRunning = true;
  try {
    for (const item of items.slice(0, 10)) {
      if (!item.poolAddress) continue;
      const cached = athCache[item.poolAddress];
      if (cached && Date.now() - cached.at < 21600000) { applyAth(item.mint, cached.value); continue; }
      try {
        const response = await fetch(base + '/api/sniper-ath?pool=' + encodeURIComponent(item.poolAddress) + '&mcap=' + encodeURIComponent(item.marketCapUsd || '') + '&price=' + encodeURIComponent(item.priceUsd || ''));
        if (!response.ok) { await new Promise(resolve => setTimeout(resolve, 1200)); continue; }
        const value = await response.json();
        athCache[item.poolAddress] = { at: Date.now(), value };
        saveAthCache();
        if (value.available) applyAth(item.mint, value);
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  } finally { athQueueRunning = false; }
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

function autoFollow(items, source) {
  if (!globalThis.SniperRadar || state.tab === 'fav' || state.tab === 'mine' || state.tab === 'hist') return;
  let added = 0;
  for (const item of items.slice(0, 12)) if (globalThis.SniperRadar.add(item)) added++;
  if (added) globalThis.SniperRadar.pollNow();
}

function detectNew(items, source) {
  try {
    const key = 'jamd-sniper-seen-' + source;
    const seen = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
    const firstRun = seen.size === 0;
    for (const item of items) {
      if (seen.has(item.mint)) continue;
      if (!firstRun && globalThis.SniperRadar) globalThis.SniperRadar.push('info', item.symbol || '', 'Token nuevo en la lista: ' + (item.symbol || item.mint.slice(0, 6)));
    }
    localStorage.setItem(key, JSON.stringify(items.map(item => item.mint).slice(0, 200)));
  } catch {}
}

async function load(tab = state.tab) {
  state.tab = tab;
  paintTabs();
  if (tab === 'fav') {
    state.items = [...favorites.values()];
    $('sniperStatus').textContent = state.items.length ? state.items.length + ' favorito(s).' : 'Aun no has guardado favoritos: pulsa la estrella en un token.';
    render();
    return;
  }
  const source = tab === 'safe' || tab === 'risk' ? 'trending' : tab;
  if (state.loading) return;
  state.loading = true;
  $('sniperRefresh').disabled = true;
  if (!state.data[source]) $('sniperStatus').textContent = 'Analizando tokens...';
  try {
    if (!state.data[source]) {
      const response = await fetch(base + '/api/sniper?tab=' + source + '&x=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      state.data[source] = Array.isArray(data.items) ? data.items : [];
      if (data.error) state.data[source] = [];
      state.updatedAt = data.observedAt || Date.now();
      $('sniperUpdated').textContent = 'Actualizado ' + new Date(state.updatedAt).toLocaleTimeString();
    }
    let items = state.data[source] || [];
    if (tab === 'safe') items = items.filter(item => item.score >= 75);
    if (tab === 'risk') items = items.filter(item => item.score <= 30);
    state.items = items;
    if (!items.length) $('sniperStatus').textContent = tab === 'safe' ? 'Ningun token alcanza 75 de seguridad ahora mismo.' : tab === 'risk' ? 'Ningun token con riesgo alto en esta muestra.' : 'Sin resultados ahora mismo.';
    render();
  } catch (error) {
    $('sniperStatus').textContent = 'No se pudo analizar ahora: ' + (error?.message || error);
  } finally {
    state.loading = false;
    $('sniperRefresh').disabled = false;
  }
}

function refreshTab() { state.data = {}; void load(state.tab); }

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
    const beforeVenues = Array.isArray(previous?.venues) ? previous.venues.length : 0;
    const nowVenues = Array.isArray(info.venues) ? info.venues.length : 0;
    if (previous) {
      if (nowVenues > beforeVenues) push('info', symbol, 'Nuevo listado: ' + nowVenues + ' mercado(s) - ' + (info.venues || []).join(', '));
      else if (nowVenues < beforeVenues) push('bad', symbol, 'Perdio un listado: ahora ' + nowVenues + ' mercado(s)');
      const beforeBoost = Number(previous.boostTotal) || 0;
      const nowBoost = Number(info.boostTotal) || 0;
      if (nowBoost > beforeBoost) push('good', symbol, 'Marketing: boost activo por ' + nowBoost + ' USD');
      else if (!nowBoost && beforeBoost > 0) push('warn', symbol, 'El boost de marketing termino');
    }
    snap.set(mint, { liquidityUsd: info.liquidityUsd, venues: info.venues || [], boostTotal: Number(info.boostTotal) || 0, at: Date.now() });
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

  const SOCIAL_KEY = 'jamd-sniper-social';
  let socialSnap = {};
  try { socialSnap = JSON.parse(localStorage.getItem(SOCIAL_KEY) || '{}'); } catch {}
  const saveSocial = () => { try { localStorage.setItem(SOCIAL_KEY, JSON.stringify(socialSnap)); } catch {} };

  const pollSocial = async () => {
    const items = [...watch.values()].filter(entry => entry.mint).slice(0, 8);
    if (!items.length) return;
    try {
      const response = await fetch(base + '/api/sniper-social?x=' + Date.now(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: items.map(entry => ({ mint: entry.mint, symbol: entry.symbol, handle: entry.handle || null })) })
      });
      if (!response.ok) return;
      const data = await response.json();
      for (const entry of items) {
        const info = data.items?.[entry.mint];
        if (!info) continue;
        const previous = socialSnap[entry.mint] || null;
        const symbol = entry.symbol || entry.mint.slice(0, 4);
        if (previous) {
          const profile = info.x || {};
          const beforeProfile = previous.x || {};
          if (beforeProfile.exists && !profile.exists) push('bad', symbol, 'La cuenta de X @' + (entry.handle || '') + ' desaparecio o fue suspendida');
          if (profile.exists && Number.isFinite(profile.followers) && Number.isFinite(beforeProfile.followers) && beforeProfile.followers > 0) {
            const delta = (profile.followers - beforeProfile.followers) / beforeProfile.followers;
            if (delta >= 0.05) push('good', symbol, 'Seguidores en X +' + (delta * 100).toFixed(1) + '% (' + profile.followers + ')');
            else if (delta <= -0.05) push('bad', symbol, 'Seguidores en X ' + (delta * 100).toFixed(1) + '% (' + profile.followers + ')');
          }
          if (Number.isFinite(profile.tweets) && Number.isFinite(beforeProfile.tweets)) {
            const posted = profile.tweets - beforeProfile.tweets;
            if (posted >= 2) push('info', symbol, 'La cuenta de X publico ' + posted + ' mensajes nuevos');
          }
          const down = Number(info.votes?.down) || 0;
          const beforeDown = Number(previous.votes?.down) || 0;
          if (down - beforeDown >= 3) push('bad', symbol, 'Votos negativos en la comunidad +' + (down - beforeDown) + ' (total ' + down + ')');
          const up = Number(info.votes?.up) || 0;
          const beforeUp = Number(previous.votes?.up) || 0;
          if (up - beforeUp >= 3) push('good', symbol, 'Votos positivos en la comunidad +' + (up - beforeUp) + ' (total ' + up + ')');
          const scam = Number(info.search?.scam) || 0;
          const beforeScam = Number(previous.search?.scam) || 0;
          if (scam >= 3 && scam - beforeScam >= 2) push('bad', symbol, scam + ' resultados publicos lo llaman scam (antes ' + beforeScam + ')');
          else if (scam >= 5 && beforeScam < 5) push('bad', symbol, 'Ya hay ' + scam + ' resultados que lo llaman scam');
        }
        socialSnap[entry.mint] = info;
      }
      saveSocial();
    } catch {}
  };

  let socialTimer = null;
  const scheduleSocial = () => {
    clearInterval(socialTimer);
    socialTimer = setInterval(() => { void pollSocial(); }, 90000);
  };

  const schedule = () => {
    clearInterval(timer);
    const interval = document.hidden ? 25000 : 8000;
    timer = setInterval(poll, interval);
  };

  const add = item => {
    if (!item?.mint || watch.has(item.mint)) return false;
    watch.set(item.mint, { mint: item.mint, symbol: item.symbol, pool: item.poolAddress, handle: (item.socials || []).find(social => /twitter|x/i.test(String(social.type || '')))?.handle || null });
    persist();
    ensureDock();
    renderList();
    return true;
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
      else watch.set(item.mint, { mint: item.mint, symbol: item.symbol, pool: item.poolAddress, handle: (item.socials || []).find(social => /twitter|x/i.test(String(social.type || '')))?.handle || null });
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
  globalThis.SniperRadar = { button, add, push, pollNow: poll, has: mint => watch.has(mint) };
  ensureDock();
  schedule();
  scheduleSocial();
  void poll();
  void pollSocial();
})();

$('sniperRefresh').addEventListener('click', refreshTab);
$('sniperMin').addEventListener('change', render);
$('sniperHideHigh').addEventListener('change', render);
$('sniperSearch').addEventListener('input', render);
load('new');

// La informacion se refresca sola: la pestana activa cada 45 segundos y el radar cada pocos segundos.
setInterval(() => {
  if (document.hidden) return;
  const source = state.tab === 'safe' || state.tab === 'risk' ? 'trending' : state.tab;
  if (source === 'mine' || source === 'hist' || source === 'fav') { void load(state.tab); return; }
  delete state.data[source];
  void load(state.tab);
  if (globalThis.SniperRadar) globalThis.SniperRadar.pollNow();
}, 45000);
