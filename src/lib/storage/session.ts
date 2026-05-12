const KEY = 'bt:session';
const TTL_MS = 2 * 60 * 60 * 1000 - 5 * 60 * 1000; // 2h - 5min safety margin

type StoredSession = {
  cookie: string;
  savedAt: number;
};

export function loadSession(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    if (Date.now() - s.savedAt > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return s.cookie;
  } catch {
    return null;
  }
}

export function saveSession(cookie: string): void {
  const s: StoredSession = { cookie, savedAt: Date.now() };
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

export function sessionAge(): number | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSession;
    return Date.now() - s.savedAt;
  } catch {
    return null;
  }
}
