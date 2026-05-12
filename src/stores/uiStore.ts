import { create } from 'zustand';

/**
 * Lightweight UI coordination store.
 * Currently tracks whether the race countdown is "armed" so that
 * SwUpdatePrompt can suppress the update banner during critical moments.
 */
type UiState = {
  /** True while the race countdown is armed (firing imminent). */
  isArmed: boolean;
  setArmed: (armed: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  isArmed: false,
  setArmed: (armed) => set({ isArmed: armed }),
}));
