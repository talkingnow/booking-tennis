import { create } from 'zustand';

const BOOT_AUTOLOGIN_KEY = 'bt.ui.bootAutoLogin';

function loadBootAutoLogin(): boolean {
  try {
    return localStorage.getItem(BOOT_AUTOLOGIN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Lightweight UI coordination store.
 * - isArmed: race countdown armed state (SwUpdatePrompt suppresses during this).
 * - bootAutoLogin: when true, app boot triggers validateAndLogin for all sites.
 *   Default false — user must opt-in via 계정 설정.
 */
type UiState = {
  isArmed: boolean;
  setArmed: (armed: boolean) => void;
  bootAutoLogin: boolean;
  setBootAutoLogin: (on: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  isArmed: false,
  setArmed: (armed) => set({ isArmed: armed }),
  bootAutoLogin: loadBootAutoLogin(),
  setBootAutoLogin: (on) => {
    try { localStorage.setItem(BOOT_AUTOLOGIN_KEY, on ? '1' : '0'); } catch {}
    set({ bootAutoLogin: on });
  },
}));
