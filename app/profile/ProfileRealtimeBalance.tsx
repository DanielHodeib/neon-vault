'use client';

import { useEffect, useState } from 'react';

import { formatCompactNumber } from '@/lib/formatMoney';
import { useCasinoStore } from '@/store/useCasinoStore';

export default function ProfileRealtimeBalance({ initialBalance }: { initialBalance: number | string }) {
  const balance = useCasinoStore((state) => state.balance);
  const hydrateFromSession = useCasinoStore((state) => state.hydrateFromSession);
  const syncBalanceFromServer = useCasinoStore((state) => state.syncBalanceFromServer);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let isMounted = true;

    void hydrateFromSession().finally(() => {
      if (isMounted) {
        setHydrated(true);
      }
    });

    const interval = window.setInterval(() => {
      void syncBalanceFromServer();
    }, 6000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [hydrateFromSession, syncBalanceFromServer]);

  const displayed = hydrated ? balance : initialBalance;
  const displayedNumber = typeof displayed === 'string' ? parseFloat(displayed) : displayed;
  const safeDisplayed = Number.isFinite(displayedNumber) ? displayedNumber : 0;

  return <span className="mt-2 text-2xl font-mono font-bold text-cyan-300">{formatCompactNumber(safeDisplayed)} NVC</span>;
}
