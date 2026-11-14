import {corsHeaders, jsonResponse, redisRequest} from '../lib/server.js';
import {serverPushSender} from '../lib/firebase-push-server.js';

export const config = { maxDuration: 30 };

// Sends the Sniper alerts that already went to Telegram to every device that
// enabled Sniper notifications. Requires the Sniper alert token.
async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return jsonResponse(request, { error: { message: 'Method not allowed' } }, 405);
  const secret = String(process.env.SNIPER_ALERTS_TOKEN || '');
  const provided = request.headers.get('x-jamd-cron') || '';
  if (!secret || provided !== secret) return jsonResponse(request, { error: { message: 'Forbidden' } }, 403);
  let body;
  try { body = await request.json(); } catch { return jsonResponse(request, { error: { message: 'Invalid body' } }, 400); }
  const trade = body?.mode === 'trade' ? { account: String(body?.account || ''), text: String(body?.body || '').trim().slice(0, 240) } : null;
  const alerts = Array.isArray(body?.alerts) ? body.alerts.filter(text => typeof text === 'string' && text.trim()).slice(0, 10) : [];
  if (trade && (!/^[a-f0-9]{64}$/.test(trade.account) || !trade.text)) return jsonResponse(request, { error: { message: 'INPUT' } }, 400);
  if (!alerts.length && !trade) return jsonResponse(request, { sent: 0 });
  let sender;
  try { sender = serverPushSender(); } catch { return jsonResponse(request, { ready: false, sent: 0 }); }

  const now = Date.now();
  let ids = [];
  try {
    const rows = await redisRequest('pipeline', [['ZRANGEBYSCORE', 'jamd:push:index', String(now), '+inf']]);
    ids = Array.isArray(rows?.[0]?.result) ? rows[0].result : [];
  } catch { return jsonResponse(request, { error: { message: 'STORE_UNAVAILABLE' } }, 503); }
  if (!ids.length) return jsonResponse(request, { sent: 0, devices: 0 });

  const records = [];
  for (let index = 0; index < ids.length; index += 20) {
    const chunk = ids.slice(index, index + 20).map(id => ['GET', 'jamd:push:device:' + id]);
    try {
      const rows = await redisRequest('pipeline', chunk);
      for (const row of rows || []) {
        try { const record = JSON.parse(row?.result || 'null'); if (record && record.expiresAt > now && (trade ? record.account === trade.account : record.preferences?.sniper === true)) records.push(record); } catch {}
      }
    } catch {}
  }

  let sent = 0;
  const texts = trade ? [trade.text] : alerts;
  for (const record of records.slice(0, 100)) {
    for (const text of texts) {
      const bodyText = String(text).slice(0, 240);
      const eventId = 'snp' + String(Math.abs(hashCode(record.id + bodyText + now)) % 100000000).padStart(8, '0');
      try {
        const result = await sender.send({ transport: record.transport, target: record.target, kind: 'price', body: bodyText, eventId });
        if (result?.accepted) sent++;
      } catch {}
    }
  }
  return jsonResponse(request, { devices: records.length, sent });
}

function hashCode(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index++) { hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0; }
  return hash;
}

export default { fetch: handler };
