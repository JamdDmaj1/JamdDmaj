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
