export const config = { runtime: 'edge', regions: ['icn1'] };

const UPSTREAM = 'https://www.pjtennis.or.kr';
const ALLOWED_PATHS = [
  /^\/Login$/,
  /^\/logOff$/,
  /^\/daily(\/\d+)?(\/\d{4}-\d{2}-\d{2})?$/,
  /^\/rsvConfirm$/,
  /^\/rsvVf$/,
  /^\/rsvCls$/,
  /^\/myPage$/,
  /^\/guide$/,
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
  // Always strip these — we override below to spoof same-origin to pjtennis
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
  const subpath = url.pathname.replace(/^\/api\/pj/, '') || '/';

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
    if (k.toLowerCase() === 'x-pj-cookie') {
      fwd.set('Cookie', v);
      continue;
    }
    fwd.set(k, v);
  }
  // Full Chrome browser header set — WAF fingerprint evasion (H3 hypothesis)
  fwd.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  fwd.set('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8');
  fwd.set('Accept-Language', 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7');
  fwd.set('Accept-Encoding', 'gzip, deflate, br');
  fwd.set('Cache-Control', 'no-cache');
  fwd.set('Pragma', 'no-cache');
  fwd.set('Sec-Ch-Ua', '"Chromium";v="131", "Not_A Brand";v="24"');
  fwd.set('Sec-Ch-Ua-Mobile', '?0');
  fwd.set('Sec-Ch-Ua-Platform', '"Windows"');
  fwd.set('Sec-Fetch-Dest', 'document');
  fwd.set('Sec-Fetch-Mode', 'navigate');
  fwd.set('Sec-Fetch-Site', 'same-origin');
  fwd.set('Sec-Fetch-User', '?1');
  fwd.set('Upgrade-Insecure-Requests', '1');
  // Always spoof Referer/Origin to pjtennis for all POST requests.
  if (req.method === 'POST') {
    fwd.set('Content-Type', 'application/x-www-form-urlencoded');
    fwd.set('Referer', UPSTREAM + '/');
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

  function diagErr(e: unknown, elapsedMs: number) {
    return {
      name: (e as any)?.name,
      message: String((e as any)?.message ?? e),
      cause: String((e as any)?.cause ?? ''),
      causeName: (e as any)?.cause?.name ?? null,
      causeCode: (e as any)?.cause?.code ?? null,
      stack: (e as any)?.stack?.split('\n').slice(0, 3).join(' | '),
      elapsedMs,
      edgeRegion: (typeof process !== 'undefined' && process.env?.VERCEL_REGION) ?? 'unknown',
      timestamp: new Date().toISOString(),
    };
  }

  let upstreamRes: Response;
  const t0 = Date.now();
  try {
    upstreamRes = await fetch(upstream, {
      method: req.method,
      headers: fwd,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
  } catch (e) {
    const elapsed = Date.now() - t0;
    console.error('upstream fail', { ...diagErr(e, elapsed), upstream });
    if (!isTransientError(e)) {
      return new Response(
        JSON.stringify({ error: 'upstream_unreachable', ...diagErr(e, elapsed) }),
        { status: 502, headers: { 'content-type': 'application/json' } },
      );
    }
    // 1 retry on transient errors (200ms delay, shorter 8s timeout)
    await new Promise((r) => setTimeout(r, 200));
    const t1 = Date.now();
    try {
      upstreamRes = await fetch(upstream, {
        method: req.method,
        headers: fwd,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(8000),
      });
    } catch (e2) {
      const elapsed2 = Date.now() - t1;
      console.error('upstream fail retry', { ...diagErr(e2, elapsed2), upstream });
      return new Response(
        JSON.stringify({ error: 'upstream_unreachable', ...diagErr(e2, elapsed2) }),
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
  outHeaders.set('X-PJ-Status', String(upstreamRes.status));
  const loc = upstreamRes.headers.get('location');
  if (loc) outHeaders.set('X-PJ-Location', loc);
  if (setCookies.length) {
    outHeaders.set('X-PJ-Set-Cookie', setCookies.join('\n'));
  }

  // Read body once
  const buf = await upstreamRes.arrayBuffer();

  // Normalize status: always return 200 to the PWA so fetch() reads body cleanly
  // Real status is in X-PJ-Status
  return new Response(buf, {
    status: 200,
    headers: outHeaders,
  });
}
