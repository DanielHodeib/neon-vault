import { create } from 'zustand';

function normalizeCurrency(value: number | string): string {
  const numeric = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(numeric)) {
    return '0.00';
  }

  return (Math.round((numeric + Number.EPSILON) * 100) / 100).toFixed(2);
}

function parseBalanceValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeCurrency(value);
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return normalizeCurrency(numeric);
    }
  }

  return null;
}

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
  balance: string;
  xp: number;
  daily: DailyProgress;
  username: string;
  isHydrating: boolean;
  fetchInitialBalance: () => Promise<void>;
  hydrateFromSession: () => Promise<void>;
  syncBalanceFromServer: () => Promise<void>;
  placeBet: (amount: number) => boolean;
  addWin: (amount: number) => void;
  persistWalletAction: (action: 'bet' | 'win' | 'faucet' | 'refund', amount: number) => Promise<WalletActionResult>;
}

export const useCasinoStore = create<CasinoStore>((set, get) => ({
  balance: '0.00',
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
  fetchInitialBalance: async () => {
    try {
      const response = await fetch('/api/user/balance', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        balance?: number | string;
      };

      const parsedBalance = parseBalanceValue(payload.balance);
      if (parsedBalance === null) {
        return;
      }

      set({ balance: parsedBalance });
    } catch {
      // keep local balance if request fails
    }
  },
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
          balance: number | string;
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

      const parsedBalance = parseBalanceValue(data.user.balance);
      if (parsedBalance === null) {
        return;
      }

      set({
        username: data.user.username,
        balance: parsedBalance,
        xp: data.user.xp,
        daily: {
          date: data.user.dailyStatsDate ?? '',
          bets: data.user.dailyBets ?? 0,
          wins: data.user.dailyWins ?? 0,
          faucetClaimed: data.user.dailyFaucetClaimed ?? false,
          questClaimed: data.user.dailyQuestClaimed ?? false,
        },
      });

      await get().fetchInitialBalance();
    } finally {
      set({ isHydrating: false });
    }
  },
  syncBalanceFromServer: async () => {
    try {
      const [profileResponse, balanceResponse] = await Promise.all([
        fetch('/api/me', { cache: 'no-store' }),
        fetch('/api/user/balance', { cache: 'no-store' }),
      ]);

      if (!profileResponse.ok || !balanceResponse.ok) {
        return;
      }

      const [data, balancePayload] = (await Promise.all([
        profileResponse.json(),
        balanceResponse.json(),
      ])) as [
        {
          user?: {
            xp: number;
            dailyStatsDate: string;
            dailyBets: number;
            dailyWins: number;
            dailyFaucetClaimed: boolean;
            dailyQuestClaimed: boolean;
          };
        },
        { balance?: number | string }
      ];

      const parsedBalance = parseBalanceValue(balancePayload.balance);
      if (!data.user || parsedBalance === null) {
        return;
      }

      set({
        balance: parsedBalance,
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
    const safeAmount = normalizeCurrency(Number.isFinite(amount) ? amount : 0);
    const currentBalance = normalizeCurrency(get().balance);
    if (currentBalance >= safeAmount && safeAmount > 0) {
      set({ balance: normalizeCurrency(currentBalance - safeAmount) });

      void get()
        .persistWalletAction('bet', safeAmount)
        .then(async (result) => {
          if (!result.ok) {
            await get().syncBalanceFromServer();
          }
        })
        .catch(async () => {
          await get().syncBalanceFromServer();
        });

      return true;
    }
    return false;
  },
  addWin: (amount) => {
    const safeAmount = normalizeCurrency(Number.isFinite(amount) ? amount : 0);
    if (safeAmount <= 0) {
      return;
    }

    set((state) => ({ balance: normalizeCurrency(state.balance + safeAmount) }));

    void get()
      .persistWalletAction('win', safeAmount)
      .then(async (result) => {
        if (!result.ok) {
          await get().syncBalanceFromServer();
        }
      })
      .catch(async () => {
        await get().syncBalanceFromServer();
      });
  },
  persistWalletAction: async (action, amount) => {
    try {
      const response = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount }),
      });

      const payload = (await response.json()) as {
        balance?: number | string;
        xp?: number;
        error?: string;
        daily?: DailyProgress;
      };

      const parsedBalance = parseBalanceValue(payload.balance);
      if (!response.ok || parsedBalance === null) {
        return { ok: false, error: payload.error ?? 'Wallet action failed.' };
      }

      set((state) => ({
        balance: parsedBalance,
        xp: typeof payload.xp === 'number' ? payload.xp : state.xp,
        daily: payload.daily ?? state.daily,
      }));

      return { ok: true };
    } catch {
      return { ok: false, error: 'Network error.' };
    }
  },
}));