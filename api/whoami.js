import {corsHeaders, jsonResponse} from '../lib/server.js';
import {authenticateTrial} from '../lib/web-trial-session.js';
export const config = { runtime: 'edge' };

// Devuelve solo el prefijo del hash de cuenta de la sesión actual, para
// comprobar si coincide con la cuenta dueña de la billetera.
export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  const cookie = (request.headers.get('cookie') || '').split(';').map(value => value.trim()).find(value => value.startsWith('__Host-jamd-access='));
  const headerToken = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  const token = /^[a-f0-9]{64}$/.test(headerToken) ? headerToken : (cookie ? cookie.split('=')[1] : '');
  if (!/^[a-f0-9]{64}$/.test(token)) return jsonResponse(request, { error: { message: 'Sin sesión' } }, 401);
  try {
    const account = await authenticateTrial(new Request(request.url, { headers: { Authorization: 'Bearer ' + token } }));
    return jsonResponse(request, { accountPrefix: String(account).slice(0, 8), accountSuffix: String(account).slice(-6) });
  } catch {
    return jsonResponse(request, { error: { message: 'Sesión no válida' } }, 401);
  }
}
