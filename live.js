const API_BASE = 'https://157.230.54.133';
const SESSION_KEY = 'jamdWebTrialSession';
const state = { token: '', exchanges: [], connections: [], positions: [], loaded: false, betaAccess: false };

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
const money = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString(undefined, {maximumFractionDigits: 2, minimumFractionDigits: 2}) : '—';
const price = value => Number.isFinite(Number(value)) && Number(value) !== 0 ? Number(value).toLocaleString(undefined, {maximumFractionDigits: 6}) : '—';

function readToken() {
  try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}

function toast(message, bad = false) {
  const node = $('liveToast');
  node.textContent = message;
  node.style.borderColor = bad ? 'rgba(251,113,133,.55)' : 'var(--line)';
  node.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.hidden = true; }, 4200);
}

function alertBox(message, bad = true) {
  const node = $('liveAlert');
  if (!message) { node.hidden = true; node.textContent = ''; return; }
  node.hidden = false;
  node.textContent = message;
  node.style.borderColor = bad ? 'rgba(251,113,133,.5)' : 'rgba(52,211,153,.5)';
  node.style.background = bad ? 'rgba(76,5,25,.4)' : 'rgba(6,78,59,.35)';
  node.style.color = bad ? '#fecdd3' : '#a7f3d0';
}

async function api(path, {method = 'GET', body} = {}) {
  if (!state.token) throw Object.assign(Error('Sign in to JamdDmaj first.'), {status: 401});
  const response = await fetch(API_BASE + path, {
    method,
    cache: 'no-store',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${state.token}`,
      ...(body ? {'Content-Type': 'application/json'} : {})
    },
    ...(body ? {body: JSON.stringify(body)} : {}),
    signal: AbortSignal.timeout(30000)
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    if (response.status === 401) showAuth();
    throw Object.assign(Error(payload?.error?.code || `Request failed (${response.status})`), {status: response.status});
  }
  return payload;
}

function showAuth() {
  $('liveAuth').hidden = false;
  $('liveWorkspace').hidden = true;
  $('liveShareView').hidden = true;
}

function renderExchangeOptions() {
  const select = $('liveExchange');
  select.innerHTML = state.exchanges.map(item =>
    `<option value="${esc(item.id)}" data-passphrase="${item.passphrase ? '1' : '0'}">${esc(item.label)}</option>`
  ).join('');
  togglePassphrase();
}

function togglePassphrase() {
  const option = $('liveExchange').selectedOptions[0];
  const needed = option?.dataset.passphrase === '1';
  $('livePassphraseLabel').hidden = !needed;
  $('livePassphrase').required = needed;
}

function renderConnections() {
  const host = $('liveConnections');
  $('liveEmpty').hidden = state.connections.length > 0;
  host.innerHTML = state.connections.map(connection => {
    const balance = connection.balance || {};
    const live = connection.config?.liveEnabled === true;
    const statusClass = connection.status === 'connected' ? 'ok' : 'bad';
    return `<article class="live-card live-connection" data-id="${esc(connection.id)}">
      <div class="live-connection-head">
        <div>
          <div class="live-exchange-name">${esc(labelFor(connection.exchange))}</div>
          <div class="live-connection-meta">${esc(connection.label)} · ${esc(connection.exchange)}</div>
        </div>
        <span class="live-pill">${live ? 'LIVE' : 'PAUSED'}</span>
      </div>
      <div class="live-balance">
        <strong>${money(balance.total ?? balance.free)} <small>USDT</small></strong>
        <span>Available ${money(balance.free)}</span>
      </div>
      <div class="live-config">
        <label>Margin / trade (USDT)<input data-field="marginUsd" type="number" min="10" max="1000" step="1" value="${esc(connection.config?.marginUsd ?? 25)}"></label>
        <label>Leverage<select data-field="leverage">${[2, 3, 5, 10, 15, 20].map(value => `<option value="${value}" ${Number(connection.config?.leverage) === value ? 'selected' : ''}>${value}×</option>`).join('')}</select></label>
        <label>Trades at once<input data-field="maxOpen" type="number" min="1" max="10" step="1" value="${esc(connection.config?.maxOpen ?? 1)}"></label>
        <label>Protection (ROE %)<input data-field="protectionRoe" type="number" min="0.5" max="50" step="0.5" value="${esc(connection.config?.protectionRoe ?? 4)}"></label>
      </div>
      <div class="live-connection-actions">
        <button class="live-button ghost" data-action="save" type="button">Save</button>
        <button class="live-button ghost" data-action="refresh" type="button">Refresh</button>
        <button class="live-button ${live ? 'live-toggle on' : 'live-toggle'}" data-action="live" type="button" ${live ? '' : state.betaAccess ? '' : 'disabled title="Private beta access required"'}>${live ? 'Turn live off' : state.betaAccess ? 'Turn live on' : 'Beta access required'}</button>
        <button class="live-button ghost" data-action="delete" type="button">Disconnect</button>
      </div>
      <small class="live-status ${statusClass}">${esc(connection.status || 'unknown')}${connection.lastError ? ` · ${esc(connection.lastError)}` : ''}</small>
    </article>`;
  }).join('');

  host.querySelectorAll('.live-connection').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('[data-action="save"]').addEventListener('click', () => saveConfig(id, card));
    card.querySelector('[data-action="refresh"]').addEventListener('click', () => refreshConnection(id, card));
    card.querySelector('[data-action="live"]').addEventListener('click', () => toggleLive(id, card));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteConnection(id));
  });
}

function labelFor(id) {
  return state.exchanges.find(item => item.id === id)?.label || id;
}

async function saveConfig(id, card) {
  const number = field => Number(card.querySelector(`[data-field="${field}"]`).value);
  const button = card.querySelector('[data-action="save"]');
  button.disabled = true;
  try {
    await api(`/live/connections/${id}/config`, {
      method: 'POST',
      body: {
        marginUsd: number('marginUsd'),
        leverage: number('leverage'),
        maxOpen: number('maxOpen'),
        protectionRoe: number('protectionRoe')
      }
    });
    toast('Settings saved.');
    await loadStatus();
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function refreshConnection(id, card) {
  const button = card.querySelector('[data-action="refresh"]');
  button.disabled = true;
  button.textContent = 'Checking…';
  try {
    await api(`/live/connections/${id}/refresh`, {method: 'POST'});
    await loadStatus();
    await loadPositions();
    toast('Connection verified.');
  } catch (error) {
    toast(error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Refresh';
  }
}

async function toggleLive(id, card) {
  if (!state.betaAccess) { toast('Live execution is limited to approved beta accounts.', true); return; }
  const connection = state.connections.find(item => item.id === id);
  const enabled = connection?.config?.liveEnabled === true;
  if (!enabled) {
    if (!$('liveConsent').checked) { toast('Accept the risk disclosure before turning live on.', true); return; }
    if (!window.confirm('Turn live trading on? JamdDmaj will place real orders on this exchange using your configured risk.')) return;
  }
  try {
    await api(`/live/connections/${id}/live`, {method: 'POST', body: {enabled: !enabled, consent: true}});
    toast(enabled ? 'Live turned off.' : 'Live turned on.');
    await loadStatus();
  } catch (error) {
    toast(error.message, true);
  }
}

async function deleteConnection(id) {
  if (!window.confirm('Disconnect this exchange? Open positions are not closed automatically.')) return;
  try {
    await api(`/live/connections/${id}/delete`, {method: 'POST'});
    toast('Exchange disconnected.');
    await loadStatus();
  } catch (error) {
    toast(error.message, true);
  }
}

function renderPositions() {
  const host = $('livePositions');
  const rows = state.positions || [];
  $('livePositionsEmpty').hidden = rows.length > 0;
  $('livePositionCount').textContent = `${rows.length} open`;
  host.innerHTML = rows.map(position => {
    const pnl = Number(position.unrealizedPnl || 0);
    const pnlClass = pnl >= 0 ? 'live-positive' : 'live-negative';
    return `<article class="live-position">
      <div class="live-position-main"><strong>${esc(position.symbol)}</strong><small>${esc(position.exchange)} · ${esc(position.leverage)}× · ${String(position.side).toUpperCase()}</small></div>
      <div class="live-position-cell"><span>Entry</span><b>${price(position.entry)}</b></div>
      <div class="live-position-cell"><span>Mark</span><b>${price(position.mark)}</b></div>
      <div class="live-position-cell"><span>Margin</span><b>${money(position.marginUsd)} USDT</b></div>
      <div class="live-position-cell"><span>PnL</span><b class="${pnlClass}">${pnl >= 0 ? '+' : ''}${money(pnl)}</b></div>
      <button class="live-button ghost" data-share="${esc(position.id)}" type="button">Share</button>
    </article>`;
  }).join('');
  host.querySelectorAll('[data-share]').forEach(button => button.addEventListener('click', () => sharePosition(button.dataset.share)));
}

async function sharePosition(id) {
  try {
    const result = await api(`/live/positions/${id}/share`, {method: 'POST'});
    const url = result?.share?.url || '';
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(url);
    toast(url ? 'Share link copied.' : 'Share link created.');
  } catch (error) {
    toast(error.message, true);
  }
}

async function loadStatus() {
  const status = await api('/live/status');
  state.connections = status.connections || [];
  renderConnections();
}

async function loadPositions() {
  const positions = await api('/live/positions');
  state.positions = positions.positions || [];
  renderPositions();
}

async function load() {
  try {
    const [me, exchanges, status, positions] = await Promise.all([
      api('/live/me'),
      api('/live/exchanges'),
      api('/live/status'),
      api('/live/positions')
    ]);
    state.exchanges = exchanges.exchanges || [];
    state.connections = status.connections || [];
    state.positions = positions.positions || [];
    state.betaAccess = me?.betaAccess !== false;
    renderExchangeOptions();
    renderConnections();
    renderPositions();
    $('liveAuth').hidden = true;
    $('liveWorkspace').hidden = false;
    $('liveShareView').hidden = true;
    state.loaded = true;
    if (me?.betaAccess === false) alertBox('Private beta: you can connect and verify an exchange, but live execution requires an approved account.', false);
    else if (me?.engineEnabled === false) alertBox('Execution engine is starting. Connections and balances are live; automatic orders will be enabled after the final safety check.', false);
    else $('liveAlert').hidden = true;
  } catch (error) {
    if (error.status === 401) showAuth();
    else alertBox(error.message || 'Could not load JamdDmaj Live.');
  }
}

async function loadShare(token) {
  $('liveWorkspace').hidden = true;
  $('liveAuth').hidden = true;
  $('liveShareView').hidden = false;
  try {
    const response = await fetch(`${API_BASE}/live/share/${encodeURIComponent(token)}`, {cache: 'no-store', signal: AbortSignal.timeout(20000)});
    const payload = await response.json();
    if (!response.ok) throw Error(payload?.error?.code || 'Share not found');
    const share = payload.share || {};
    const pnl = Number(share.unrealizedPnl || 0);
    $('liveShareCard').innerHTML = `<div class="live-brand"><span class="live-mark">JD</span><span><strong>JamdDmaj <em>Live</em></strong><small>Shared trade</small></span></div>
      <p class="live-share-symbol">${esc(share.symbol)} <span class="${pnl >= 0 ? 'live-positive' : 'live-negative'}">${pnl >= 0 ? '+' : ''}${money(pnl)} USDT</span></p>
      <div class="live-share-grid">
        <div><span>Side</span><b>${esc(String(share.side || '').toUpperCase())}</b></div>
        <div><span>Exchange</span><b>${esc(share.exchange)}</b></div>
        <div><span>Entry</span><b>${price(share.entry)}</b></div>
        <div><span>Mark</span><b>${price(share.mark)}</b></div>
        <div><span>Leverage</span><b>${esc(share.leverage)}×</b></div>
        <div><span>Margin</span><b>${money(share.marginUsd)} USDT</b></div>
      </div>
      <p class="live-fine">Shared from JamdDmaj Live. Past performance does not guarantee future results.</p>`;
  } catch (error) {
    $('liveShareCard').innerHTML = `<div class="live-alert">This shared trade is no longer available.</div>`;
  }
}

function wire() {
  $('liveExchange').addEventListener('change', togglePassphrase);
  $('liveConnectForm').addEventListener('submit', async event => {
    event.preventDefault();
    alertBox('');
    const button = $('liveConnectBtn');
    button.disabled = true;
    button.textContent = 'Verifying exchange…';
    try {
      const option = $('liveExchange').selectedOptions[0];
      await api('/live/connect', {
        method: 'POST',
        body: {
          exchange: $('liveExchange').value,
          label: $('liveLabel').value.trim() || option?.textContent || '',
          apiKey: $('liveApiKey').value.trim(),
          secret: $('liveApiSecret').value.trim(),
          passphrase: $('livePassphrase').value.trim(),
          consent: $('liveConsent').checked
        }
      });
      $('liveApiKey').value = '';
      $('liveApiSecret').value = '';
      $('livePassphrase').value = '';
      toast('Exchange connected and balance verified.');
      await loadStatus();
      await loadPositions();
    } catch (error) {
      alertBox(error.message || 'Could not connect this exchange.');
      toast(error.message || 'Could not connect this exchange.', true);
    } finally {
      button.disabled = false;
      button.textContent = 'Verify and connect';
    }
  });
  $('liveRefreshAll').addEventListener('click', async () => {
    for (const connection of state.connections) {
      try { await api(`/live/connections/${connection.id}/refresh`, {method: 'POST'}); } catch {}
    }
    await loadStatus();
    await loadPositions();
    toast('Connections refreshed.');
  });
}

async function boot() {
  wire();
  state.token = readToken();
  const share = new URLSearchParams(location.search).get('share');
  if (share) { await loadShare(share); return; }
  if (!state.token) { showAuth(); return; }
  await load();
}

boot();
