const KEY = 'bt:account';

export type StoredAccount = {
  id: string;
  pw: string;
  remember: boolean;
  savedAt: number;
};

export function loadAccount(): StoredAccount | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredAccount;
  } catch {
    return null;
  }
}

export function saveAccount(account: StoredAccount): void {
  localStorage.setItem(KEY, JSON.stringify(account));
}

export function clearAccount(): void {
  localStorage.removeItem(KEY);
}
