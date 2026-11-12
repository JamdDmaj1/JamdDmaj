// Precios recordados en el navegador para los cierres: entrada y salida.
// No sustituye al registro del servidor; solo completa la vista y la captura.
const KEY = 'jamd-close-prices-v1';

function read(doc) {
  try { const raw = doc.defaultView?.localStorage?.getItem(KEY); const value = raw ? JSON.parse(raw) : {}; return value && typeof value === 'object' ? value : {}; } catch { return {}; }
}

export function rememberClosePrices(doc, positionAddress, { entryPrice, exitPrice, asset, side } = {}) {
  if (typeof positionAddress !== 'string' || !positionAddress) return;
  const entry = Number(entryPrice), exit = Number(exitPrice);
  if (!(entry > 0) && !(exit > 0)) return;
  try {
    const all = read(doc);
    all[positionAddress] = {
      entryPrice: entry > 0 ? entry : null,
      exitPrice: exit > 0 ? exit : null,
      asset: String(asset || '').slice(0, 20),
      side: String(side || '').slice(0, 6),
      at: Date.now()
    };
    const keys = Object.keys(all);
    if (keys.length > 120) for (const key of keys.slice(0, keys.length - 120)) delete all[key];
    doc.defaultView?.localStorage?.setItem(KEY, JSON.stringify(all));
  } catch {}
}

export function closePricesFor(doc, positionAddress) {
  if (typeof positionAddress !== 'string' || !positionAddress) return null;
  const value = read(doc)[positionAddress];
  if (!value) return null;
  return { entryPrice: Number(value.entryPrice) || null, exitPrice: Number(value.exitPrice) || null, at: Number(value.at) || null };
}

// Fallback por activo y lado: el cierre puede no exponer la direccion de la
// posicion, asi que tambien se guarda una marca temporal por simbolo.
const ASSET_KEY = 'jamd-close-prices-by-asset-v1';

function readAssets(doc) {
  try { const raw = doc.defaultView?.localStorage?.getItem(ASSET_KEY); const value = raw ? JSON.parse(raw) : []; return Array.isArray(value) ? value : []; } catch { return []; }
}

export function rememberCloseByAsset(doc, { asset, side, entryPrice, exitPrice, at } = {}) {
  const symbol = String(asset || '').toUpperCase().slice(0, 20);
  if (!symbol) return;
  const entry = Number(entryPrice), exit = Number(exitPrice);
  if (!(entry > 0) && !(exit > 0)) return;
  try {
    const list = readAssets(doc).filter(item => item && !(item.asset === symbol && Math.abs(Number(item.at || 0) - Number(at || Date.now())) < 5 * 60 * 1000));
    list.unshift({ asset: symbol, side: String(side || '').slice(0, 6), entryPrice: entry > 0 ? entry : null, exitPrice: exit > 0 ? exit : null, at: Number(at) || Date.now() });
    doc.defaultView?.localStorage?.setItem(ASSET_KEY, JSON.stringify(list.slice(0, 120)));
  } catch {}
}

export function closePricesForItem(doc, item) {
  const byAddress = closePricesFor(doc, item?.positionAddress);
  if (byAddress) return byAddress;
  const symbol = String(item?.asset || item?.symbol || '').toUpperCase();
  if (!symbol) return null;
  const closedAt = Number(item?.closedAt) || Date.now();
  const side = String(item?.side || '').toUpperCase();
  const match = readAssets(doc).find(entry => entry && entry.asset === symbol
    && (!side || !entry.side || entry.side === side)
    && Math.abs(Number(entry.at || 0) - closedAt) < 60 * 60 * 1000);
  if (!match) return null;
  return { entryPrice: Number(match.entryPrice) || null, exitPrice: Number(match.exitPrice) || null, at: Number(match.at) || null };
}
