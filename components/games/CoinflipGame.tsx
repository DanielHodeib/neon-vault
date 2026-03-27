'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { Socket } from 'socket.io-client';

import { useCasinoStore } from '../../store/useCasinoStore';

interface CoinflipLobby {
  id: string;
  amount: number;
  creatorSocketId: string;
  creatorUsername: string;
  createdAt: number;
}

interface CoinflipResult {
  id: string;
  creatorUsername: string;
  joinerUsername: string;
  winnerUsername: string;
  loserUsername: string;
  amount: number;
  pot: number;
  payout: number;
  fee: number;
  resolvedAt: number;
}

interface CoinflipRunningPayload {
  id: string;
  creatorUsername: string;
  joinerUsername: string;
  amount: number;
  startedAt: number;
}

type LobbySortMode = 'highest' | 'lowest';
type LobbyQuickFilter = 'all' | 'small' | 'medium' | 'highroller';

export default function CoinflipGame({ socket, username }: { socket: Socket | null; username: string }) {
  const { balance, placeBet, addWin, persistWalletAction } = useCasinoStore();
  const [betAmount, setBetAmount] = useState(1000);
  const [openLobbies, setOpenLobbies] = useState<CoinflipLobby[]>([]);
  const [coinflipStatus, setCoinflipStatus] = useState<'waiting' | 'running'>('waiting');
  const [runningMatch, setRunningMatch] = useState<CoinflipRunningPayload | null>(null);
  const [lastResult, setLastResult] = useState<CoinflipResult | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [notice, setNotice] = useState('Create a coinflip and wait for an opponent.');
  const [sortMode, setSortMode] = useState<LobbySortMode>('highest');
  const [quickFilter, setQuickFilter] = useState<LobbyQuickFilter>('all');

  const safeBalance = useMemo(() => Math.max(0, Math.floor(Number(balance) || 0)), [balance]);
  const ownLobby = useMemo(() => openLobbies.find((lobby) => lobby.creatorUsername === username) ?? null, [openLobbies, username]);
  const canCreate = !ownLobby && !spinning && coinflipStatus !== 'running';

  const displayedLobbies = useMemo(() => {
    const filtered = openLobbies.filter((lobby) => {
      if (quickFilter === 'small') {
        return lobby.amount < 1000;
      }

      if (quickFilter === 'medium') {
        return lobby.amount >= 1000 && lobby.amount <= 10000;
      }

      if (quickFilter === 'highroller') {
        return lobby.amount > 10000;
      }

      return true;
    });

    return filtered.sort((left, right) => {
      if (sortMode === 'lowest') {
        return left.amount - right.amount;
      }
      return right.amount - left.amount;
    });
  }, [openLobbies, quickFilter, sortMode]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const coinflipStateHandler = (payload: { openLobbies?: CoinflipLobby[]; openLobby?: CoinflipLobby | null; status?: 'waiting' | 'running'; lastResult: CoinflipResult | null }) => {
      const nextLobbies = Array.isArray(payload.openLobbies)
        ? payload.openLobbies
        : payload.openLobby
          ? [payload.openLobby]
          : [];

      setOpenLobbies(nextLobbies);
      setCoinflipStatus(payload.status === 'running' ? 'running' : 'waiting');
      setLastResult(payload.lastResult ?? null);
    };

    const coinflipCanceledHandler = async (payload: { creatorUsername?: string; refundAmount?: number }) => {
      if (payload.creatorUsername === username && Number(payload.refundAmount) > 0) {
        await persistWalletAction('refund', Number(payload.refundAmount));
      }

      setNotice('Coinflip canceled.');
    };

    const coinflipResultHandler = (result: CoinflipResult) => {
      setCoinflipStatus('waiting');
      setRunningMatch(null);
      setLastResult(result);
      setSpinning(false);
      setNotice(`${result.winnerUsername} wins ${result.payout} NVC (${result.fee} house fee).`);

      if (result.winnerUsername === username) {
        addWin(result.payout, {
          source: 'coinflip',
          tier: 'duel',
          multiplier: 2,
        });
      }
    };

    const coinflipRunningHandler = (payload: CoinflipRunningPayload) => {
      const validMatch = Boolean(payload?.creatorUsername && payload?.joinerUsername && Number(payload?.amount) > 0);
      setRunningMatch(validMatch ? payload : null);
      setCoinflipStatus('running');

      if (validMatch) {
        setSpinning(true);
        setNotice(`${payload.creatorUsername} vs ${payload.joinerUsername} for ${payload.amount * 2} NVC...`);
      } else {
        setSpinning(false);
      }
    };

    socket.on('coinflip_state', coinflipStateHandler);
    socket.on('coinflip_canceled', coinflipCanceledHandler);
    socket.on('coinflip_running', coinflipRunningHandler);
    socket.on('coinflip_result', coinflipResultHandler);
    socket.emit('coinflip_get_state', {});

    return () => {
      socket.off('coinflip_state', coinflipStateHandler);
      socket.off('coinflip_canceled', coinflipCanceledHandler);
      socket.off('coinflip_running', coinflipRunningHandler);
      socket.off('coinflip_result', coinflipResultHandler);
    };
  }, [addWin, persistWalletAction, socket, username]);

  const createCoinflip = () => {
    if (!socket || !canCreate) {
      return;
    }

    const amount = Math.max(1, Math.floor(Number(betAmount) || 0));
    if (amount > safeBalance) {
      setNotice('Not enough balance.');
      return;
    }

    socket.emit('coinflip_create', { amount }, (response: { ok: boolean; error?: string }) => {
      if (!response?.ok) {
        setNotice(response?.error ?? 'Could not create coinflip.');
        return;
      }

      const debited = placeBet(amount);
      if (!debited) {
        setNotice('Could not reserve stake from wallet.');
        socket.emit('coinflip_cancel', {});
        return;
      }

      setNotice(`Coinflip created for ${amount} NVC. Waiting for challenger...`);
    });
  };

  const joinCoinflip = (lobby: CoinflipLobby) => {
    if (!socket || !lobby || lobby.creatorUsername === username || spinning || coinflipStatus === 'running') {
      return;
    }

    if (lobby.amount > safeBalance) {
      setNotice('Not enough balance to join.');
      return;
    }

    socket.emit('coinflip_join', { lobbyId: lobby.id }, (response: { ok: boolean; error?: string; result?: CoinflipResult }) => {
      if (!response?.ok) {
        setNotice(response?.error ?? 'Could not join coinflip.');
        return;
      }

      const debited = placeBet(lobby.amount);
      if (!debited) {
        setNotice('Could not reserve stake from wallet.');
        return;
      }

      setNotice('Coinflip accepted. Waiting for running state...');
      if (response.result) {
        setLastResult(response.result);
      }
    });
  };

  const cancelCoinflip = (lobbyId: string) => {
    if (!socket || spinning) {
      return;
    }

    socket.emit('coinflip_cancel', { lobbyId }, (response: { ok: boolean; error?: string }) => {
      if (!response?.ok) {
        setNotice(response?.error ?? 'Cancel failed.');
        return;
      }
      setNotice('Coinflip canceled and stake refunded.');
    });
  };

  return (
    <div className="h-full min-h-0 p-6 overflow-y-auto bg-slate-900">
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-slate-100">Coinflip 1v1</h2>
          <span className="text-xs uppercase tracking-wide text-slate-500">House Fee 5%</span>
        </div>

        <p className="mt-2 text-sm text-slate-400">Create a duel, wait for a joiner, winner takes the pot minus fee.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
          <input
            type="number"
            min={1}
            value={betAmount}
            onChange={(event) => setBetAmount(Math.max(1, Math.floor(Number(event.target.value) || 1)))}
            className="h-11 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500"
          />
          <button
            onClick={createCoinflip}
            disabled={!canCreate}
            className="h-11 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Create
          </button>
          <div className="h-11 px-4 rounded-lg border border-slate-700 bg-slate-900 text-slate-400 text-sm flex items-center justify-center">
            {coinflipStatus === 'running' ? 'Running' : ownLobby ? 'Own lobby open' : 'Idle'}
          </div>
          <div className="h-11 px-4 rounded-lg border border-slate-700 bg-slate-900 text-slate-400 text-sm flex items-center justify-center">
            {runningMatch ? `${runningMatch.creatorUsername} vs ${runningMatch.joinerUsername}` : 'Waiting'}
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Open Lobby</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as LobbySortMode)}
              className="h-9 rounded-lg border border-slate-700 bg-slate-950 px-3 text-xs text-slate-100 outline-none"
            >
              <option value="highest">Highest Amount First</option>
              <option value="lowest">Lowest Amount First</option>
            </select>
            <button
              onClick={() => setQuickFilter('small')}
              className={`h-9 px-3 rounded-lg border text-xs font-semibold ${quickFilter === 'small' ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}
            >
              Small Bets
            </button>
            <button
              onClick={() => setQuickFilter('medium')}
              className={`h-9 px-3 rounded-lg border text-xs font-semibold ${quickFilter === 'medium' ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}
            >
              Medium
            </button>
            <button
              onClick={() => setQuickFilter('highroller')}
              className={`h-9 px-3 rounded-lg border text-xs font-semibold ${quickFilter === 'highroller' ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}
            >
              Highroller
            </button>
            <button
              onClick={() => setQuickFilter('all')}
              className={`h-9 px-3 rounded-lg border text-xs font-semibold ${quickFilter === 'all' ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200' : 'border-slate-700 bg-slate-950 text-slate-300'}`}
            >
              All
            </button>
          </div>

          <div className="mt-3 space-y-2 max-h-72 overflow-y-auto pr-1">
            {displayedLobbies.length > 0 ? (
              displayedLobbies.map((lobby) => {
                const mine = lobby.creatorUsername === username;
                const canJoin = !mine && !spinning && coinflipStatus !== 'running' && safeBalance >= lobby.amount;
                return (
                  <div key={lobby.id} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm">👤</span>
                      <span className="text-sm text-slate-200 truncate">{lobby.creatorUsername}</span>
                      <span className="text-xs text-slate-500">{lobby.amount} NVC</span>
                    </div>
                    {mine ? (
                      <button
                        onClick={() => cancelCoinflip(lobby.id)}
                        disabled={spinning || coinflipStatus === 'running'}
                        className="h-8 px-3 rounded-lg border border-slate-700 bg-slate-900 text-slate-300 text-xs font-semibold disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    ) : (
                      <button
                        onClick={() => joinCoinflip(lobby)}
                        disabled={!canJoin}
                        className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Join
                      </button>
                    )}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-slate-500">No open duel right now.</p>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center">
          <motion.div
            animate={spinning ? { rotateY: [0, 360, 720, 1080] } : { rotateY: 0 }}
            transition={spinning ? { duration: 1.6, ease: 'easeInOut' } : { duration: 0.2 }}
            className="h-24 w-24 rounded-full border border-yellow-400/50 bg-yellow-500/10 text-4xl flex items-center justify-center"
          >
            🪙
          </motion.div>
        </div>

        {lastResult ? (
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Last Result</p>
            <p className="mt-1 text-sm text-slate-200">
              {lastResult.winnerUsername} beat {lastResult.loserUsername} and won {lastResult.payout} NVC
            </p>
          </div>
        ) : null}

        <p className="mt-4 text-sm text-slate-400">{notice}</p>
      </div>
    </div>
  );
}
