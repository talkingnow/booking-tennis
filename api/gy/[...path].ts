export const config = { runtime: 'edge', regions: ['icn1'] };

const UPSTREAM = 'https://www.gytennis.or.kr';
const ALLOWED_PATHS = [
  /^\/Login$/,
  /^\/logOff$/,
  /^\/daily(\/\d+)?(\/\d{4}-\d{2}-\d{2})?$/,
  /^\/rsvConfirm$/,
  /^\/rsvVf$/,
  /^\/rsvCls$/,
  /^\/myPage$/,
  /^\/tooltip$/,
  /^\/$/,
];

const STRIP_REQ_HEADERS = new Set([
  'host',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-forwarded-for',
  'x-real-ip',
  'x-vercel-id',
  'x-vercel-deployment-url',
  'x-vercel-forwarded-for',
  'x-vercel-ip-country',
  'x-vercel-ip-city',
  'x-vercel-ip-country-region',
  'forwarded',
  'connection',
  'content-length',
  'cookie',
  // Always strip these — we override below to spoof same-origin to gytennis
  'referer',
  'origin',
]);

const STRIP_RES_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'set-cookie',
  'strict-transport-security',
]);

function isAllowed(path: string): boolean {
  return ALLOWED_PATHS.some((re) => re.test(path));
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const subpath = url.pathname.replace(/^\/api\/gy/, '') || '/';

  if (!isAllowed(subpath)) {
    return new Response(JSON.stringify({ error: 'path_not_allowed', path: subpath }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  const upstream = `${UPSTREAM}${subpath}${url.search}`;

  // Build forwarded headers
  const fwd = new Headers();
  for (const [k, v] of req.headers.entries()) {
    if (STRIP_REQ_HEADERS.has(k.toLowerCase())) continue;
    if (k.toLowerCase().startsWith('x-vercel-')) continue;
    if (k.toLowerCase() === 'x-gyt-cookie') {
      fwd.set('Cookie', v);
      continue;
    }
    fwd.set(k, v);
  }
  // Always identify as a normal browser
  if (!fwd.has('user-agent')) {
    fwd.set(
      'user-agent',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    );
  }
  fwd.set('Accept-Language', 'ko-KR,ko;q=0.9');
  // Always spoof Referer/Origin to gytennis for all POST requests.
  // gytennis rejects requests with non-gytennis Referer headers ("No direct
  // script access allowed"). Since we strip referer/origin above, we always
  // set them here so gytennis sees a same-origin request.
  if (req.method === 'POST') {
    fwd.set('Referer', UPSTREAM + '/daily');
    fwd.set('Origin', UPSTREAM);
  }

  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.arrayBuffer();
  }

  function isTransientError(e: unknown): boolean {
    const msg = String(e).toLowerCase();
    return msg.includes('timeout') || msg.includes('enotfound') ||
      msg.includes('econnreset') || msg.includes('socket hang up') ||
      msg.includes('network') || msg.includes('abort');
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, {
      method: req.method,
      headers: fwd,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    if (!isTransientError(e)) {
      return new Response(
        JSON.stringify({
          error: 'upstream_unreachable',
          message: String(e),
          name: (e as any)?.name,
          cause: String((e as any)?.cause ?? ''),
        }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      );
    }
    // 1 retry on transient errors
    try {
      upstreamRes = await fetch(upstream, {
        method: req.method,
        headers: fwd,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });
    } catch (e2) {
      return new Response(
        JSON.stringify({
          error: 'upstream_unreachable',
          message: String(e2),
          name: (e2 as any)?.name,
          cause: String((e2 as any)?.cause ?? ''),
        }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      );
    }
  }

  // Extract Set-Cookie (Edge Runtime: use getSetCookie when available)
  const setCookies = typeof (upstreamRes.headers as any).getSetCookie === 'function'
    ? (upstreamRes.headers as any).getSetCookie()
    : (() => {
        const raw = upstreamRes.headers.get('set-cookie');
        return raw ? [raw] : [];
      })();

  const outHeaders = new Headers();
  for (const [k, v] of upstreamRes.headers.entries()) {
    if (STRIP_RES_HEADERS.has(k.toLowerCase())) continue;
    outHeaders.set(k, v);
  }

  // Forward real upstream status code and location
  outHeaders.set('X-GYT-Status', String(upstreamRes.status));
  const loc = upstreamRes.headers.get('location');
  if (loc) outHeaders.set('X-GYT-Location', loc);
  if (setCookies.length) {
    outHeaders.set('X-GYT-Set-Cookie', setCookies.join('\n'));
  }

  // Read body once; we may need to rewrite content
  const buf = await upstreamRes.arrayBuffer();

  // Normalize status: always return 200 to the PWA so fetch() reads body cleanly
  // Real status is in X-GYT-Status
  return new Response(buf, {
    status: 200,
    headers: outHeaders,
  });
}
