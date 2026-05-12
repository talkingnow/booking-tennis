/**
 * Measures the approximate clock offset between the client and the Vercel
 * Edge Function server by reading the `Date` response header.
 *
 * Algorithm (per sample):
 *   1. Record client time T0 = Date.now() before request.
 *   2. Send HEAD /api/gy/ (cheap, no body).
 *   3. Record client time T1 = Date.now() after response arrives.
 *   4. Parse server time S from the Date header.
 *   5. offset = S − midpoint, where midpoint = (T0 + T1) / 2.
 *
 * Returns the *median* offset over `samples` iterations to reduce outliers.
 * Returns 0 if no Date header is available.
 */
export async function measureServerOffsetMs(samples = 3): Promise<number> {
  const offsets: number[] = [];

  for (let i = 0; i < samples; i++) {
    try {
      const before = Date.now();
      const res = await fetch('/api/gy/', { method: 'HEAD', cache: 'no-store' });
      const after = Date.now();

      const dateHeader = res.headers.get('date');
      if (!dateHeader) continue;

      const serverTime = new Date(dateHeader).getTime();
      if (isNaN(serverTime)) continue;

      const midpoint = Math.round((before + after) / 2);
      offsets.push(serverTime - midpoint);
    } catch {
      // Network error on one sample — skip
    }
  }

  if (offsets.length === 0) return 0;

  // Return the median
  const sorted = [...offsets].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
