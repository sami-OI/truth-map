// Truth Map API proxy: a Cloudflare Worker that keeps the API key off the web page.
//
//   Webflow page ──(no key)──► this Worker ──(adds the key)──► data API
//
// The browser never sees the key. The Worker also:
//   • only answers pages on ALLOWED_ORIGINS (your Webflow domains)
//   • only allows the truth-map endpoints the dashboard uses
//   • caches public answers at Cloudflare's edge (CACHE_SECONDS) so slow endpoints are fast for everyone
//   • never caches a signed-in answer: those are limited to one credential's organisations,
//     and the cache is shared by everyone
//
// Settings (Worker → Settings → Variables and Secrets):
//   API_KEY          secret  the data API key (add it as a Secret, not plain text)
//   UPSTREAM_BASE    text    data API origin, e.g. https://your-api-host   (no path, no trailing /)
//   ALLOWED_ORIGINS  text    comma-separated, e.g. https://your-site.com,https://your-site.webflow.io
//   API_KEY_HEADER   text    optional, default "api-key"
//   CACHE_SECONDS    text    optional, default 300
const ROUTES = /^\/api\/v1\/truth-map\/(me|countries(\/(courses|county-breakdown|course-breakdown|assignment-scores|cohort-progress))?)$/;
const LOGIN = '/api/v1/truth-map/auth/login';
const TOKEN_HEADER = 'X-Truth-Map-Token';

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin ? origin : (allowed[0] || 'null'),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': `Accept, Content-Type, ${TOKEN_HEADER}`,
      'Access-Control-Max-Age': '86400',
      'Vary': `Origin, ${TOKEN_HEADER}`,
    };
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: okOrigin ? 204 : 403, headers: cors });
    if (!okOrigin) return reply(403, { message: 'Origin not allowed' });

    const url = new URL(request.url);
    const upstream = String(env.UPSTREAM_BASE || '').replace(/\/+$/, '') + url.pathname + url.search;
    const keyHeader = { [env.API_KEY_HEADER || 'api-key']: env.API_KEY };

    // Sign-in: passed straight through, never cached.
    if (url.pathname === LOGIN) {
      if (request.method !== 'POST') return reply(405, { message: 'Method not allowed' });
      return passThrough(upstream, cors, reply, {
        method: 'POST',
        headers: { ...keyHeader, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: await request.text(),
      });
    }

    if (request.method !== 'GET') return reply(405, { message: 'Method not allowed' });
    if (!ROUTES.test(url.pathname)) return reply(404, { message: 'Not found' });

    // Signed in: passed straight through, never read from or written to the shared cache.
    const token = request.headers.get(TOKEN_HEADER);
    if (token) {
      return passThrough(upstream, cors, reply, {
        headers: { ...keyHeader, Accept: 'application/json', [TOKEN_HEADER]: token },
      });
    }

    // Edge cache: same URL → same answer for CACHE_SECONDS, shared by all visitors
    const ttl = Number(env.CACHE_SECONDS || 300);
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const cacheKey = new Request(url.toString(), { method: 'GET' });
    if (cache && ttl > 0) {
      const hit = await cache.match(cacheKey);
      if (hit) {
        const h = new Headers(hit.headers);
        Object.entries(cors).forEach(([k, v]) => h.set(k, v));
        h.set('X-Proxy-Cache', 'HIT');
        return new Response(hit.body, { status: hit.status, headers: h });
      }
    }

    let res;
    try {
      res = await fetch(upstream, {
        headers: { ...keyHeader, Accept: 'application/json' },
      });
    } catch (e) {
      return reply(502, { message: 'Data service unreachable' });
    }

    const headers = new Headers({ 'Content-Type': res.headers.get('Content-Type') || 'application/json' });
    Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
    headers.set('Cache-Control', `public, max-age=${ttl}`);
    const out = new Response(res.body, { status: res.status, headers });
    // only successful answers are cached
    if (cache && ttl > 0 && res.ok) ctx.waitUntil(cache.put(cacheKey, out.clone()));
    headers.set('X-Proxy-Cache', 'MISS');
    return out;
  },
};

async function passThrough(upstream, cors, reply, init) {
  let res;
  try {
    res = await fetch(upstream, init);
  } catch (e) {
    return reply(502, { message: 'Data service unreachable' });
  }
  const headers = new Headers({ 'Content-Type': res.headers.get('Content-Type') || 'application/json' });
  Object.entries(cors).forEach(([k, v]) => headers.set(k, v));
  headers.set('Cache-Control', 'no-store');
  return new Response(res.body, { status: res.status, headers });
}
