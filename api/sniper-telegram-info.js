import {corsHeaders, jsonResponse} from '../lib/server.js';
export const config = { runtime: 'edge' };

// Ayuda a descubrir el id del grupo y del tema donde deben llegar los avisos.
export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const secret = String(process.env.SNIPER_ALERTS_TOKEN || process.env.JAMDDMAJ_CRON_SECRET || '');
  const provided = request.headers.get('x-jamd-cron') || (new URL(request.url).searchParams.get('secret') || '');
  if (!secret || provided !== secret) return jsonResponse(request, { error: { message: 'Forbidden' } }, 403);
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return jsonResponse(request, { error: { message: 'PUSH_NOT_READY' } }, 503);

  const call = async method => {
    try {
      const response = await fetch('https://api.telegram.org/bot' + token + '/' + method, { signal: AbortSignal.timeout(8000) });
      return await response.json().catch(() => null);
    } catch { return null; }
  };

  const me = await call('getMe');
  const webhook = await call('getWebhookInfo');
  const updates = await call('getUpdates?limit=20&allowed_updates=%5B%22message%22%2C%22channel_post%22%5D');

  const seen = [];
  for (const update of Array.isArray(updates?.result) ? updates.result : []) {
    const message = update.message || update.channel_post || update.edited_message || null;
    if (!message?.chat) continue;
    seen.push({
      chatId: message.chat.id,
      title: message.chat.title || message.chat.username || message.chat.first_name || '',
      type: message.chat.type,
      isForum: Boolean(message.chat.is_forum),
      threadId: message.message_thread_id ?? null,
      text: String(message.text || '').slice(0, 80)
    });
  }

  return jsonResponse(request, {
    bot: me?.result?.username || null,
    webhook: webhook?.result?.url || null,
    updatesOk: Boolean(updates?.ok),
    updatesError: updates?.ok === false ? updates?.description : null,
    chats: seen
  });
}
