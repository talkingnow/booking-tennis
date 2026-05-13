/**
 * Browser-side client for the Vercel Edge proxy at /api/gy/*.
 *
 * Conventions:
 * - Real upstream status code is returned in `X-GYT-Status` header.
 *   The transport status is always 200 (so fetch can read body even on 303).
 * - Set-Cookie (one or many) is in `X-GYT-Set-Cookie` joined by `\n`.
 * - Redirect Location is in `X-GYT-Location`.
 * - Send session cookie back upstream via `X-GYT-Cookie` request header.
 */

export type ProxyResponse = {
  status: number;
  location: string | null;
  setCookies: string[];
  headers: Headers;
  /** True when the Edge proxy returned 502 with error=upstream_unreachable */
  upstreamError: boolean;
  text: () => Promise<string>;
  bytes: () => Promise<ArrayBuffer>;
};

export type ProxyRequestInit = {
  method?: 'GET' | 'POST';
  body?: BodyInit | URLSearchParams;
  cookie?: string; // value of gytssn (or full cookie string)
  signal?: AbortSignal;
  headers?: Record<string, string>;
};

const BASE = '/api/gy';

export async function gyFetch(path: string, init: ProxyRequestInit = {}): Promise<ProxyResponse> {
  if (!path.startsWith('/')) path = '/' + path;
  const headers: Record<string, string> = { ...(init.headers || {}) };
  if (init.cookie) headers['X-GYT-Cookie'] = init.cookie;

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

  const statusHdr = res.headers.get('X-GYT-Status');
  const locationHdr = res.headers.get('X-GYT-Location');
  const setCookieHdr = res.headers.get('X-GYT-Set-Cookie');

  // Lazy body access — caller decides text vs bytes
  let cached: ArrayBuffer | null = null;
  const bytes = async () => {
    if (cached) return cached;
    cached = await res.arrayBuffer();
    return cached;
  };

  // Detect 502 upstream_unreachable from the Edge proxy
  const resolvedStatus = statusHdr ? Number(statusHdr) : res.status;
  const upstreamError = res.status === 502 && !statusHdr;

  return {
    status: resolvedStatus,
    location: locationHdr,
    setCookies: setCookieHdr ? setCookieHdr.split('\n').filter(Boolean) : [],
    headers: res.headers,
    upstreamError,
    text: async () => new TextDecoder('utf-8').decode(await bytes()),
    bytes,
  };
}

/**
 * Extract the gytssn cookie value from a Set-Cookie line.
 * Example: "gytssn=abc123; Path=/; Max-Age=7200; Secure; HttpOnly; SameSite=None"
 */
export function extractGytssn(setCookies: string[]): string | null {
  for (const sc of setCookies) {
    const m = sc.match(/(?:^|;\s*)gytssn=([^;]+)/i);
    if (m) return `gytssn=${m[1]}`;
  }
  return null;
}
