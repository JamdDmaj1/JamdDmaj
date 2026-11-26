const $ = id => document.getElementById(id);
const base = globalThis.Capacitor?.isNativePlatform?.() ? 'https://www.jamddmaj.com' : '';
const state = { items: [], data: {}, updatedAt: null, loading: false, usd: 5, solPrice: null, solPriceAt: 0, tab: 'new', lookupItem: null, lookupMint: '', lookupLoading: false, lookupError: '', coverage: null, sort: 'safety', auto: true, seq: 0 };
const favorites = new Map();
try { for (const entry of JSON.parse(localStorage.getItem('jamd-sniper-favs') || '[]')) if (entry?.mint && Number(entry.savedAt) > 0) favorites.set(entry.mint, entry); } catch {}
const saveFavorites = () => { try { localStorage.setItem('jamd-sniper-favs', JSON.stringify([...favorites.values()])); } catch {} };
const history = [];
try { const stored = JSON.parse(localStorage.getItem('jamd-sniper-history') || '[]'); for (const entry of Array.isArray(stored) ? stored : []) { if (entry && Number(entry.savedAt) > 0 && String(entry.tx || '').length >= 60) history.push(entry); } } catch {}
const saveHistory = () => { try { localStorage.setItem('jamd-sniper-history', JSON.stringify(history.slice(0, 300))); } catch {} };
const recordTrade = entry => { if (String(entry.tx || '').length < 60) return; history.unshift({ ...entry, at: entry.at || Date.now(), savedAt: Date.now() }); saveHistory(); if (globalThis.paintTabs) globalThis.paintTabs(); };
try { const saved = Number(JSON.parse(localStorage.getItem('jamd-sniper-usd') || 'null')); if (saved > 0) state.usd = saved; } catch {}

const marks = { ok: '✓', high: '✕', critical: '✕', medium: '!', low: '·' };
const verdictClass = verdict => ['HIGH RISK','ALTO RIESGO'].includes(verdict) ? 'alto' : ['MEDIUM','MEDIO'].includes(verdict) ? 'medio' : ['CAUTION','PRUDENCIA'].includes(verdict) ? 'prudencia' : 'mejor';
const growthClass = label => ['HIGH','ALTO'].includes(label) ? 'mejor' : ['MODERATE','MODERADO'].includes(label) ? 'prudencia' : 'medio';
const liquidityClass = label => ['HIGH','ALTO'].includes(label) ? 'alto' : ['MEDIUM','MEDIO'].includes(label) ? 'medio' : 'mejor';

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
  const instantLabel = () => { instant.textContent = 'Buy ' + state.usd + ' USD instantly'; };
  instantLabel();

  const quick = document.createElement('div');
  quick.className = 'sniper-quick';
  const quoteLine = document.createElement('div');
  quoteLine.className = 'sniper-quote';
  quoteLine.textContent = 'Choose an amount to see the live price.';
  const statusLine = document.createElement('div');
  statusLine.className = 'sniper-trade-status';
  const buyButton = document.createElement('button');
  buyButton.type = 'button';
  buyButton.className = 'sniper-buy';
  buyButton.textContent = 'Buy selected amount';
  const sellButton = document.createElement('button');
  sellButton.type = 'button';
  sellButton.className = 'sniper-sell';
  sellButton.textContent = 'Sell all';

  let solAmount = 0.1;
  let quoteAt = 0;
  let quoteToken = 0;
  const decimalsOf = () => Number.isInteger(item.decimals) ? item.decimals : 6;
  const logTrade = (side, extra) => recordTrade({ mint: item.mint, symbol: item.symbol, side, venue: item.venue, priceUsd: item.priceUsd, mcap: item.marketCapUsd, tokens: extra.tokens || 0, usd: extra.usd || 0, sol: extra.sol || 0, tx: extra.tx || '' });

  const setStatus = text => { statusLine.textContent = text; if (setStatusHook) setStatusHook(text); };
  const report = signature => {
    setStatus('Sent: ' + signature.slice(0, 10) + '...');
    const link = document.createElement('a');
    link.href = 'https://solscan.io/tx/' + signature;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'view on Solscan';
    statusLine.append(' ', link);
  };

  const refreshQuote = async () => {
    if (!api() || !api().provider()) { quoteLine.textContent = 'Phantom is not available in this browser.'; return; }
    const token = ++quoteToken;
    try {
      const data = await api().quote({ mint: item.mint, solAmount, slippageBps: 120 });
      if (token !== quoteToken) return;
      quoteAt = Date.now();
      const decimals = Number.isInteger(item.decimals) ? item.decimals : 6;
      const tokens = Number(data.outAmount || 0) / Math.pow(10, decimals);
      quoteLine.textContent = solAmount + ' SOL ~ ' + tokens.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' ' + (item.symbol || '') + ' - impact ' + (Number(data.priceImpactPct) * 100).toFixed(2) + '%';
    } catch (error) {
      if (token === quoteToken) quoteLine.textContent = 'No route right now: ' + (error?.message || error);
    }
  };

  const customSol = document.createElement('input');
  customSol.type = 'number';
  customSol.min = '0.005';
  customSol.step = '0.01';
  customSol.placeholder = 'SOL';
  customSol.className = 'sniper-sol-input';
  customSol.addEventListener('change', () => {
    const value = Number(customSol.value);
    if (value > 0) { solAmount = value; void refreshQuote(); }
  });
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
    if (!api()) { setStatus('Reload the page to load the buy module.'); return; }
    try {
      if (!api().provider()) { setStatus('Phantom is not available here.'); offerPhantom(); return; }
      instant.disabled = true;
      instant.textContent = 'Buying ' + state.usd + ' USD...';
      if (!api().key()) { setStatus('Connecting Phantom...'); await api().connect(); }
      const price = await solPrice();
      if (!price) throw new Error('no SOL price');
      const sol = state.usd / price;
      setStatus('Quoting ' + state.usd + ' USD (' + sol.toFixed(4) + ' SOL)...');
      const result = await api().buy({ mint: item.mint, solAmount: sol, slippageBps: 150 });
      logTrade('buy', { tokens: Number(result.outAmount) / Math.pow(10, decimalsOf()), usd: state.usd, sol, tx: result.signature });
      report(result.signature);
    } catch (error) {
      const text = String(error?.message || error);
      setStatus(text === 'phantom-missing' ? 'Phantom is not available here.' : 'Could not buy: ' + text);
    } finally {
      instant.disabled = false;
      instantLabel();
    }
  });

  buyButton.addEventListener('click', async () => {
    if (!api()) { setStatus('Reload the page to load the buy module.'); return; }
    try {
      if (!api().provider()) { setStatus('Phantom is not available here.'); offerPhantom(); return; }
      buyButton.disabled = true;
      if (!api().key()) { setStatus('Connecting Phantom...'); await api().connect(); }
      if (!quoteAt || Date.now() - quoteAt > 4000) await refreshQuote();
      setStatus('Signing in Phantom...');
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
    if (!api()) { setStatus('Reload the page to load the sell module.'); return; }
    try {
      if (!api().provider()) { setStatus('Phantom is not available here.'); offerPhantom(); return; }
      sellButton.disabled = true;
      if (!api().key()) { setStatus('Connecting Phantom...'); await api().connect(); }
      setStatus('Reading your balance...');
      const result = await api().sellAll({ mint: item.mint, slippageBps: 150 });
      logTrade('sell', { tokens: Number(result.rawAmount) / Math.pow(10, decimalsOf()), usd: (Number(result.outAmount) / 1e9) * (state.solPrice || 0), sol: Number(result.outAmount) / 1e9, tx: result.signature });
      report(result.signature);
    } catch (error) {
      const text = String(error?.message || error);
      setStatus(text === 'no-balance' ? 'You do not hold this token in the connected wallet.' : 'Could not sell: ' + text);
    } finally {
      sellButton.disabled = false;
    }
  });

  const warning = document.createElement('small');
  warning.className = 'sniper-warning';
  warning.textContent = 'Real transaction with your wallet. Review the impact before signing.';

  wrap.append(instant, quick, quoteLine, statusLine, buyButton, sellButton, warning);
  return wrap;
}

function auditPanel(item) {
  const box = document.createElement('div');
  box.className = 'sniper-audit';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sniper-audit-btn';
  button.textContent = 'Deep audit: website, X and chain';
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
    const xName = x.handle ? '<a href="https://x.com/' + x.handle + '" target="_blank" rel="noopener noreferrer">@' + x.handle + '</a>' : 'not published';
    const siteName = site.url ? '<a href="' + site.url + '" target="_blank" rel="noopener noreferrer">' + (site.domain || site.url) + '</a>' : 'no website published';
    body.append(section('Website', [
      'Site: ' + siteName,
      'Status: ' + (site.ok ? 'responds' : 'does not respond') + (site.title ? ' - ' + String(site.title).slice(0, 60) : ''),
      'Links token X account: ' + (site.hasXLink ? 'yes' : 'no')
    ], site.flags));
    body.append(section('X account', [
      'Account: ' + xName,
      'Age: ' + (Number.isFinite(x.joinedDays) ? x.joinedDays + ' days' : '--') + ' - Followers: ' + (Number.isFinite(x.followers) ? x.followers.toLocaleString('en-US') : '--'),
      'Tweets: ' + (Number.isFinite(x.tweets) ? x.tweets : '--') + ' - Verified: ' + (x.verified ? 'yes' : 'no')
    ], x.flags));
    body.append(section('Chain (recent sample)', [
      'Transactions: ' + (chain.sampled ?? 0),
      'Buys: ' + (chain.buys ?? 0) + ' - Sells: ' + (chain.sells ?? 0),
      'Wallets: ' + (chain.uniqueTraders ?? 0) + ' - SOL bought: ' + (chain.solVolume ?? 0),
      'Burns: ' + (chain.burns ?? 0) + (chain.burnAmount ? ' - amount ' + chain.burnAmount : '')
    ], chain.flags));
    if (data.penaltyScore) {
      const summary = document.createElement('div');
      summary.className = 'sniper-audit-summary';
      summary.textContent = 'Estimated additional penalty: ' + data.penaltyScore + '/100';
      body.append(summary);
    }
  };

  button.addEventListener('click', async () => {
    body.hidden = false;
    if (cached) { render(cached); return; }
    button.disabled = true;
    button.textContent = 'Analyzing website, X and chain...';
    try {
      const response = await fetch(base + '/api/sniper-audit?x=' + Date.now(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mint: item.mint, poolAddress: item.poolAddress, symbol: item.symbol, socials: item.socials || [], websites: item.websites || [] })
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      cached = await response.json();
      render(cached);
      button.textContent = 'Refresh audit';
    } catch (error) {
      body.replaceChildren();
      const row = document.createElement('div');
      row.className = 'sniper-audit-flag high';
      row.textContent = 'Could not audit: ' + (error?.message || error);
      body.append(row);
      button.textContent = 'Retry audit';
    } finally {
      button.disabled = false;
    }
  });

  box.append(button, body);
  return box;
}

const TIPS = {
  seguridad: 'Safety score from 0 to 100 based on mint and freeze authority, locked liquidity, holder concentration, real liquidity and pool age. Higher is less risky; it does not guarantee safety.',
  potencial: 'Estimated potential from 0 to 100 based on price momentum, volume/liquidity turnover, buy pressure and depth. Risk caps the score. It is not a prediction.',
  liquidez: 'Liquidity withdrawal risk: percentage of LP locked, creator share, real liquidity and pool age. HIGH means the LP can be drained.',
  ath: 'All-time-high market cap using the highest pair price and estimated supply, measured since the pair was created.',
  categorias: 'Estimated tags from the name, venue and marketing. They are not official categories.',
  boost: 'Paid promotion detected on DexScreener. It does not imply quality or safety.',
  mercado: 'Number of markets listing the pair and which venues carry it.'
};
let tipTimer = null;
let tipNode = null;
function hideTip() { if (tipTimer) { clearTimeout(tipTimer); tipTimer = null; } if (tipNode) { tipNode.remove(); tipNode = null; } }
function showTip(anchor, text) {
  hideTip();
  const node = document.createElement('div');
  node.className = 'sniper-tip';
  node.textContent = text;
  document.body.append(node);
  const rect = anchor.getBoundingClientRect();
  const width = Math.min(280, window.innerWidth - 24);
  node.style.maxWidth = width + 'px';
  const left = Math.min(Math.max(12, rect.left - width / 2 + rect.width / 2), window.innerWidth - width - 12);
  node.style.left = left + 'px';
  node.style.top = (rect.bottom + 8) + 'px';
  tipNode = node;
}
function infoBadge(key) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'sniper-info';
  button.textContent = '?';
  button.setAttribute('aria-label', 'Mas informacion');
  const text = TIPS[key] || '';
  button.addEventListener('mouseenter', () => { if (tipTimer) clearTimeout(tipTimer); tipTimer = setTimeout(() => showTip(button, text), 3000); });
  button.addEventListener('mouseleave', hideTip);
  button.addEventListener('focus', () => { tipTimer = setTimeout(() => showTip(button, text), 800); });
  button.addEventListener('blur', hideTip);
  button.addEventListener('click', event => { event.stopPropagation(); if (tipNode && tipNode.textContent === text) hideTip(); else showTip(button, text); });
  return button;
}

function whyPanel(item) {
  const box = document.createElement('details');
  box.className = 'sniper-why';
  const head = document.createElement('summary');
  head.textContent = 'Why did it move?';
  const body = document.createElement('div');
  body.className = 'sniper-why-body';
  box.append(head, body);
  let loaded = false;
  const paint = data => {
    body.replaceChildren();
    const title = document.createElement('div');
    title.className = 'sniper-why-title';
    title.textContent = data.summary || 'No summary';
    body.append(title);
    const stats = document.createElement('div');
    stats.className = 'sniper-why-stats';
    const change = value => value === null || value === undefined ? '—' : (value > 0 ? '+' : '') + Number(value).toFixed(1) + '%';
    stats.textContent = '5m ' + change(data.changes?.m5) + ' · 1h ' + change(data.changes?.h1) + ' · 24h ' + change(data.changes?.h24) + ' · Vol 1h ' + money(data.volumes?.h1) + ' USD';
    body.append(stats);
    const list = document.createElement('ul');
    list.className = 'sniper-why-list';
    for (const entry of data.evidence || []) {
      const row = document.createElement('li');
      row.className = entry.type || 'info';
      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = entry.type === 'good' ? '▲' : entry.type === 'bad' ? '▼' : entry.type === 'warn' ? '!' : '·';
      const text = document.createElement('span');
      text.textContent = entry.text;
      row.append(mark, text);
      list.append(row);
    }
    body.append(list);
  };
  const load = async () => {
    if (loaded) return;
    loaded = true;
    body.textContent = 'Gathering evidence: volume, large buys, listings and marketing...';
    try {
      const response = await fetch(base + '/api/sniper-why?mint=' + encodeURIComponent(item.mint) + '&pool=' + encodeURIComponent(item.poolAddress || '') + '&symbol=' + encodeURIComponent(item.symbol || '') + '&x=' + Date.now(), { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      paint(await response.json());
    } catch (error) {
      body.textContent = 'Could not analyze the move: ' + (error?.message || error);
      loaded = false;
    }
  };
  box.addEventListener('toggle', () => { if (box.open) void load(); });
  const bigMove = Math.abs(Number(item.change5m) || 0) >= 15 || Math.abs(Number(item.change1h) || 0) >= 30;
  if (bigMove) box.setAttribute('data-auto', 'true');
  return box;
}

function closeDetail() {
  const overlay = document.getElementById('sniperDetail');
  if (!overlay) return;
  overlay.hidden = true;
  overlay.replaceChildren();
  document.body.classList.remove('sniper-locked');
}

function openDetail(item) {
  const overlay = document.getElementById('sniperDetail');
  if (!overlay) return;
  overlay.replaceChildren();
  overlay.hidden = false;
  document.body.classList.add('sniper-locked');

  const sheet = document.createElement('div');
  sheet.className = 'sniper-sheet';
  const head = document.createElement('header');
  head.className = 'sniper-sheet-head';
  const title = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = item.symbol || 'Token';
  const subtitle = document.createElement('small');
  subtitle.textContent = (item.categories || []).join(' · ') || 'Sin categoria';
  title.append(name, subtitle);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'sniper-sheet-close';
  close.textContent = 'Close';
  close.addEventListener('click', closeDetail);
  head.append(title, close);

  const stats = document.createElement('div');
  stats.className = 'sniper-sheet-stats';
  const stat = (label, value) => {
    const card = document.createElement('div');
    const key = document.createElement('span');
    key.textContent = label;
    const val = document.createElement('b');
    val.textContent = value;
    card.append(key, val);
    stats.append(card);
  };
  stat('Safety', String(item.score) + '/100');
  stat('Potential', String(item.growth?.score ?? '—') + '/100');
  stat('Market cap', money(item.marketCapUsd) + ' USD');
  stat('Liquidity', money(item.liquidity) + ' USD');
  stat('LP locked', Number.isFinite(item.lpLockedPct) ? Math.round(item.lpLockedPct) + '%' : 'no data');
  stat('Holders', Number.isFinite(item.holders) ? String(item.holders) : 'no data');
  stat('Markets', (item.pairsCount || 1) + ' - ' + ((item.venues || []).join('/') || 'n/a'));
  stat('Age', age(item.ageMinutes));

  const contract = document.createElement('div');
  contract.className = 'sniper-contract';
  const contractLabel = document.createElement('span');
  contractLabel.textContent = 'Contract';
  const code = document.createElement('code');
  code.textContent = item.mint;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'sniper-copy';
  copy.textContent = 'Copy';
  copy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(item.mint); copy.textContent = 'Copied'; } catch { copy.textContent = 'Unavailable'; }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1600);
  });
  const scan = document.createElement('a');
  scan.href = 'https://solscan.io/token/' + item.mint;
  scan.target = '_blank';
  scan.rel = 'noopener noreferrer';
  scan.textContent = 'Solscan';
  contract.append(contractLabel, code, copy, scan);

  const chartBox = document.createElement('details');
  chartBox.className = 'sniper-chart';
  const chartSummary = document.createElement('summary');
  chartSummary.textContent = 'Live chart';
  const frame = document.createElement('iframe');
  frame.loading = 'lazy';
  frame.title = 'Chart ' + (item.symbol || '');
  frame.dataset.src = 'https://www.geckoterminal.com/solana/pools/' + encodeURIComponent(item.poolAddress || '') + '?embed=1&info=0&swaps=0&light_chart=1';
  frame.setAttribute('allowfullscreen', 'true');
  const chartLink = document.createElement('a');
  chartLink.className = 'sniper-chart-link';
  chartLink.href = 'https://www.geckoterminal.com/solana/pools/' + encodeURIComponent(item.poolAddress || '');
  chartLink.target = '_blank';
  chartLink.rel = 'noopener noreferrer';
  chartLink.textContent = 'Open full chart on GeckoTerminal';
  chartBox.append(chartSummary, frame, chartLink);
  chartBox.addEventListener('toggle', () => { if (chartBox.open && !frame.src && frame.dataset.src) frame.src = frame.dataset.src; }, {once: false});


  const why = whyPanel(item);

  sheet.append(head, stats, contract, chartBox, tradePanel(item), why, auditPanel(item));
  overlay.append(sheet);
  why.open = true;
  overlay.onclick = event => { if (event.target === overlay) closeDetail(); };
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
  badges.append(badge(item.verdict, verdictClass(item.verdict)), badge('Potential ' + (item.growth?.label || '—'), growthClass(item.growth?.label)));
  if (item.boost) badges.append(badge('BOOST ' + (Number(item.boost.total) || Number(item.boost.amount) || 0) + ' USD', 'mejor'));
  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'sniper-star' + (favorites.has(item.mint) ? ' active' : '');
  star.textContent = favorites.has(item.mint) ? '★' : '☆';
  star.title = 'Save to favorites';
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
  const actions = document.createElement('div');
  actions.className = 'sniper-actions';
  const view = document.createElement('button');
  view.type = 'button';
  view.className = 'sniper-view';
  view.textContent = 'View token';
  view.addEventListener('click', event => { event.stopPropagation(); openDetail(item); });
  actions.append(view);
  actions.append(star);
  if (state.tab === 'fav') {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'sniper-remove';
    remove.textContent = 'Remove from favorites';
    remove.addEventListener('click', () => { favorites.delete(item.mint); saveFavorites(); paintTabs(); void load('fav'); });
    actions.append(remove);
  }
  if (globalThis.SniperRadar) actions.append(globalThis.SniperRadar.button(item));
  top.append(symbol, badges);

  const cats = document.createElement('div');
  cats.className = 'sniper-cats';
  cats.append(infoBadge('categorias'));
  for (const category of item.categories || []) {
    const chip = document.createElement('span');
    chip.textContent = category;
    cats.append(chip);
  }

  const scores = document.createElement('div');
  scores.className = 'sniper-scores';
  const safety = document.createElement('div');
  safety.className = 'sniper-score';
  const safetyLabel = Object.assign(document.createElement('span'), { textContent: 'safety - 100 is best' });
  safetyLabel.append(infoBadge('seguridad'));
  safety.append(Object.assign(document.createElement('strong'), { textContent: String(item.score) }), safetyLabel);
  const growth = document.createElement('div');
  growth.className = 'sniper-score growth';
  const growthLabel = Object.assign(document.createElement('span'), { textContent: 'estimated potential' });
  growthLabel.append(infoBadge('potencial'));
  growth.append(Object.assign(document.createElement('strong'), { textContent: String(item.growth?.score ?? '—') }), growthLabel);
  scores.append(safety, growth);

  const meta = document.createElement('div');
  meta.className = 'sniper-metabar';
  const metaItem = (name, value) => { const span = document.createElement('span'); span.innerHTML = name + ' <b>' + value + '</b>'; meta.append(span); };
  metaItem('Age', age(item.ageMinutes));
  metaItem('Liquidity', money(item.liquidity) + ' USD');
  metaItem('Market cap', money(item.marketCapUsd) + ' USD');
  const athItem = document.createElement('span');
  athItem.setAttribute('data-ath', item.mint);
  athItem.innerHTML = 'ATH mcap <b>loading...</b>';
  athItem.append(infoBadge('ath'));
  meta.append(athItem);
  metaItem('Markets', (item.pairsCount || 1) + ' - ' + ((item.venues || []).join('/') || 'n/a'));
  metaItem('Holders', Number.isFinite(item.holders) ? String(item.holders) : '—');
  metaItem('LP locked', Number.isFinite(item.lpLockedPct) ? Math.round(item.lpLockedPct) + '%' : '—');
  metaItem('Creator', Number.isFinite(item.creatorPct) ? item.creatorPct + '%' : '—');

  const liquidity = document.createElement('div');
  liquidity.className = 'sniper-liquidity';
  liquidity.append(badge('Liquidity withdrawal: ' + ({ALTO:'HIGH',MEDIO:'MEDIUM',BAJO:'LOW'}[String(item.liquidityLabel).toUpperCase()] || item.liquidityLabel) + ' (' + item.liquidityRisk + '/100)', liquidityClass(item.liquidityLabel)));
  liquidity.append(infoBadge('liquidez'));
  if (item.liquidityLabel === 'HIGH' || item.liquidityLabel === 'ALTO') {
    const note = document.createElement('small');
    note.textContent = 'LP can be drained: check the lock and who controls liquidity.';
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
    title.textContent = 'Scam or abuse signals';
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
    clean.textContent = 'No public scam signals in the analyzer or its votes.';
    scams.append(clean);
  }

  const contract = document.createElement('div');
  contract.className = 'sniper-contract';
  const contractLabel = document.createElement('span');
  contractLabel.textContent = 'Contract';
  const contractCode = document.createElement('code');
  contractCode.textContent = item.mint;
  const copyButton = document.createElement('button');
  copyButton.type = 'button';
  copyButton.className = 'sniper-copy';
  copyButton.textContent = 'Copy';
  copyButton.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(item.mint); copyButton.textContent = 'Copied'; }
    catch { copyButton.textContent = 'Unavailable'; }
    setTimeout(() => { copyButton.textContent = 'Copy'; }, 1600);
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
  chartSummary.textContent = 'Live chart';
  const chartFrameBox = document.createElement('div');
  chartFrameBox.className = 'sniper-chart-frame';
  chartBox.append(chartSummary, chartFrameBox);
  let chartLoaded = false;
  chartBox.addEventListener('toggle', () => {
    if (!chartBox.open || chartLoaded) return;
    chartLoaded = true;
    const frame = document.createElement('iframe');
    frame.loading = 'lazy';
    frame.title = 'Chart ' + (item.symbol || '');
    frame.src = 'https://www.geckoterminal.com/solana/pools/' + encodeURIComponent(item.poolAddress || '') + '?embed=1&info=0&swaps=0&light_chart=1';
    frame.setAttribute('allowfullscreen', 'true');
    chartFrameBox.append(frame);
  });

  const trades = document.createElement('details');
  trades.className = 'sniper-trades';
  const tradesSummary = document.createElement('summary');
  tradesSummary.textContent = 'Who is buying and selling (live)';
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
    head.textContent = (data?.venue ? data.venue + ' · ' : '') + 'latest ' + (data?.items?.length || 0) + ' trades';
    tradesBody.append(head);
    if (!data?.items?.length) {
      const empty = document.createElement('div');
      empty.className = 'sniper-trades-empty';
      empty.textContent = 'No recent trades detected.';
      tradesBody.append(empty);
      return;
    }
    for (const trade of data.items) {
      const row = document.createElement('div');
      row.className = 'sniper-trade-row ' + trade.side;
      const side = document.createElement('b');
      side.textContent = trade.side === 'buy' ? 'BUY' : 'SELL';
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
  { id: 'new', label: 'New' },
  { id: 'trending', label: 'Trending' },
  { id: 'safe', label: 'Trusted' },
  { id: 'risk', label: 'High risk' },
  { id: 'fav', label: 'Favorites' },
  { id: 'mine', label: 'My tokens' },
  { id: 'hist', label: 'History' },
  { id: 'volume', label: 'Highest volume' },
  { id: 'marketcap', label: 'Highest market cap' }
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
    'Market cap: ' + (Number.isFinite(Number(data.mcap)) ? money(Number(data.mcap)) + ' USD' : 'no data'),
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
  grid.replaceChildren();
  status.replaceChildren();
  if (!walletState.owner) {
    const resolved = resolveWallet();
    if (resolved) { walletState.owner = resolved.owner; walletState.source = resolved.source; }
  }
  if (!walletState.owner) {
    status.textContent = 'Connect Phantom or enter an address in the balance bar to view your real tokens.';
    return;
  }
  if (!walletState.data) await refreshBalance();
  const data = walletState.data;
  const info = document.createElement('div');
  info.className = 'sniper-wallet-line';
  info.textContent = 'Wallet ' + (walletState.source || '') + ' ' + shortAddress(walletState.owner) + (data ? ' · ' + money(data.tokensUsd) + ' USD en tokens' : '');
  status.append(info);
  const positions = data?.positions || [];
  if (!positions.length) {
    const empty = document.createElement('p');
    empty.className = 'sniper-empty';
    empty.textContent = 'This wallet has no priced tokens right now.';
    grid.append(empty);
    return;
  }
  for (const position of positions) {
    const known = [...(state.items || []), ...Object.values(state.data || {}).flat()].find(entry => entry?.mint === position.mint);
    const article = document.createElement('article');
    article.className = 'sniper-card';
    const top = document.createElement('div');
    top.className = 'sniper-card-top';
    const symbol = document.createElement('span');
    symbol.className = 'sniper-symbol';
    symbol.textContent = known?.symbol || (position.mint.slice(0, 4) + '...' + position.mint.slice(-4));
    const badges = document.createElement('div');
    badges.className = 'sniper-badges';
    if (known) badges.append(badge(known.verdict, verdictClass(known.verdict)));
    top.append(symbol, badges);
    const meta = document.createElement('div');
    meta.className = 'sniper-metabar';
    const metaItem = (name, valueText) => { const span = document.createElement('span'); span.innerHTML = name + ' <b>' + valueText + '</b>'; meta.append(span); };
    metaItem('Amount', Number(position.amount).toLocaleString('en-US', { maximumFractionDigits: 4 }));
    metaItem('Price', fmtPrice(position.price) + ' USD');
    metaItem('Value', (Number(position.value) || 0).toFixed(2) + ' USD');
    const share = data?.tokensUsd ? ((Number(position.value) || 0) / data.tokensUsd) * 100 : 0;
    metaItem('Of total', share.toFixed(1) + '%');
    if (known) metaItem('Market cap', money(known.marketCapUsd) + ' USD');
    const actions = document.createElement('div');
    actions.className = 'sniper-actions';
    if (known) {
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'sniper-view';
      view.textContent = 'View token';
      view.addEventListener('click', () => openDetail(known));
      actions.append(view);
    }
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'sniper-copy';
    copy.textContent = 'Copy contract';
    copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(position.mint); copy.textContent = 'Copied'; } catch { copy.textContent = 'Unavailable'; } setTimeout(() => { copy.textContent = 'Copy contract'; }, 1600); });
    actions.append(copy);
    article.append(top, meta, actions);
    grid.append(article);
  }
}
function renderHistory() {
  const grid = document.getElementById('sniperGrid');
  const status = document.getElementById('sniperStatus');
  grid.replaceChildren();
  if (!history.length) { status.textContent = 'Your Sniper history is empty.'; return; }
  for (const trade of history.slice(0, 60)) {
    const row = document.createElement('div'); row.className = 'sniper-history-row';
    const side = document.createElement('b'); side.className = trade.side; side.textContent = trade.side === 'buy' ? 'BUY' : 'SELL';
    const symbol = document.createElement('strong'); symbol.textContent = trade.symbol || '—';
    const amount = document.createElement('span'); amount.textContent = (Number(trade.usd) ? Number(trade.usd).toFixed(2) : '—') + ' USD';
    const price = document.createElement('span'); price.textContent = 'Price ' + fmtPrice(trade.priceUsd) + ' USD';
    const mcap = document.createElement('span'); mcap.textContent = 'MCap ' + (Number.isFinite(Number(trade.mcap)) ? money(Number(trade.mcap)) : 'no data');
    const date = document.createElement('small'); date.textContent = fmtDate(trade.at);
    const hold = document.createElement('small');
    const first = [...history].reverse().find(entry => entry.mint === trade.mint && entry.side === 'buy');
    hold.textContent = trade.side === 'sell' && first ? 'Hold ' + fmtHold(trade.at - first.at) : '';
    const share = document.createElement('button'); share.type = 'button'; share.className = 'sniper-share-btn'; share.textContent = 'Share';
    share.addEventListener('click', () => shareTrade({ symbol: trade.symbol, priceUsd: trade.priceUsd, mcap: trade.mcap, at: trade.at, holdMs: trade.side === 'sell' && first ? trade.at - first.at : Date.now() - trade.at, pnlUsd: trade.side === 'sell' ? (Number(trade.usd) || 0) - (Number(trade.invested) || Number(trade.usd) || 0) : 0, basis: Number(trade.invested) || Number(trade.usd) || 1, button: share }));
    const drop = document.createElement('button');
    drop.type = 'button';
    drop.className = 'sniper-remove';
    drop.textContent = 'Remove';
    drop.addEventListener('click', () => { const position = history.indexOf(trade); if (position >= 0) history.splice(position, 1); saveHistory(); paintTabs(); void load('hist'); });
    row.append(side, symbol, amount, price, mcap, date, hold, share, drop);
    grid.append(row);
  }
  status.replaceChildren();
  const clearHist = document.createElement('button');
  clearHist.type = 'button';
  clearHist.className = 'sniper-clear-favs';
  clearHist.textContent = 'Clear history (' + history.length + ')';
  clearHist.addEventListener('click', () => { history.length = 0; saveHistory(); paintTabs(); void load('hist'); });
  status.append(clearHist, document.createTextNode(' ' + history.length + ' recorded trade(s).'));
}

const athCache = (() => { try { return JSON.parse(localStorage.getItem('jamd-sniper-ath') || '{}'); } catch { return {}; } })();
const saveAthCache = () => { try { localStorage.setItem('jamd-sniper-ath', JSON.stringify(athCache)); } catch {} };
const applyAth = (mint, value) => {
  const element = document.querySelector('[data-ath="' + mint + '"]');
  if (!element) return;
  if (!value || !value.available) { element.innerHTML = 'ATH mcap <b>sin dato</b> <span class="sniper-ath-retry">reintentar</span>'; return; }
  const fromAth = Number(value.fromAthPct);
  element.innerHTML = 'ATH mcap <b>' + (value.athMarketCap ? money(value.athMarketCap) + ' USD' : 'no data') + '</b>' + (Number.isFinite(fromAth) ? ' · ' + fromAth.toFixed(1) + '% del ATH' : '');
};
let athQueueRunning = false;
async function loadAth(items) {
  if (athQueueRunning) return;
  athQueueRunning = true;
  const retry = [];
  try {
    for (const item of items.slice(0, 10)) {
      if (!item.poolAddress) continue;
      const cached = athCache[item.poolAddress];
      if (cached && cached.value && cached.value.available && Date.now() - cached.at < 21600000) { applyAth(item.mint, cached.value); continue; }
      if (cached && !cached.value?.available && Date.now() - cached.at < 600000) { applyAth(item.mint, null); retry.push(item); continue; }
      try {
        const response = await fetch(base + '/api/sniper-ath?pool=' + encodeURIComponent(item.poolAddress) + '&mcap=' + encodeURIComponent(item.marketCapUsd || '') + '&price=' + encodeURIComponent(item.priceUsd || ''));
        if (!response.ok) { applyAth(item.mint, null); retry.push(item); await new Promise(resolve => setTimeout(resolve, 1200)); continue; }
        const value = await response.json();
        athCache[item.poolAddress] = { at: Date.now(), value };
        saveAthCache();
        if (value && value.available) applyAth(item.mint, value);
        else { applyAth(item.mint, null); retry.push(item); }
      } catch { applyAth(item.mint, null); retry.push(item); }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  } finally { athQueueRunning = false; }
  if (retry.length) {
    clearTimeout(athRetryTimer);
    athRetryTimer = setTimeout(() => { void loadAth(retry); }, 60000);
  }
}
let athRetryTimer = null;
function render() {
  const grid = $('sniperGrid');
  const status = $('sniperStatus');
  const minimum = state.tab === 'risk' ? 0 : Number($('sniperMin').value || 0);
  const hideHigh = state.tab !== 'risk' && $('sniperHideHigh').checked;
  const rawQuery = ($('sniperSearch').value || '').trim();
  const query = rawQuery.toLowerCase();
  const addressQuery = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(rawQuery);
  if (addressQuery) {
    if (state.lookupLoading) {
      grid.replaceChildren();
      const empty = document.createElement('p');
      empty.className = 'sniper-empty';
      empty.textContent = 'Looking up token address...';
      grid.append(empty);
      status.textContent = 'Searching ' + rawQuery.slice(0, 6) + '...' + rawQuery.slice(-4);
      return;
    }
    if (state.lookupError) {
      grid.replaceChildren();
      const empty = document.createElement('p');
      empty.className = 'sniper-empty';
      empty.textContent = state.lookupError;
      grid.append(empty);
      status.textContent = 'Token address not found.';
      return;
    }
    if (state.lookupItem) {
      grid.replaceChildren(card(state.lookupItem));
      status.textContent = '1 token analyzed by address.';
      return;
    }
  }
  const items = state.items.filter(item => item.score >= minimum && (!hideHigh || item.verdict !== 'HIGH RISK' && item.verdict !== 'ALTO RIESGO') && (!query || String(item.symbol || '').toLowerCase().includes(query) || String(item.mint || '').toLowerCase().includes(query)));
  grid.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'sniper-empty';
    empty.textContent = state.loading ? 'Analyzing tokens...' : state.tab === 'risk' ? 'No high-risk token in this sample.' : state.tab === 'safe' ? 'No token reaches a safety score of 75 right now.' : 'No token matches those filters right now.';
    grid.append(empty);
    status.textContent = empty.textContent;
    return;
  }
  for (const item of items) grid.append(card(item));
  const analyzed = Number(state.coverage?.analyzed ?? state.items.length);
  const requested = Number(state.coverage?.requested ?? state.items.length);
  status.innerHTML = `<b>${items.length}</b> shown · ${analyzed}${requested > analyzed ? ' / ' + requested : ''} analyzed`;
  if (state.updatedAt) status.insertAdjacentHTML('beforeend', ` · updated ${new Date(state.updatedAt).toLocaleTimeString()}`);
}

let lookupTimer = null;
async function lookupAddress(mint) {
  state.lookupLoading = true;
  state.lookupError = '';
  state.lookupItem = null;
  render();
  try {
    const response = await fetch(base + '/api/sniper?mint=' + encodeURIComponent(mint) + '&x=' + Date.now(), { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (state.lookupMint !== mint) return;
    const item = Array.isArray(data?.items) ? data.items[0] : null;
    if (!response.ok || !item) throw Error(data?.error?.message || 'Token address not found');
    state.lookupItem = item;
  } catch (error) {
    if (state.lookupMint === mint) state.lookupError = String(error?.message || error).slice(0, 120);
  } finally {
    if (state.lookupMint === mint) {
      state.lookupLoading = false;
      render();
    }
  }
}
function onSearchInput() {
  const raw = ($('sniperSearch').value || '').trim();
  clearTimeout(lookupTimer);
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw)) {
    state.lookupMint = raw;
    state.lookupItem = null;
    state.lookupError = '';
    state.lookupLoading = true;
    render();
    lookupTimer = setTimeout(() => { void lookupAddress(raw); }, 350);
    return;
  }
  state.lookupMint = '';
  state.lookupItem = null;
  state.lookupError = '';
  state.lookupLoading = false;
  render();
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
      if (!firstRun && globalThis.SniperRadar) globalThis.SniperRadar.push('info', item.symbol || '', 'New token in the list: ' + (item.symbol || item.mint.slice(0, 6)));
    }
    localStorage.setItem(key, JSON.stringify(items.map(item => item.mint).slice(0, 200)));
  } catch {}
}

async function load(tab = state.tab, fresh = false) {
  const seq = ++state.seq;
  state.tab = tab;
  paintTabs();
  state.loading = false;
  $('sniperRefresh').disabled = false;
  if (tab === 'fav') {
    state.items = [...favorites.values()];
    const statusFav = $('sniperStatus');
    statusFav.replaceChildren();
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'sniper-clear-favs';
    clear.textContent = 'Clear favorites (' + state.items.length + ')';
    clear.addEventListener('click', () => { favorites.clear(); saveFavorites(); paintTabs(); void load('fav'); });
    if (state.items.length) statusFav.append(clear);
    else statusFav.textContent = 'You have not saved favorites yet: tap the star on a token.';
    render();
    return;
  }
  if (tab === 'hist') {
    state.items = [];
    renderHistory();
    return;
  }
  if (tab === 'mine') {
    state.items = [];
    await renderHoldings();
    return;
  }
  const source = tab === 'safe' || tab === 'risk' ? 'trending' : tab;
  state.loading = true;
  $('sniperRefresh').disabled = true;
  if (!state.data[source]) $('sniperStatus').textContent = 'Analyzing tokens...';
  try {
    if (!state.data[source]) {
      const response = await fetch(base + '/api/sniper?tab=' + source + '&x=' + Date.now() + (fresh ? '&fresh=1' : ''), { cache: 'no-store' });
      if (seq !== state.seq) return;
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (seq !== state.seq) return;
      state.data[source] = Array.isArray(data.items) ? data.items : [];
      if (data.error) state.data[source] = [];
      state.coverage = data.coverage || null;
      state.updatedAt = data.observedAt || Date.now();
      $('sniperUpdated').textContent = 'Updated ' + new Date(state.updatedAt).toLocaleTimeString();
    }
    if (seq !== state.seq) return;
    let items = state.data[source] || [];
    if (tab === 'safe') items = items.filter(item => item.score >= 75);
    if (tab === 'risk') items = items.filter(item => item.score <= 30);
    state.items = items;
    render();
  } catch (error) {
    if (seq === state.seq) $('sniperStatus').textContent = 'Could not analyze right now: ' + (error?.message || error);
  } finally {
    if (seq === state.seq) {
      state.loading = false;
      $('sniperRefresh').disabled = false;
    }
  }
}

function refreshTab() { state.data = {}; void load(state.tab, true); }

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

  const deviceId = (() => {
    try {
      const stored = localStorage.getItem('jamd-sniper-device');
      if (stored && /^[A-Za-z0-9_-]{16,64}$/.test(stored)) return stored;
      const generated = 'dev' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      localStorage.setItem('jamd-sniper-device', generated);
      return generated;
    } catch { return 'dev' + Date.now().toString(36); }
  })();
  const syncCloud = async () => {
    try {
      const items = [...watch.values()].map(entry => ({ mint: entry.mint, symbol: entry.symbol || '', pool: entry.pool || '', handle: entry.handle || '' }));
      const response = await fetch(base + '/api/sniper-alerts?x=' + Date.now(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ device: deviceId, items })
      });
      const cloudEl = document.querySelector('.radar-cloud');
      if (cloudEl) cloudEl.textContent = response.ok ? 'Nube: ' + items.length + ' en vigilancia' : 'Nube: sin conexion';
    } catch {}
  };
  const persist = () => {
    try { localStorage.setItem(WATCH_KEY, JSON.stringify([...watch.values()])); } catch {}
    try { localStorage.setItem(SNAP_KEY, JSON.stringify(Object.fromEntries(snap))); } catch {}
  };

  const stamp = () => new Date().toLocaleTimeString();

  const recentAlerts = new Map();
  const push = (kind, symbol, text, meta = {}) => {
    const key = kind + '|' + symbol + '|' + text;
    const last = recentAlerts.get(key) || 0;
    if (Date.now() - last < 20 * 60 * 1000) return;
    recentAlerts.set(key, Date.now());
    alerts.unshift({ kind, symbol, text, at: stamp(), mint: meta.mint || null });
    if (alerts.length > 40) alerts.pop();
    renderList();
    try {
      if (globalThis.Notification && Notification.permission === 'granted') {
        const notification = new Notification(symbol + ' · Radar', { body: text });
        notification.onclick = () => {
          try { globalThis.focus(); } catch {}
          if (meta.mint && globalThis.SniperRadar?.open) globalThis.SniperRadar.open(meta.mint);
          notification.close();
        };
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
    title.textContent = 'Radar';
    countEl = document.createElement('span');
    countEl.className = 'radar-count';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = '—';
    toggle.className = 'radar-toggle';
    toggle.addEventListener('click', () => { dock.classList.toggle('collapsed'); toggle.textContent = dock.classList.contains('collapsed') ? '+' : '—'; });
    head.append(title, countEl, toggle);
    dock.classList.add('collapsed'); toggle.textContent = '+';
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
    const cloud = document.createElement('span');
    cloud.className = 'radar-cloud';
    cloud.textContent = 'Nube: —';
    foot.append(enable, cloud);
    void syncCloud();
    dock.append(head, listEl, foot);
    document.body.append(dock);
    renderList();
    return dock;
  };

  const markRugged = (mint, detail) => {
    const card = document.querySelector('[data-mint="' + mint + '"]');
    if (!card || card.classList.contains('rugged')) return;
    card.classList.add('rugged');
    const banner = document.createElement('div');
    banner.className = 'sniper-rug-banner';
    banner.textContent = 'RUG PULL DETECTADO: ' + detail;
    card.prepend(banner);
    const badgeNode = card.querySelector('.sniper-badge');
    if (badgeNode) { badgeNode.textContent = 'RUG'; badgeNode.className = 'sniper-badge alto'; }
  };
  const evaluate = (mint, symbol, info) => {
    if (!info) return;
    const meta = { mint };
    const previous = snap.get(mint) || null;
    const drop5 = Number(info.change5m);
    const beforeLiq = Number(previous?.liquidityUsd);
    const nowLiq = Number(info.liquidityUsd);
    const drainPct = Number.isFinite(beforeLiq) && beforeLiq > 0 && Number.isFinite(nowLiq) ? ((nowLiq - beforeLiq) / beforeLiq) * 100 : null;
    const sellers = Number(info.sells5m) || 0;
    const buyers = Number(info.buys5m) || 0;
    const rugged = (drainPct !== null && drainPct <= -45) || (Number.isFinite(drop5) && drop5 <= -60 && sellers >= buyers);
    if (rugged && previous) {
      const detail = [];
      if (drainPct !== null) detail.push('liquidez ' + drainPct.toFixed(0) + '%');
      if (Number.isFinite(drop5)) detail.push('precio ' + drop5.toFixed(0) + '% en 5 min');
      if (sellers || buyers) detail.push(sellers + ' ventas / ' + buyers + ' compras');
      push('rug', symbol, 'RUG PULL: ' + detail.join(' · '), meta);
      markRugged(mint, detail.join(' · '));
    }
    if (!info) return;
    
    if (previous) {
      const beforeLiquidity = Number(previous.liquidityUsd);
      const nowLiquidity = Number(info.liquidityUsd);
      if (Number.isFinite(beforeLiquidity) && beforeLiquidity > 0 && Number.isFinite(nowLiquidity)) {
        const change = (nowLiquidity - beforeLiquidity) / beforeLiquidity;
        if (change <= -0.2) push('bad', symbol, 'Liquidez retirada: ' + (change * 100).toFixed(1) + '% (' + Math.round(nowLiquidity) + ' USD)', meta);
        else if (change <= -0.08) push('warn', symbol, 'Liquidez bajando: ' + (change * 100).toFixed(1) + '%', meta);
        else if (change >= 0.2) push('good', symbol, 'Liquidez añadida: +' + (change * 100).toFixed(1) + '% (' + Math.round(nowLiquidity) + ' USD)');
      }
      const sells = Number(info.sells5m);
      const buys = Number(info.buys5m);
      if (Number.isFinite(sells) && Number.isFinite(buys) && sells >= 12 && sells >= buys * 4) push('bad', symbol, 'Presion vendedora fuerte: ' + sells + ' ventas / ' + buys + ' compras en 5 min', { mint });
      else if (Number.isFinite(sells) && Number.isFinite(buys) && buys >= 8 && buys >= sells * 2.5) push('good', symbol, 'Compras fuertes: ' + buys + ' compras / ' + sells + ' ventas en 5 min', meta);
      const move = Number(info.change5m);
      if (Number.isFinite(move) && move <= -20) push('bad', symbol, 'Caida rapida: ' + move.toFixed(1) + '% en 5 min', meta);
      else if (Number.isFinite(move) && move >= 25) push('good', symbol, 'Subida fuerte: +' + move.toFixed(1) + '% en 5 min', meta);
    }
    const beforeVenues = Array.isArray(previous?.venues) ? previous.venues.length : 0;
    const nowVenues = Array.isArray(info.venues) ? info.venues.length : 0;
    if (previous) {
      if (nowVenues > beforeVenues) push('info', symbol, 'Nuevo listado: ' + nowVenues + ' mercado(s) - ' + (info.venues || []).join(', '), meta);
      else if (nowVenues < beforeVenues) push('bad', symbol, 'Perdio un listado: ahora ' + nowVenues + ' mercado(s)', meta);
      const beforeBoost = Number(previous.boostTotal) || 0;
      const nowBoost = Number(info.boostTotal) || 0;
      if (nowBoost > beforeBoost) push('good', symbol, 'Marketing: boost activo por ' + nowBoost + ' USD', meta);
      else if (!nowBoost && beforeBoost > 0) push('warn', symbol, 'El boost de marketing termino', meta);
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
          if (beforeProfile.exists && !profile.exists) push('bad', symbol, 'La cuenta de X @' + (entry.handle || '') + ' desaparecio o fue suspendida', { mint: entry.mint });
          if (profile.exists && Number.isFinite(profile.followers) && Number.isFinite(beforeProfile.followers) && beforeProfile.followers > 0) {
            const delta = (profile.followers - beforeProfile.followers) / beforeProfile.followers;
            if (delta >= 0.05) push('good', symbol, 'Seguidores en X +' + (delta * 100).toFixed(1) + '% (' + profile.followers + ')', { mint: entry.mint });
            else if (delta <= -0.05) push('bad', symbol, 'Seguidores en X ' + (delta * 100).toFixed(1) + '% (' + profile.followers + ')', { mint: entry.mint });
          }
          if (Number.isFinite(profile.tweets) && Number.isFinite(beforeProfile.tweets)) {
            const posted = profile.tweets - beforeProfile.tweets;
            if (posted >= 2) push('info', symbol, 'El dev publico ' + posted + ' mensaje(s) nuevo(s) en X', { mint: entry.mint });
          }
          const down = Number(info.votes?.down) || 0;
          const beforeDown = Number(previous.votes?.down) || 0;
          if (down - beforeDown >= 3) push('bad', symbol, 'Votos negativos en la comunidad +' + (down - beforeDown) + ' (total ' + down + ')', { mint: entry.mint });
          const up = Number(info.votes?.up) || 0;
          const beforeUp = Number(previous.votes?.up) || 0;
          if (up - beforeUp >= 3) push('good', symbol, 'Votos positivos en la comunidad +' + (up - beforeUp) + ' (total ' + up + ')', { mint: entry.mint });
          const scam = Number(info.search?.scam) || 0;
          const beforeScam = Number(previous.search?.scam) || 0;
          if (scam >= 3 && scam - beforeScam >= 2) push('bad', symbol, scam + ' resultados publicos lo llaman scam (antes ' + beforeScam + ')', { mint: entry.mint });
          else if (scam >= 5 && beforeScam < 5) push('bad', symbol, 'Ya hay ' + scam + ' resultados que lo llaman scam', { mint: entry.mint });
        }
        socialSnap[entry.mint] = info;
      }
      saveSocial();
    } catch {}
  };

  const whaleTrack = (() => { try { return JSON.parse(localStorage.getItem('jamd-sniper-whales') || '{}'); } catch { return {}; } })();
  const saveWhales = () => { try { localStorage.setItem('jamd-sniper-whales', JSON.stringify(whaleTrack)); } catch {} };
  const pollWhales = async () => {
    const entries = [...watch.values()].slice(0, 6);
    for (const entry of entries) {
      if (!entry?.mint || !entry?.pool) continue;
      try {
        const response = await fetch(base + '/api/sniper-trades?pool=' + encodeURIComponent(entry.pool) + '&mint=' + encodeURIComponent(entry.mint) + '&x=' + Date.now(), { cache: 'no-store' });
        if (!response.ok) continue;
        const data = await response.json();
        const trades = Array.isArray(data.items) ? data.items : [];
        if (!trades.length) continue;
        const stored = whaleTrack[entry.mint];
        const lastAt = Number(stored?.at) || 0;
        const fresh = trades.filter(trade => { const time = Date.parse(trade.at || '') || 0; return time > lastAt; });
        const newest = Date.parse(trades[0].at || '') || 0;
        whaleTrack[entry.mint] = { at: newest || Date.now() };
        saveWhales();
        let biggest = null;
        for (const trade of fresh) {
          const usd = Number(trade.usd) || 0;
          if (!biggest || usd > (Number(biggest.usd) || 0)) biggest = trade;
        }
        if (!biggest) continue;
        const usd = Number(biggest.usd) || 0;
        if (usd < 250) continue;
        const wallet = String(biggest.wallet || '').slice(0, 4) + '...' + String(biggest.wallet || '').slice(-4);
        if (biggest.side === 'buy') push('good', entry.symbol || '', 'Ballena compro ' + usd.toFixed(0) + ' USD (' + wallet + ')', { mint: entry.mint });
        else push('bad', entry.symbol || '', 'Ballena vendio ' + usd.toFixed(0) + ' USD (' + wallet + ')', { mint: entry.mint });
      } catch {}
    }
  };
  let whaleTimer = null;
  const scheduleWhales = () => { clearInterval(whaleTimer); whaleTimer = setInterval(() => { void pollWhales(); }, 45000); };
  const open = mint => {
    const item = [...(state.items || []), ...Object.values(state.data || {}).flat()].find(entry => entry?.mint === mint);
    if (item && globalThis.openDetail) globalThis.openDetail(item);
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
    void syncCloud();
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
  globalThis.SniperRadar = { button, add, push, pollNow: poll, open, has: mint => watch.has(mint) };
  ensureDock();
  schedule();
  scheduleSocial();
  void poll();
  void pollSocial();
})();

$('sniperRefresh').addEventListener('click', refreshTab);
$('sniperMin').addEventListener('change', render);
$('sniperHideHigh').addEventListener('change', render);
$('sniperSearch').addEventListener('input', onSearchInput);
$('sniperHeaderConnect')?.addEventListener('click', () => $('balanceConnect')?.click());
const sortSelect = $('sniperSort');
if (sortSelect) {
  try { const savedSort = localStorage.getItem('jamd-sniper-sort'); if (['safety','potential','newest','liquidity'].includes(savedSort)) { state.sort = savedSort; sortSelect.value = savedSort; } } catch {}
  sortSelect.addEventListener('change', () => { state.sort = sortSelect.value; try { localStorage.setItem('jamd-sniper-sort', state.sort); } catch {} render(); });
}
const pasteButton = $('sniperPaste');
const clearButton = $('sniperClear');
const searchInput = $('sniperSearch');
const syncClear = () => { if (clearButton) clearButton.hidden = !String(searchInput?.value || '').trim(); };
searchInput?.addEventListener('input', syncClear);
pasteButton?.addEventListener('click', async () => {
  let value = '';
  try { value = await navigator.clipboard.readText(); } catch { value = prompt('Paste a Solana contract address:', '') || ''; }
  value = String(value || '').trim();
  if (!value || !searchInput) return;
  searchInput.value = value;
  searchInput.dispatchEvent(new Event('input', {bubbles: true}));
  searchInput.focus();
  syncClear();
});
clearButton?.addEventListener('click', () => {
  if (!searchInput) return;
  searchInput.value = '';
  searchInput.dispatchEvent(new Event('input', {bubbles: true}));
  searchInput.focus();
  syncClear();
});
syncClear();
// Barra de saldo: SOL disponible y valor en tokens, con ojo para ocultarlo.
const walletState = { data: null, timer: null, hidden: false, owner: null, source: null };
const shortAddress = value => value ? value.slice(0, 4) + '...' + value.slice(-4) : '';
const looksLikeAddress = value => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || ''));
function storedWallet() {
  try {
    const direct = localStorage.getItem("jamd-sniper-wallet");
    if (looksLikeAddress(direct)) return { owner: direct, source: "Manual" };
    // Only an explicit Sniper wallet or Phantom is trusted here. The app's
    // selected trading wallet may be a different account; showing its tokens
    // as "My tokens" was misleading.
  } catch {}
  return null;
}

function resolveWallet() {
  const phantomKey = globalThis.JamdSniperTrade?.key?.();
  if (looksLikeAddress(phantomKey)) return { owner: phantomKey, source: 'Phantom' };
  return storedWallet();
}
function setWallet(owner, source, remember = true) {
  walletState.owner = owner || null;
  walletState.source = source || null;
  walletState.data = null;
  if (remember && owner) { try { localStorage.setItem('jamd-sniper-wallet', owner); } catch {} }
  paintBalance();
  if (owner) void refreshBalance();
}

try { walletState.hidden = localStorage.getItem('jamd-sniper-hide') === '1'; } catch {}
const mask = text => walletState.hidden ? '••••' : text;
function paintBalance() {
  const solEl = document.getElementById('balanceSol');
  const solSub = document.getElementById('balanceSolSub');
  const tokensEl = document.getElementById('balanceTokens');
  const tokensSub = document.getElementById('balanceTokensSub');
  const eye = document.getElementById('balanceEye');
  const connectButton = document.getElementById('balanceConnect');
  const sourceEl = document.getElementById('balanceSource');
  const addressEl = document.getElementById('balanceAddress');
  const balanceShell = document.getElementById('sniperBalance');
  if (balanceShell) balanceShell.classList.toggle('is-empty', !walletState.owner);
  if (sourceEl) sourceEl.textContent = walletState.source || 'No wallet';
  if (addressEl) addressEl.textContent = walletState.owner ? shortAddress(walletState.owner) : '';
  if (!solEl) return;
  const data = walletState.data;
  if (eye) { eye.textContent = walletState.hidden ? 'Show' : 'Hide'; eye.setAttribute('aria-pressed', String(walletState.hidden)); }
  const wallet = globalThis.JamdSniperTrade;
  const connected = Boolean(wallet?.key?.());
  if (connectButton) connectButton.hidden = connected;
  const headerConnect = document.getElementById('sniperHeaderConnect');
  if (headerConnect) headerConnect.hidden = connected;
  if (!data) {
    solEl.textContent = '—';
    if (solSub) solSub.textContent = connected ? 'Reading balance...' : 'Connect your wallet to view it';
    tokensEl.textContent = '—';
    if (tokensSub) tokensSub.textContent = '';
    return;
  }
  solEl.textContent = mask((Number(data.solUsd) || 0).toFixed(2) + ' USD');
  if (solSub) solSub.textContent = mask((Number(data.solBalance) || 0).toFixed(4) + ' SOL');
  tokensEl.textContent = mask((Number(data.tokensUsd) || 0).toFixed(2) + ' USD');
  if (tokensSub) tokensSub.textContent = walletState.hidden ? '' : (data.pricedCount || 0) + ' of ' + (data.tokenCount || 0) + ' tokens priced';
}
async function refreshBalance() {
  if (!walletState.owner) { const resolved = resolveWallet(); if (resolved) { walletState.owner = resolved.owner; walletState.source = resolved.source; } }
  const owner = walletState.owner;
  if (!owner) { walletState.data = null; paintBalance(); return; }
  try {
    const response = await fetch(base + '/api/sniper-wallet?x=' + Date.now(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ owner }) });
    if (response.ok) walletState.data = await response.json();
  } catch {}
  paintBalance();
}
const eyeButton = document.getElementById('balanceEye');
if (eyeButton) eyeButton.addEventListener('click', () => {
  walletState.hidden = !walletState.hidden;
  try { localStorage.setItem('jamd-sniper-hide', walletState.hidden ? '1' : '0'); } catch {}
  paintBalance();
});
const changeBalance = document.getElementById('balanceChange');
if (changeBalance) changeBalance.addEventListener('click', () => {
  const value = prompt('Direccion de wallet Solana para consultar (solo lectura):', walletState.owner || '');
  if (!value) return;
  const clean = value.trim();
  if (!looksLikeAddress(clean)) { alert('Esa direccion no parece valida.'); return; }
  const phantomKey = globalThis.JamdSniperTrade?.key?.();
  setWallet(clean, clean === phantomKey ? 'Phantom' : 'Manual');
});
const connectBalance = document.getElementById('balanceConnect');
if (connectBalance) connectBalance.addEventListener('click', async () => {
  const wallet = globalThis.JamdSniperTrade;
  if (!wallet || !wallet.provider()) { alert('Phantom no esta disponible en este navegador. Instalalo o abre la pagina dentro de Phantom.'); return; }
  try { await wallet.connect(); await refreshBalance(); } catch (error) { alert('No se pudo conectar: ' + (error?.message || error)); }
});
const initialWallet = resolveWallet();
if (initialWallet) { walletState.owner = initialWallet.owner; walletState.source = initialWallet.source; }
paintBalance();
setTimeout(() => { void refreshBalance(); }, 600);
setInterval(() => { if (!document.hidden) void refreshBalance(); }, 20000);
load('new');

// Auto refresh is opt-in and never overwrites an address lookup.
let autoRefreshTimer = null;
function scheduleAutoRefresh() {
  if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  if (!state.auto) return;
  autoRefreshTimer = setInterval(() => {
    if (document.hidden || state.loading) return;
    const raw = String(searchInput?.value || '').trim();
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(raw)) return;
    refreshTab(true);
    if (globalThis.SniperRadar) globalThis.SniperRadar.pollNow();
  }, 60000);
}
try { const savedAuto = localStorage.getItem('jamd-sniper-auto'); if (savedAuto !== null) state.auto = savedAuto === '1'; } catch {}
const autoInput = $('sniperAuto');
if (autoInput) {
  autoInput.checked = state.auto;
  autoInput.addEventListener('change', () => { state.auto = autoInput.checked; try { localStorage.setItem('jamd-sniper-auto', state.auto ? '1' : '0'); } catch {} scheduleAutoRefresh(); });
}
scheduleAutoRefresh();