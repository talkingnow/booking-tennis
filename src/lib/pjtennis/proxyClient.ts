/**
 * Browser-side client for the Vercel Edge proxy at /api/pj/*.
 *
 * Conventions:
 * - Real upstream status code is returned in `X-PJ-Status` header.
 *   The transport status is always 200 (so fetch can read body even on 303).
 * - Set-Cookie (one or many) is in `X-PJ-Set-Cookie` joined by `\n`.
 * - Redirect Location is in `X-PJ-Location`.
 * - Send session cookie back upstream via `X-PJ-Cookie` request header.
 */

export type ProxyResponse = {
  status: number;
  location: string | null;
  setCookies: string[];
  headers: Headers;
  text: () => Promise<string>;
  bytes: () => Promise<ArrayBuffer>;
};

export type ProxyRequestInit = {
  method?: 'GET' | 'POST';
  body?: BodyInit | URLSearchParams;
  cookie?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

const BASE = '/api/pj';

export async function pjFetch(path: string, init: ProxyRequestInit = {}): Promise<ProxyResponse> {
  if (!path.startsWith('/')) path = '/' + path;
  const headers: Record<string, string> = { ...(init.headers || {}) };
  if (init.cookie) headers['X-PJ-Cookie'] = init.cookie;

  const isForm = init.body instanceof URLSearchParams;
  if (isForm && !headers['content-type']) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
  }

  const res = await fetch(BASE + path, {
    method: init.method || 'GET',
    headers,
    body: init.body as BodyInit | undefined,
    signal: init.signal,
    credentials: 'same-origin',
  });

  const statusHdr = res.headers.get('X-PJ-Status');
  const locationHdr = res.headers.get('X-PJ-Location');
  const setCookieHdr = res.headers.get('X-PJ-Set-Cookie');

  // Lazy body access — caller decides text vs bytes
  let cached: ArrayBuffer | null = null;
  const bytes = async () => {
    if (cached) return cached;
    cached = await res.arrayBuffer();
    return cached;
  };

  return {
    status: statusHdr ? Number(statusHdr) : res.status,
    location: locationHdr,
    setCookies: setCookieHdr ? setCookieHdr.split('\n').filter(Boolean) : [],
    headers: res.headers,
    text: async () => new TextDecoder('utf-8').decode(await bytes()),
    bytes,
  };
}

/**
 * Extract the pjtennis session cookie value from a Set-Cookie line.
 * R2 확정 (M0 curl 2026-05-12): 세션 쿠키 이름 = pjtssn (gytennis: gytssn)
 */
export function extractPjSession(setCookies: string[]): string | null {
  const re = /(?:^|;\s*)(pjtssn=[^;]+)/i;
  for (const sc of setCookies) {
    const m = sc.match(re);
    if (m) return m[1];
  }
  return null;
}
