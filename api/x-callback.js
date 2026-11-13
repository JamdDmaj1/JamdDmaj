import handler from './x-auth.js';
export const config = { runtime: 'edge' };
export default function callback(request) {
  const url = new URL(request.url);
  url.searchParams.set('action', 'callback');
  return handler(new Request(url.toString(), { method: request.method, headers: request.headers }));
}
