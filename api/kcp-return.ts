export const config = { runtime: 'edge', regions: ['icn1'] };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const site = url.searchParams.get('site') ?? '';

  let bodyParams = new URLSearchParams();
  if (req.method === 'POST') {
    const text = await req.text();
    bodyParams = new URLSearchParams(text);
  }

  // Merge URL params (GET) and body params (POST) — body takes precedence
  const qs = new URLSearchParams(url.searchParams);
  for (const [k, v] of bodyParams.entries()) qs.set(k, v);

  // Ensure site propagates even if not in body
  if (site) qs.set('site', site);

  const dest = new URL('/payment-result', url.origin);
  dest.search = qs.toString();

  return Response.redirect(dest.toString(), 302);
}
