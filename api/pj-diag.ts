export const config = { runtime: 'edge', regions: ['hnd1'] };

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

type CheckResult =
  | { ok: true; status: number; elapsedMs: number; server: string | null; contentLength: string | null }
  | { ok: false; elapsedMs: number; name: string; message: string; cause: string };

async function checkUrl(url: string): Promise<CheckResult> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      headers: {
        'User-Agent': CHROME_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });
    return {
      ok: true,
      status: r.status,
      elapsedMs: Date.now() - t0,
      server: r.headers.get('server'),
      contentLength: r.headers.get('content-length'),
    };
  } catch (e: unknown) {
    return {
      ok: false,
      elapsedMs: Date.now() - t0,
      name: (e as any)?.name ?? 'UnknownError',
      message: String((e as any)?.message ?? e),
      cause: String((e as any)?.cause ?? ''),
    };
  }
}

export default async function handler(): Promise<Response> {
  const targets = [
    'https://www.pjtennis.or.kr/',
    'https://www.pjtennis.or.kr/Login',
    'https://www.gytennis.or.kr/',
  ];

  const results = await Promise.all(targets.map((url) => checkUrl(url)));
  const checks: Record<string, CheckResult> = {};
  targets.forEach((url, i) => { checks[url] = results[i]; });

  const edgeRegion = (typeof process !== 'undefined' && process.env?.VERCEL_REGION) ?? 'unknown';

  return new Response(
    JSON.stringify({ edgeRegion, timestamp: new Date().toISOString(), checks }, null, 2),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}
