'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

import { useCasinoStore } from '../../store/useCasinoStore';

type BetType = 'number' | 'color' | 'parity' | 'range' | 'dozen' | 'column';

interface ActiveBet {
  key: string;
  type: BetType;
  value: string;
  label: string;
  stake: number;
  multiplier: number;
}

interface SpinHistoryItem {
  number: number;
  color: 'red' | 'black' | 'green';
}

type BetMap = Record<string, ActiveBet>;

interface RouletteWinAnnouncement {
  roomId: string;
  username: string;
  amount: number;
}

interface RouletteSpinResultPayload {
  roomId: string;
  roundId: string;
  winningNumber: number;
  winningIndex?: number;
  wheelSize?: number;
  emittedAt?: number;
  initiatedBy?: string;
}

interface RouletteSpinRequestResponse {
  ok: boolean;
  error?: string;
  roundId?: string;
  winningNumber?: number;
}

interface RouletteRoomMember {
  id: string;
  username: string;
}

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const BOARD_ROWS = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];
const WHEEL_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const WHEEL_SEGMENT_DEGREES = 360 / WHEEL_NUMBERS.length;
const POINTER_OFFSET_DEGREES = 0;
const EXTRA_SPIN_ROTATIONS = 5;
const SPIN_ANIMATION_MS = 4200;
const DOZEN_MAP: Record<string, Set<number>> = {
  '1st': new Set(Array.from({ length: 12 }, (_, index) => index + 1)),
  '2nd': new Set(Array.from({ length: 12 }, (_, index) => index + 13)),
  '3rd': new Set(Array.from({ length: 12 }, (_, index) => index + 25)),
};
const COLUMN_MAP: Record<string, Set<number>> = {
  '1': new Set([1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]),
  '2': new Set([2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35]),
  '3': new Set([3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36]),
};

function getSocketUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL ?? process.env.NEXT_PUBLIC_GAME_SERVER_URL;

  if (typeof window === 'undefined') {
    return fromEnv ?? 'http://localhost:4001';
  }

  if (fromEnv === 'same-origin') {
    return window.location.origin;
  }

  if (!fromEnv) {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    if (isLocalHost || isPrivateIp) {
      return `${window.location.protocol}//${window.location.hostname}:4001`;
    }
    return window.location.origin;
  }

  try {
    return new URL(fromEnv).toString().replace(/\/$/, '');
  } catch {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    if (isLocalHost || isPrivateIp) {
      return `${window.location.protocol}//${window.location.hostname}:4001`;
    }
    return window.location.origin;
  }
}

function shouldForcePolling(socketUrl: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const parsed = new URL(socketUrl);
    return window.location.protocol === 'https:' && parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

function getNumberColor(value: number): 'red' | 'black' | 'green' {
  if (value === 0) {
    return 'green';
  }

  return RED_NUMBERS.has(value) ? 'red' : 'black';
}

function getWheelSegmentFill(value: number) {
  const color = getNumberColor(value);
  if (color === 'green') {
    return '#059669';
  }
  if (color === 'red') {
    return '#dc2626';
  }
  return '#020617';
}

function getWheelTextFill(value: number) {
  return getNumberColor(value) === 'black' ? '#e2e8f0' : '#ffffff';
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function describeRingSegment(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number
) {
  const startOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${endInner.x} ${endInner.y}`,
    'Z',
  ].join(' ');
}

function getBetKey(type: BetType, value: string) {
  return `${type}:${value}`;
}

function createBet(type: BetType, value: string, stake: number): ActiveBet {
  if (type === 'number') {
    return {
      key: getBetKey(type, value),
      type,
      value,
      label: `Number ${value}`,
      stake,
      multiplier: 36,
    };
  }

  if (type === 'color') {
    return {
      key: getBetKey(type, value),
      type,
      value,
      label: value === 'red' ? 'Red' : 'Black',
      stake,
      multiplier: 2,
    };
  }

  if (type === 'parity') {
    return {
      key: getBetKey(type, value),
      type,
      value,
      label: value === 'even' ? 'Even' : 'Odd',
      stake,
      multiplier: 2,
    };
  }

  if (type === 'range') {
    return {
      key: getBetKey(type, value),
      type,
      value,
      label: value === 'low' ? '1-18' : '19-36',
      stake,
      multiplier: 2,
    };
  }

  if (type === 'dozen') {
    return {
      key: getBetKey(type, value),
      type,
      value,
      label: `${value} dozen`,
      stake,
      multiplier: 3,
    };
  }

  return {
    key: getBetKey(type, value),
    type,
    value,
    label: `Column ${value}`,
    stake,
    multiplier: 3,
  };
}

function doesBetWin(bet: ActiveBet, result: number, resultColor: 'red' | 'black' | 'green') {
  if (bet.type === 'number') {
    const numberBet = Math.floor(Number(bet.value));
    return Number.isFinite(numberBet) && numberBet === result;
  }

  if (bet.type === 'color') {
    return result !== 0 && bet.value === resultColor;
  }

  if (bet.type === 'parity') {
    return result !== 0 && ((bet.value === 'even' && result % 2 === 0) || (bet.value === 'odd' && result % 2 === 1));
  }

  if (bet.type === 'range') {
    return result !== 0 && ((bet.value === 'low' && result >= 1 && result <= 18) || (bet.value === 'high' && result >= 19 && result <= 36));
  }

  if (bet.type === 'dozen') {
    if (result === 0) {
      return false;
    }
    const mappedDozen = DOZEN_MAP[bet.value];
    return Boolean(mappedDozen?.has(result));
  }

  if (result === 0) {
    return false;
  }

  const mappedColumn = COLUMN_MAP[bet.value];
  return Boolean(mappedColumn?.has(result));
}

function getTargetRotationForWinningNumber(winningNumber: number, currentRotation: number) {
  const index = WHEEL_NUMBERS.indexOf(winningNumber);
  if (index < 0) {
    return currentRotation + EXTRA_SPIN_ROTATIONS * 360;
  }

  const normalizedCurrentRotation = ((currentRotation % 360) + 360) % 360;
  const segmentCenterDegrees = index * WHEEL_SEGMENT_DEGREES;
  const targetDegrees = ((360 - (segmentCenterDegrees + POINTER_OFFSET_DEGREES)) % 360 + 360) % 360;
  const deltaToTarget = ((targetDegrees - normalizedCurrentRotation) % 360 + 360) % 360;

  return currentRotation + EXTRA_SPIN_ROTATIONS * 360 + deltaToTarget;
}

export default function RouletteGame() {
  const { balance, username, placeBet, addWin, persistWalletAction, syncBalanceFromServer } = useCasinoStore();
  const [chipValue, setChipValue] = useState(100);
  const [bets, setBets] = useState<BetMap>({});
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winningNumber, setWinningNumber] = useState<number | null>(null);
  const [spinHistory, setSpinHistory] = useState<SpinHistoryItem[]>([]);
  const [status, setStatus] = useState('Click any field to place chips. Multiple bets are allowed.');
  const [errorText, setErrorText] = useState('');
  const [rouletteRoomId, setRouletteRoomId] = useState('global');
  const [rouletteRoomMembers, setRouletteRoomMembers] = useState<RouletteRoomMember[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const rouletteRoomIdRef = useRef('global');
  const pendingSpinStakeRef = useRef(0);
  const pendingSpinBetsRef = useRef<ActiveBet[]>([]);
  const settleSpinTimerRef = useRef<number | null>(null);

  const effectiveUsername = (username ?? '').trim() || 'Guest';

  const activeBets = useMemo(() => Object.values(bets), [bets]);
  const uniquePlayers = useMemo(() => {
    const ids = Array.from(new Set(rouletteRoomMembers.map((player) => player.id)));
    return ids
      .map((id) => rouletteRoomMembers.find((player) => player.id === id))
      .filter((player): player is RouletteRoomMember => Boolean(player));
  }, [rouletteRoomMembers]);
  const totalBet = useMemo(
    () => activeBets.reduce((sum, bet) => sum + bet.stake, 0),
    [activeBets]
  );

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    rouletteRoomIdRef.current = rouletteRoomId;
  }, [rouletteRoomId]);

  useEffect(() => {
    const socketUrl = getSocketUrl();
    const forcePolling = shouldForcePolling(socketUrl);

    const socket = io(socketUrl, {
      path: '/socket.io',
      transports: forcePolling ? ['polling'] : ['websocket', 'polling'],
      upgrade: !forcePolling,
      query: { username: effectiveUsername, rouletteRoomId: 'global' },
    });

    socketRef.current = socket;

    const rouletteRoomJoinedHandler = (payload: { ok: boolean; roomId?: string }) => {
      if (payload.ok && payload.roomId) {
        setRouletteRoomId(payload.roomId);
      }
    };

    const rouletteRoomMembersHandler = (payload: { roomId: string; members: RouletteRoomMember[] }) => {
      if (!payload?.roomId) {
        return;
      }

      setRouletteRoomMembers(payload.members ?? []);
    };

    const rouletteWinAnnouncementHandler = (payload: RouletteWinAnnouncement) => {
      if (payload.username === effectiveUsername || payload.amount <= 0) {
        return;
      }
      toast.success(`${payload.username} hat ${payload.amount} NVC gewonnen!`, {
        id: `roulette-win-${payload.roomId}`,
      });
    };

    const rouletteSpinResultHandler = (payload: RouletteSpinResultPayload) => {
      if (!payload || payload.roomId !== rouletteRoomIdRef.current) {
        return;
      }

      const result = Number(payload.winningNumber);
      if (!Number.isFinite(result)) {
        return;
      }

      if (settleSpinTimerRef.current) {
        window.clearTimeout(settleSpinTimerRef.current);
      }

      setWinningNumber(result);
      setIsSpinning(true);
      setStatus(`Server result locked: ${result}. Wheel spinning...`);
      setRotation((current) => getTargetRotationForWinningNumber(result, current));

      settleSpinTimerRef.current = window.setTimeout(() => {
        const resultColor = getNumberColor(result);
        setSpinHistory((current) => [{ number: result, color: resultColor }, ...current].slice(0, 14));

        const pendingStake = pendingSpinStakeRef.current;
        if (pendingStake > 0) {
          let payout = 0;
          const winningLabels: string[] = [];

          pendingSpinBetsRef.current.forEach((bet) => {
            if (doesBetWin(bet, result, resultColor)) {
              payout += bet.stake * bet.multiplier;
              winningLabels.push(bet.label);
            }
          });

          if (payout > 0) {
            addWin(payout);
            socketRef.current?.emit('roulette_win_announcement', {
              roomId: rouletteRoomIdRef.current,
              amount: Math.floor(payout),
            });
            setStatus(`Result ${result} (${resultColor}). Win +${payout.toFixed(2)} on ${winningLabels.join(', ')}`);
          } else {
            setStatus(`Result ${result} (${resultColor}). No active bet hit.`);
          }

          pendingSpinStakeRef.current = 0;
          pendingSpinBetsRef.current = [];
        } else {
          setStatus(`Table result ${result} (${resultColor}).`);
        }

        setIsSpinning(false);
      }, SPIN_ANIMATION_MS);
    };

    socket.on('roulette_room_joined', rouletteRoomJoinedHandler);
    socket.on('roulette_room_members', rouletteRoomMembersHandler);
    socket.on('roulette_win_announcement', rouletteWinAnnouncementHandler);
    socket.on('roulette_spin_result', rouletteSpinResultHandler);

    return () => {
      if (settleSpinTimerRef.current) {
        window.clearTimeout(settleSpinTimerRef.current);
      }
      socket.off('roulette_room_joined', rouletteRoomJoinedHandler);
      socket.off('roulette_room_members', rouletteRoomMembersHandler);
      socket.off('roulette_win_announcement', rouletteWinAnnouncementHandler);
      socket.off('roulette_spin_result', rouletteSpinResultHandler);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [addWin, effectiveUsername]);

  const placeChip = (type: BetType, value: string) => {
    if (isSpinning) {
      return;
    }

    const safeChip = Math.max(1, Math.floor(Number.isFinite(chipValue) ? chipValue : 1));
    const key = getBetKey(type, value);
    setBets((current) => {
      const existing = current[key];
      if (!existing) {
        return {
          ...current,
          [key]: createBet(type, value, safeChip),
        };
      }

      return {
        ...current,
        [key]: {
          ...existing,
          stake: existing.stake + safeChip,
        },
      };
    });
  };

  const clearBets = () => {
    if (!isSpinning) {
      setBets({});
    }
  };

  const spin = async () => {
    const socket = socketRef.current;

    if (!socket || !socket.connected) {
      setErrorText('Socket not connected');
      setTimeout(() => setErrorText(''), 2200);
      return;
    }

    if (activeBets.length === 0) {
      setErrorText('Place at least one bet first');
      setTimeout(() => setErrorText(''), 2200);
      return;
    }

    if (!placeBet(totalBet)) {
      setErrorText('Not enough funds');
      setTimeout(() => setErrorText(''), 2200);
      return;
    }

    setErrorText('');
    setIsSpinning(true);
    setWinningNumber(null);
    setStatus('Waiting for server roulette result...');
    pendingSpinStakeRef.current = totalBet;
    pendingSpinBetsRef.current = activeBets.map((bet) => ({ ...bet }));

    socket.emit('roulette_spin_request', { roomId: rouletteRoomId }, (response: RouletteSpinRequestResponse) => {
      if (response?.ok) {
        return;
      }

      const refundAmount = pendingSpinStakeRef.current;
      pendingSpinStakeRef.current = 0;
      pendingSpinBetsRef.current = [];
      setIsSpinning(false);
      setStatus('Roulette spin canceled. Refunding stake...');

      void (async () => {
        if (refundAmount > 0) {
          await persistWalletAction('refund', refundAmount);
          await syncBalanceFromServer();
        }
        setStatus(response?.error ?? 'Spin request failed. Stake refunded.');
      })();
    });
  };

  const hasBet = (type: BetType, value: string) => Boolean(bets[getBetKey(type, value)]);

  const getStake = (type: BetType, value: string) => bets[getBetKey(type, value)]?.stake ?? 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-slate-900">
      <div className="flex-1 min-h-0 bg-slate-900 px-3 lg:px-4 py-3 lg:py-4 overflow-hidden">
        <div className="h-full min-h-0 rounded-xl border border-slate-800 bg-slate-950 p-3 lg:p-4 grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-3 lg:gap-4 overflow-hidden">
          <div className="min-h-0 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black tracking-wide text-slate-100 uppercase">Roulette</h2>
              <p className="text-sm text-slate-400">Single Zero Table · Global</p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
              <div className="mt-2 rounded-md border border-slate-800 bg-slate-950/70 p-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Players Active ({uniquePlayers.length})</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {uniquePlayers.length === 0 ? <span className="text-xs text-slate-500">No players yet</span> : null}
                  {uniquePlayers.map((member) => (
                    <span key={member.id} className="px-2 py-1 rounded-md border border-slate-700 bg-slate-900 text-[11px] text-slate-200">
                      {member.username}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-1 min-h-0 rounded-lg border border-slate-800 bg-slate-900 p-3">
              <div className="w-full overflow-x-auto no-scrollbar pb-2 shrink-0">
                <div className="h-full min-w-[680px] rounded-md border border-emerald-800/60 bg-emerald-950/55 p-2">
                <div className="grid grid-cols-[56px_1fr_52px] gap-[2px]">
                  <button
                    onClick={() => placeChip('number', '0')}
                    className={`relative row-span-3 rounded-sm border text-sm font-bold transition-colors ${
                      hasBet('number', '0')
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-500'
                    }`}
                  >
                    0
                    {hasBet('number', '0') ? <ChipTag amount={getStake('number', '0')} /> : null}
                  </button>

                  <div className="grid grid-rows-3 gap-[2px]">
                    {BOARD_ROWS.map((row, rowIndex) => (
                      <div key={rowIndex} className="grid grid-cols-12 gap-[2px]">
                        {row.map((number) => {
                          const color = getNumberColor(number);
                          const selected = hasBet('number', String(number));
                          return (
                            <button
                              key={number}
                              onClick={() => placeChip('number', String(number))}
                              className={[
                                'relative rounded-sm border p-1 text-xs font-bold transition-colors md:p-3 md:text-base',
                                color === 'red'
                                  ? 'bg-red-600 text-white border-red-500'
                                  : 'bg-black text-slate-100 border-slate-600',
                                selected ? 'ring-2 ring-blue-600 ring-offset-1 ring-offset-emerald-950/70' : '',
                              ].join(' ')}
                            >
                              {number}
                              {selected ? <ChipTag amount={getStake('number', String(number))} /> : null}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-rows-3 gap-[2px]">
                    {[
                      { label: '2 to 1', value: '3' },
                      { label: '2 to 1', value: '2' },
                      { label: '2 to 1', value: '1' },
                    ].map((col) => (
                      <button
                        key={col.value}
                        onClick={() => placeChip('column', col.value)}
                        className={`relative rounded-sm border text-xs font-bold transition-colors ${
                          hasBet('column', col.value)
                            ? 'border-blue-600 bg-blue-600 text-white'
                            : 'border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800'
                        }`}
                      >
                        {col.label}
                        {hasBet('column', col.value) ? (
                          <ChipTag amount={getStake('column', col.value)} />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-[2px] grid grid-cols-3 gap-[2px]">
                  {[
                    { label: '1st 12', type: 'dozen' as const, value: '1st' },
                    { label: '2nd 12', type: 'dozen' as const, value: '2nd' },
                    { label: '3rd 12', type: 'dozen' as const, value: '3rd' },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => placeChip(item.type, item.value)}
                      className={`relative h-10 rounded-sm border text-sm font-bold transition-colors ${
                        hasBet(item.type, item.value)
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800'
                      }`}
                    >
                      {item.label}
                      {hasBet(item.type, item.value) ? (
                        <ChipTag amount={getStake(item.type, item.value)} />
                      ) : null}
                    </button>
                  ))}
                </div>

                <div className="mt-[2px] grid grid-cols-6 gap-[2px]">
                  {[
                    { label: '1 to 18', type: 'range' as const, value: 'low', tone: 'emerald' },
                    { label: 'Even', type: 'parity' as const, value: 'even', tone: 'emerald' },
                    { label: 'Red', type: 'color' as const, value: 'red', tone: 'red' },
                    { label: 'Black', type: 'color' as const, value: 'black', tone: 'slate' },
                    { label: 'Odd', type: 'parity' as const, value: 'odd', tone: 'emerald' },
                    { label: '19 to 36', type: 'range' as const, value: 'high', tone: 'emerald' },
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={() => placeChip(item.type, item.value)}
                      className={[
                        'relative h-10 rounded-sm border text-sm font-bold transition-colors',
                        hasBet(item.type, item.value)
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : item.tone === 'red'
                            ? 'border-red-500 bg-red-600 text-white hover:bg-red-500'
                            : item.tone === 'slate'
                              ? 'border-slate-600 bg-black text-slate-100 hover:bg-slate-900'
                              : 'border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800',
                      ].join(' ')}
                    >
                      {item.label}
                      {hasBet(item.type, item.value) ? (
                        <ChipTag amount={getStake(item.type, item.value)} />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex flex-col gap-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs font-bold text-slate-500 uppercase mb-3">History</p>
              <div className="flex flex-wrap gap-2 min-h-9">
                {spinHistory.length === 0 ? (
                  <p className="text-sm text-slate-500">No spins yet.</p>
                ) : (
                  spinHistory.map((item, index) => (
                    <div
                      key={`${item.number}-${index}`}
                      className={[
                        'h-8 min-w-8 px-2 rounded-md border text-xs font-bold flex items-center justify-center',
                        item.color === 'green'
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : item.color === 'red'
                            ? 'bg-red-600 border-red-500 text-white'
                            : 'bg-black border-slate-600 text-slate-100',
                      ].join(' ')}
                    >
                      {item.number}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 flex-1 min-h-0 flex flex-col items-center justify-center">
              <div className="relative w-72 h-72 mx-auto">
                <div className="absolute inset-0 rounded-full bg-gradient-to-b from-slate-400 to-slate-800 border border-slate-500 shadow-[inset_0_12px_26px_rgba(255,255,255,0.18)]" />
                <div className="absolute inset-3 rounded-full bg-slate-950 border border-slate-700 shadow-[inset_0_8px_20px_rgba(0,0,0,0.6)]" />
                {isHydrated ? (
                  <motion.div
                    animate={{ rotate: rotation }}
                    transition={{ duration: 1.8, ease: [0.2, 0.9, 0.2, 1] }}
                    className="absolute inset-7 rounded-full border border-slate-600 bg-slate-900 overflow-hidden"
                  >
                    <svg viewBox="0 0 300 300" className="w-full h-full">
                      <circle cx="150" cy="150" r="146" fill="#0f172a" />
                      <circle cx="150" cy="150" r="141" fill="none" stroke="#64748b" strokeWidth="3" />
                      {WHEEL_NUMBERS.map((num, index) => {
                        const step = WHEEL_SEGMENT_DEGREES;
                        const startAngle = index * step - step / 2;
                        const endAngle = startAngle + step;
                        const midAngle = startAngle + step / 2;
                        const textPos = polarToCartesian(150, 150, 122, midAngle);
                        return (
                          <g key={`${num}-${index}`}>
                            <path
                              d={describeRingSegment(150, 150, 138, 108, startAngle, endAngle)}
                              fill={getWheelSegmentFill(num)}
                              stroke="#1e293b"
                              strokeWidth="1.6"
                            />
                            <text
                              x={textPos.x}
                              y={textPos.y}
                              fill={getWheelTextFill(num)}
                              fontSize="11"
                              fontWeight="700"
                              textAnchor="middle"
                              dominantBaseline="middle"
                              transform={`rotate(${midAngle + 90}, ${textPos.x}, ${textPos.y})`}
                            >
                              {num}
                            </text>
                          </g>
                        );
                      })}
                      <circle cx="150" cy="150" r="100" fill="url(#innerTrack)" stroke="#334155" strokeWidth="2" />
                      <circle cx="150" cy="150" r="64" fill="url(#hubGrad)" stroke="#64748b" strokeWidth="2" />
                      <defs>
                        <linearGradient id="innerTrack" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#334155" />
                          <stop offset="100%" stopColor="#020617" />
                        </linearGradient>
                        <linearGradient id="hubGrad" x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#cbd5e1" />
                          <stop offset="100%" stopColor="#64748b" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </motion.div>
                ) : (
                  <div className="absolute inset-7 rounded-full border border-slate-600 bg-slate-900" />
                )}
                <div className="absolute left-1/2 top-[9px] -translate-x-1/2 text-[16px] text-slate-100 font-bold tracking-wider">▼</div>
                <div className="absolute left-1/2 top-[30px] -translate-x-1/2 h-4 w-4 rounded-full bg-white border border-slate-300 shadow-[0_0_14px_rgba(255,255,255,0.6)]" />
              </div>
              <p className="mt-3 text-sm text-slate-400 text-center">Last: {winningNumber ?? '-'} | Active bets: {activeBets.length}</p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs font-bold text-slate-500 uppercase mb-3">Open Bets</p>
              <div className="space-y-2">
                {activeBets.length === 0 ? (
                  <p className="text-sm text-slate-500">No chips on the table.</p>
                ) : (
                  activeBets.slice(0, 6).map((bet) => (
                    <div key={bet.key} className="flex items-center justify-between text-sm border border-slate-800 rounded-md px-3 py-2 bg-slate-950">
                      <span className="text-slate-300">{bet.label}</span>
                      <span className="font-mono text-slate-100">{bet.stake.toFixed(0)}</span>
                    </div>
                  ))
                )}
                {activeBets.length > 6 ? <p className="text-xs text-slate-500">+ {activeBets.length - 6} more bets</p> : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-800 bg-slate-950 p-3 lg:p-4 shrink-0">
        <div className="mt-4 flex w-full flex-col items-center gap-3 md:flex-row md:items-end">
        <div className="w-full md:max-w-xs">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Chip Value</label>
          <input
            type="number"
            min={1}
            value={chipValue}
            onChange={(event) => setChipValue(Math.max(0, parseInt(event.target.value, 10) || 0))}
            disabled={isSpinning}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 outline-none font-mono text-white focus:border-blue-600"
          />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={() => setChipValue((value) => Math.max(1, Math.floor(value / 2) || 1))}
              disabled={isSpinning}
              className="h-9 rounded-md border border-slate-800 bg-slate-900 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              1/2
            </button>
            <button
              onClick={() => setChipValue(Math.max(0, Math.floor(parseFloat(balance))))}
              disabled={isSpinning}
              className="h-9 rounded-md border border-slate-800 bg-slate-900 text-xs font-bold text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
            >
              MAX
            </button>
          </div>
          <p className="text-xs mt-2 text-slate-500">Total on table: {totalBet.toFixed(0)}</p>
          {errorText ? <p className="text-red-500 text-xs mt-2 font-medium">{errorText}</p> : null}
        </div>

        <div className="flex w-full flex-col gap-3 md:flex-1 md:flex-row">
          <button
            onClick={clearBets}
            disabled={isSpinning || activeBets.length === 0}
            className={`h-11 w-full rounded-lg font-bold text-sm uppercase transition-colors md:w-40 ${
              isSpinning || activeBets.length === 0
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-100'
            }`}
          >
            Clear
          </button>
          <button
            onClick={spin}
            disabled={isSpinning || activeBets.length === 0}
            className={`flex-1 h-11 rounded-lg font-bold text-sm uppercase transition-colors ${
              isSpinning || activeBets.length === 0
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {isSpinning ? 'Spinning...' : 'Spin'}
          </button>
        </div>
        </div>
      </div>
      <div className="px-3 lg:px-4 pb-3 bg-slate-950 shrink-0">
        <p className="text-sm text-slate-400">{status} · Global table</p>
      </div>
    </div>
  );
}

function ChipTag({ amount }: { amount: number }) {
  return (
    <span className="absolute -top-2 -right-2 h-5 min-w-5 px-1 rounded-full bg-blue-600 text-[10px] leading-5 font-bold text-white">
      {Math.round(amount)}
    </span>
  );
}
