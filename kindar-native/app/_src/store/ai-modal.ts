/**
 * AI Modal Store — controla a visibilidade do AIAssistantSheet (modal flutuante).
 *
 * Mirrors the PWA's portal-based AIAssistant component. The FAB in the global
 * layout calls `open()`; AIAssistantSheet listens to `isOpen` and slides up.
 */

import { create } from 'zustand';

interface AIModalState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

export const useAIModal = create<AIModalState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
}));
