import { create } from 'zustand';

export type VipRank = 'Bronze' | 'Silver' | 'Gold' | 'Neon';

const COMPACT_BALANCE_STORAGE_KEY = 'nvc_use_compact_balance';

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

function getInitialCompactBalance(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }

  const stored = window.localStorage.getItem(COMPACT_BALANCE_STORAGE_KEY);
  if (stored === null) {
    return true;
  }

  return stored === 'true';
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

interface WinMeta {
  source?: string;
  tier?: string;
  multiplier?: number;
}

interface CasinoStore {
  balance: string;
  xp: number;
  announcement: string | null;
  useCompactBalance: boolean;
  daily: DailyProgress;
  username: string;
  isHydrating: boolean;
  setAnnouncement: (msg: string | null) => void;
  toggleCompactBalance: (value: boolean) => void;
  fetchInitialBalance: () => Promise<void>;
  hydrateFromSession: () => Promise<void>;
  syncBalanceFromServer: () => Promise<void>;
  placeBet: (amount: number) => boolean;
  addWin: (amount: number, winMeta?: WinMeta) => void;
  persistWalletAction: (
    action: 'bet' | 'win' | 'faucet' | 'refund',
    amount: number,
    metadata?: WinMeta
  ) => Promise<WalletActionResult>;
}

export const useCasinoStore = create<CasinoStore>((set, get) => ({
  balance: '0.00',
  xp: 0,
  announcement: null,
  useCompactBalance: getInitialCompactBalance(),
  daily: {
    date: '',
    bets: 0,
    wins: 0,
    faucetClaimed: false,
    questClaimed: false,
  },
  username: 'Guest',
  isHydrating: false,
  setAnnouncement: (msg) => set({ announcement: msg }),
  toggleCompactBalance: (value) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(COMPACT_BALANCE_STORAGE_KEY, value ? 'true' : 'false');
    }
    set({ useCompactBalance: value });
  },
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
    const currentBalance = parseFloat(get().balance);
    const amountNum = parseFloat(safeAmount);
    if (currentBalance >= amountNum && amountNum > 0) {
      set({ balance: normalizeCurrency(currentBalance - amountNum) });

      void get()
        .persistWalletAction('bet', amountNum)
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
  addWin: (amount, winMeta) => {
    const safeAmount = normalizeCurrency(Number.isFinite(amount) ? amount : 0);
    const amountNum = parseFloat(safeAmount);
    if (amountNum <= 0) {
      return;
    }

    set((state) => {
      const currentBalance = parseFloat(state.balance);
      return { balance: normalizeCurrency(currentBalance + amountNum) };
    });

    void get()
      .persistWalletAction('win', amountNum, winMeta)
      .then(async (result) => {
        if (!result.ok) {
          await get().syncBalanceFromServer();
        }
      })
      .catch(async () => {
        await get().syncBalanceFromServer();
      });
  },
  persistWalletAction: async (action, amount, metadata) => {
    try {
      const response = await fetch('/api/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, amount, ...(metadata ?? {}) }),
      });

      const payload = (await response.json()) as {
        balance?: number | string;
        xp?: number;
        error?: string;
        daily?: DailyProgress;
      };

      if (!response.ok) {
        const error = payload.error ?? 'Wallet action failed.';
        console.warn(`Wallet ${action} failed:`, error, payload);
        return { ok: false, error };
      }

      const parsedBalance = parseBalanceValue(payload.balance);
      if (parsedBalance === null) {
        console.error('Failed to parse balance:', payload.balance);
        return { ok: false, error: 'Invalid balance format from server.' };
      }

      set((state) => ({
        balance: parsedBalance,
        xp: typeof payload.xp === 'number' ? payload.xp : state.xp,
        daily: payload.daily ?? state.daily,
      }));

      return { ok: true };
    } catch (error) {
      console.error('Wallet action network error:', error);
      return { ok: false, error: 'Network error.' };
    }
  },
}));