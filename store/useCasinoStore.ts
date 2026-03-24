import { create } from 'zustand';

export interface DailyProgress {
  date: string;
  bets: number;
  wins: number;
  faucetClaimed: boolean;
  questClaimed: boolean;
}

interface WalletActionResult {
  ok: boolean;
  error?: string;
}

interface CasinoStore {
  balance: number;
  xp: number;
  daily: DailyProgress;
  username: string;
  isHydrating: boolean;
  hydrateFromSession: () => Promise<void>;
  syncBalanceFromServer: () => Promise<void>;
  placeBet: (amount: number) => boolean;
  addWin: (amount: number) => void;
  persistWalletAction: (action: 'bet' | 'win' | 'faucet' | 'quest' | 'refund', amount: number) => Promise<WalletActionResult>;
}

export const useCasinoStore = create<CasinoStore>((set, get) => ({
  balance: 10000,
  xp: 0,
  daily: {
    date: '',
    bets: 0,
    wins: 0,
    faucetClaimed: false,
    questClaimed: false,
  },
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
          dailyStatsDate: string;
          dailyBets: number;
          dailyWins: number;
          dailyFaucetClaimed: boolean;
          dailyQuestClaimed: boolean;
        };
      };

      if (!data.user) {
        return;
      }

      set({
        username: data.user.username,
        balance: data.user.balance,
        xp: data.user.xp,
        daily: {
          date: data.user.dailyStatsDate ?? '',
          bets: data.user.dailyBets ?? 0,
          wins: data.user.dailyWins ?? 0,
          faucetClaimed: data.user.dailyFaucetClaimed ?? false,
          questClaimed: data.user.dailyQuestClaimed ?? false,
        },
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
          dailyStatsDate: string;
          dailyBets: number;
          dailyWins: number;
          dailyFaucetClaimed: boolean;
          dailyQuestClaimed: boolean;
        };
      };

      if (!data.user) {
        return;
      }

      set({
        balance: data.user.balance,
        xp: data.user.xp,
        daily: {
          date: data.user.dailyStatsDate ?? '',
          bets: data.user.dailyBets ?? 0,
          wins: data.user.dailyWins ?? 0,
          faucetClaimed: data.user.dailyFaucetClaimed ?? false,
          questClaimed: data.user.dailyQuestClaimed ?? false,
        },
      });
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
  persistWalletAction: async (action, amount) => {
    try {
      const response = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount }),
      });

      const payload = (await response.json()) as {
        balance?: number;
        xp?: number;
        error?: string;
        daily?: DailyProgress;
      };

      if (!response.ok || typeof payload.balance !== 'number') {
        return { ok: false, error: payload.error ?? 'Wallet action failed.' };
      }

      set((state) => ({
        balance: payload.balance as number,
        xp: typeof payload.xp === 'number' ? payload.xp : state.xp,
        daily: payload.daily ?? state.daily,
      }));

      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error.' };
    }
  },
}));