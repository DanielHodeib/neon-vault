import { create } from 'zustand';

interface CasinoStore {
  balance: number;
  xp: number;
  username: string;
  isHydrating: boolean;
  hydrateFromSession: () => Promise<void>;
  syncBalanceFromServer: () => Promise<void>;
  placeBet: (amount: number) => boolean;
  addWin: (amount: number) => void;
  faucet: () => void;
  persistWalletAction: (action: 'bet' | 'win' | 'faucet', amount: number) => Promise<boolean>;
}

export const useCasinoStore = create<CasinoStore>((set, get) => ({
  balance: 10000,
  xp: 0,
  username: 'Guest',
  isHydrating: false,
  hydrateFromSession: async () => {
    set({ isHydrating: true });
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        user?: {
          username: string;
          balance: number;
          xp: number;
        };
      };

      if (!data.user) {
        return;
      }

      set({
        username: data.user.username,
        balance: data.user.balance,
        xp: data.user.xp,
      });
    } finally {
      set({ isHydrating: false });
    }
  },
  syncBalanceFromServer: async () => {
    try {
      const response = await fetch('/api/me', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        user?: {
          balance: number;
          xp: number;
        };
      };

      if (!data.user) {
        return;
      }

      set({ balance: data.user.balance, xp: data.user.xp });
    } catch {
      // keep local state when network call fails
    }
  },
  placeBet: (amount) => {
    const currentBalance = get().balance;
    if (currentBalance >= amount && amount > 0) {
      set({ balance: currentBalance - amount });
      return true;
    }
    return false;
  },
  addWin: (amount) => set((state) => ({ balance: state.balance + amount })),
  faucet: () => set((state) => ({ balance: state.balance + 1000 })),
  persistWalletAction: async (action, amount) => {
    try {
      const response = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount }),
      });

      const payload = (await response.json()) as { balance?: number };
      if (!response.ok || typeof payload.balance !== 'number') {
        return false;
      }

      set({ balance: payload.balance });
      return true;
    } catch {
      return false;
    }
  },
}));