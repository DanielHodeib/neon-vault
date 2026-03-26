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

export default function CoinflipGame({ socket, username }: { socket: Socket | null; username: string }) {
  const { balance, placeBet, addWin, persistWalletAction } = useCasinoStore();
  const [betAmount, setBetAmount] = useState(1000);
  const [openLobby, setOpenLobby] = useState<CoinflipLobby | null>(null);
  const [lastResult, setLastResult] = useState<CoinflipResult | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [notice, setNotice] = useState('Create a coinflip and wait for an opponent.');

  const safeBalance = useMemo(() => Math.max(0, Math.floor(Number(balance) || 0)), [balance]);
  const canCreate = !openLobby && !spinning;
  const isCreator = openLobby?.creatorUsername === username;

  useEffect(() => {
    if (!socket) {
      return;
    }

    const coinflipStateHandler = (payload: { openLobby: CoinflipLobby | null; lastResult: CoinflipResult | null }) => {
      setOpenLobby(payload.openLobby ?? null);
      setLastResult(payload.lastResult ?? null);
    };

    const coinflipCanceledHandler = async (payload: { creatorUsername?: string; refundAmount?: number }) => {
      if (payload.creatorUsername === username && Number(payload.refundAmount) > 0) {
        await persistWalletAction('refund', Number(payload.refundAmount));
      }

      setNotice('Coinflip canceled.');
    };

    const coinflipResultHandler = (result: CoinflipResult) => {
      setLastResult(result);
      setSpinning(true);
      setNotice(`Coin is flipping for ${result.pot} NVC...`);

      window.setTimeout(() => {
        setSpinning(false);
        setNotice(`${result.winnerUsername} wins ${result.payout} NVC (${result.fee} house fee).`);

        if (result.winnerUsername === username) {
          addWin(result.payout, {
            source: 'coinflip',
            tier: 'duel',
            multiplier: 2,
          });
        }
      }, 1600);
    };

    socket.on('coinflip_state', coinflipStateHandler);
    socket.on('coinflip_canceled', coinflipCanceledHandler);
    socket.on('coinflip_result', coinflipResultHandler);
    socket.emit('coinflip_get_state', {});

    return () => {
      socket.off('coinflip_state', coinflipStateHandler);
      socket.off('coinflip_canceled', coinflipCanceledHandler);
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

  const joinCoinflip = () => {
    if (!socket || !openLobby || isCreator || spinning) {
      return;
    }

    if (openLobby.amount > safeBalance) {
      setNotice('Not enough balance to join.');
      return;
    }

    socket.emit('coinflip_join', {}, (response: { ok: boolean; error?: string; result?: CoinflipResult }) => {
      if (!response?.ok) {
        setNotice(response?.error ?? 'Could not join coinflip.');
        return;
      }

      const debited = placeBet(openLobby.amount);
      if (!debited) {
        setNotice('Could not reserve stake from wallet.');
        return;
      }

      setNotice('Coinflip accepted. Resolving result...');
      if (response.result) {
        setLastResult(response.result);
      }
    });
  };

  const cancelCoinflip = () => {
    if (!socket || !isCreator || spinning) {
      return;
    }

    socket.emit('coinflip_cancel', {}, (response: { ok: boolean; error?: string }) => {
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
          <button
            onClick={joinCoinflip}
            disabled={!openLobby || isCreator || spinning}
            className="h-11 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Join
          </button>
          <button
            onClick={cancelCoinflip}
            disabled={!isCreator || spinning}
            className="h-11 px-4 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Open Lobby</p>
          {openLobby ? (
            <p className="mt-1 text-sm text-slate-200">
              {openLobby.creatorUsername} challenges for {openLobby.amount} NVC
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">No open duel right now.</p>
          )}
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
