'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  startedAt?: number;
  spinMs?: number;
  initiatedBy?: string;
  serverBalance?: number;
}

interface RouletteSpinStartedPayload {
  roomId: string;
  roundId: string;
  startedAt?: number;
  spinMs?: number;
  initiatedBy?: string;
}

interface RouletteSpinRequestResponse {
  ok: boolean;
  error?: string;
  roundId?: string;
  winningNumber?: number;
  spinMs?: number;
  serverBalance?: number;
}

interface RouletteRoomMember {
  id: string;
  username: string;
}

interface BetCellConfig {
  label: string;
  type: BetType;
  value: string;
  idleClassName: string;
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
const COLUMN_BET_CELLS: BetCellConfig[] = [
  { label: '2 to 1', type: 'column', value: '3', idleClassName: 'border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800' },
  { label: '2 to 1', type: 'column', value: '2', idleClassName: 'border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800' },
  { label: '2 to 1', type: 'column', value: '1', idleClassName: 'border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800' },
];
const DOZEN_BET_CELLS: BetCellConfig[] = [
  { label: '1st 12', type: 'dozen', value: '1st', idleClassName: 'border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800' },
  { label: '2nd 12', type: 'dozen', value: '2nd', idleClassName: 'border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800' },
  { label: '3rd 12', type: 'dozen', value: '3rd', idleClassName: 'border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800' },
];
const OUTSIDE_BET_CELLS: BetCellConfig[] = [
  { label: '1 to 18', type: 'range', value: 'low', idleClassName: 'border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800' },
  { label: 'Even', type: 'parity', value: 'even', idleClassName: 'border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800' },
  { label: 'Red', type: 'color', value: 'red', idleClassName: 'border-red-500 bg-red-600 text-white hover:bg-red-500' },
  { label: 'Black', type: 'color', value: 'black', idleClassName: 'border-slate-600 bg-black text-slate-100 hover:bg-slate-900' },
  { label: 'Odd', type: 'parity', value: 'odd', idleClassName: 'border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800' },
  { label: '19 to 36', type: 'range', value: 'high', idleClassName: 'border-emerald-700 bg-emerald-900 text-emerald-100 hover:bg-emerald-800' },
];

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

function getNumberCellIdleClass(color: 'red' | 'black' | 'green') {
  if (color === 'green') {
    return 'border-emerald-300/80 bg-[#16a34a] text-white backdrop-blur-sm hover:shadow-[0_0_15px_rgba(22,163,74,0.55)]';
  }
  if (color === 'red') {
    return 'border-red-300/80 bg-[#dc2626] text-white backdrop-blur-sm hover:shadow-[0_0_15px_rgba(220,38,38,0.55)]';
  }
  return 'border-slate-400/55 bg-[#1a1a1a] text-slate-100 backdrop-blur-sm hover:shadow-[0_0_15px_rgba(148,163,184,0.35)]';
}

interface BetCellProps {
  label: string;
  type: BetType;
  value: string;
  selected: boolean;
  stake: number;
  baseClassName: string;
  idleClassName: string;
  selectedClassName?: string;
  isWinning?: boolean;
  dimmed?: boolean;
  onPlaceBet: (type: BetType, value: string) => void;
}

const BetCell = memo(function BetCell({
  label,
  type,
  value,
  selected,
  stake,
  baseClassName,
  idleClassName,
  selectedClassName,
  isWinning,
  dimmed,
  onPlaceBet,
}: BetCellProps) {
  const handleClick = useCallback(() => {
    onPlaceBet(type, value);
  }, [onPlaceBet, type, value]);

  return (
    <button
      onClick={handleClick}
      className={`${baseClassName} touch-manipulation ${selected ? selectedClassName ?? 'border-blue-600 bg-blue-600 text-white shadow-[0_0_15px_rgba(34,211,238,0.35)]' : idleClassName} ${isWinning ? 'animate-pulse shadow-[0_0_24px_rgba(255,255,255,0.35)]' : ''} ${dimmed ? 'opacity-30' : 'opacity-100'}`}
    >
      {label}
      {selected ? <ChipTag amount={stake} /> : null}
    </button>
  );
});

export default function RouletteGame() {
  const { balance, username, placeBet: reserveStake, addWin, persistWalletAction, syncBalanceFromServer } = useCasinoStore();
  const [chipValue, setChipValue] = useState(100);
  const [bets, setBets] = useState<BetMap>({});
  const [pendingStake, setPendingStake] = useState(0);
  const [lockedStake, setLockedStake] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [isSpinPending, setIsSpinPending] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [spinDurationMs, setSpinDurationMs] = useState(0);
  const [spinPhase, setSpinPhase] = useState<'idle' | 'cruise' | 'decelerating'>('idle');
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
  const winningFocusTimerRef = useRef<number | null>(null);
  const spinningTickerRef = useRef<number | null>(null);
  const [winningBetKey, setWinningBetKey] = useState<string | null>(null);
  const [isWinningFocus, setIsWinningFocus] = useState(false);

  const stopContinuousSpin = useCallback(() => {
    if (spinningTickerRef.current) {
      window.clearInterval(spinningTickerRef.current);
      spinningTickerRef.current = null;
    }
  }, []);

  const startContinuousSpin = useCallback(() => {
    stopContinuousSpin();
    setSpinPhase('cruise');
    setSpinDurationMs(130);
    spinningTickerRef.current = window.setInterval(() => {
      setRotation((current) => current + 110);
    }, 120);
  }, [stopContinuousSpin]);

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
  const totalOnTable = totalBet + pendingStake + lockedStake;

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
      if (winningFocusTimerRef.current) {
        window.clearTimeout(winningFocusTimerRef.current);
      }

      stopContinuousSpin();
      const syncedDuration = 3400;
      setSpinDurationMs(syncedDuration);
      setSpinPhase('decelerating');

      setWinningNumber(result);
      setIsSpinning(true);
      setIsSpinPending(false);
      setStatus(`Server result locked: ${result}. Wheel spinning...`);
      setRotation((current) => getTargetRotationForWinningNumber(result, current));

      settleSpinTimerRef.current = window.setTimeout(() => {
        const resultColor = getNumberColor(result);
        const winningKey = getBetKey('number', String(result));
        setWinningBetKey(winningKey);
        setIsWinningFocus(true);

        winningFocusTimerRef.current = window.setTimeout(() => {
          setIsWinningFocus(false);
          setWinningBetKey(null);
        }, 1700);

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
          setLockedStake(0);
        } else {
          setStatus(`Table result ${result} (${resultColor}).`);
          setLockedStake(0);
        }

        setIsSpinning(false);
        setSpinPhase('idle');
        setSpinDurationMs(0);
      }, syncedDuration);
    };

    const rouletteSpinStartedHandler = (payload: RouletteSpinStartedPayload) => {
      if (!payload || payload.roomId !== rouletteRoomIdRef.current) {
        return;
      }

      const nextSpinMs = Math.max(1800, Number(payload.spinMs ?? SPIN_ANIMATION_MS));
      setSpinDurationMs(nextSpinMs);
      setIsSpinPending(false);
      setIsSpinning(true);
      setSpinPhase('cruise');
      startContinuousSpin();
      setStatus('Spin started. Wheel is running...');
    };

    socket.on('roulette_room_joined', rouletteRoomJoinedHandler);
    socket.on('roulette_room_members', rouletteRoomMembersHandler);
    socket.on('roulette_win_announcement', rouletteWinAnnouncementHandler);
    socket.on('roulette_spin_result', rouletteSpinResultHandler);
    socket.on('roulette_result', rouletteSpinResultHandler);
    socket.on('roulette_spin_started', rouletteSpinStartedHandler);
    socket.on('roulette_started', rouletteSpinStartedHandler);
    socket.on('roulette_spin', rouletteSpinResultHandler);

    return () => {
      if (settleSpinTimerRef.current) {
        window.clearTimeout(settleSpinTimerRef.current);
      }
      if (winningFocusTimerRef.current) {
        window.clearTimeout(winningFocusTimerRef.current);
      }
      stopContinuousSpin();
      socket.off('roulette_room_joined', rouletteRoomJoinedHandler);
      socket.off('roulette_room_members', rouletteRoomMembersHandler);
      socket.off('roulette_win_announcement', rouletteWinAnnouncementHandler);
      socket.off('roulette_spin_result', rouletteSpinResultHandler);
      socket.off('roulette_result', rouletteSpinResultHandler);
      socket.off('roulette_spin_started', rouletteSpinStartedHandler);
      socket.off('roulette_started', rouletteSpinStartedHandler);
      socket.off('roulette_spin', rouletteSpinResultHandler);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [addWin, effectiveUsername, startContinuousSpin, stopContinuousSpin]);

  const placeChip = useCallback((type: BetType, value: string) => {
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
  }, [chipValue, isSpinning]);

  const clearBets = useCallback(() => {
    setBets({});
    pendingSpinBetsRef.current = [];
    if (!isSpinning) {
      setPendingStake(0);
    }
  }, [isSpinning]);

  const spin = useCallback(async () => {
    const socket = socketRef.current;

    if (!socket || !socket.connected) {
      setErrorText('Socket not connected');
      setTimeout(() => setErrorText(''), 2200);
      return;
    }

    if (activeBets.length === 0 || totalOnTable <= 0) {
      setErrorText('Place at least one bet first');
      setTimeout(() => setErrorText(''), 2200);
      return;
    }

    if (!reserveStake(totalBet)) {
      setErrorText('Not enough funds');
      setTimeout(() => setErrorText(''), 2200);
      return;
    }

    const queuedStake = totalBet;
    const queuedBets = activeBets.map((bet) => ({ ...bet }));
    setErrorText('');
    setIsSpinning(true);
    setWinningBetKey(null);
    setIsWinningFocus(false);
    setWinningNumber(null);
    setStatus('Waiting for server roulette result...');
    pendingSpinStakeRef.current = queuedStake;
    pendingSpinBetsRef.current = queuedBets;
    setPendingStake(queuedStake);
    setLockedStake(0);
    setBets({});
    setIsSpinPending(true);
    setStatus('Submitting bets to roulette engine...');

    const serializedBets = queuedBets.reduce<Record<string, { type: BetType; value: string; stake: number }>>((acc, bet) => {
      acc[bet.key] = { type: bet.type, value: bet.value, stake: bet.stake };
      return acc;
    }, {});

    socket.emit('roulette_spin', { roomId: rouletteRoomId, totalBet: queuedStake, bets: serializedBets }, (response: RouletteSpinRequestResponse) => {
      if (response?.ok) {
        setLockedStake(queuedStake);
        setPendingStake(0);
        setIsSpinning(true);
        setIsSpinPending(false);
        setSpinDurationMs(Math.max(1800, Number(response.spinMs ?? SPIN_ANIMATION_MS)));
        setSpinPhase('cruise');
        startContinuousSpin();
        setStatus('Bet accepted. Spin started...');
        return;
      }

      const refundAmount = pendingSpinStakeRef.current;
      pendingSpinStakeRef.current = 0;
      pendingSpinBetsRef.current = [];
      setIsSpinning(false);
      setIsSpinPending(false);
      setSpinPhase('idle');
      setSpinDurationMs(0);
      stopContinuousSpin();
      setPendingStake(0);
      setLockedStake(0);
      setStatus('Roulette spin canceled. Refunding stake...');

      void (async () => {
        if (refundAmount > 0) {
          await persistWalletAction('refund', refundAmount);
          await syncBalanceFromServer();
        }
        setStatus(response?.error ?? 'Spin request failed. Stake refunded.');
      })();
    });
  }, [activeBets, persistWalletAction, reserveStake, rouletteRoomId, startContinuousSpin, stopContinuousSpin, syncBalanceFromServer, totalBet, totalOnTable]);

  const hasBet = useCallback((type: BetType, value: string) => Boolean(bets[getBetKey(type, value)]), [bets]);

  const getStake = useCallback((type: BetType, value: string) => bets[getBetKey(type, value)]?.stake ?? 0, [bets]);

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[radial-gradient(1200px_540px_at_35%_20%,rgba(20,83,45,0.35),rgba(2,6,23,0.95))]">
      <div className="flex-1 min-h-0 px-3 py-3 overflow-hidden lg:px-4 lg:py-4">
        <div className="h-full min-h-0 overflow-hidden rounded-xl border border-white/10 bg-slate-950/70 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-sm lg:p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-black tracking-wide text-slate-100 uppercase">Roulette</h2>
            <p className="text-sm text-slate-400">Single Zero Table · Global</p>
          </div>

          <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm">
            <div className="rounded-md border border-white/10 bg-slate-950/60 p-2">
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

          <div className="mt-4 grid min-w-0 grid-cols-12 gap-4 items-start overflow-hidden">
            <div className="col-span-12 lg:col-span-8 order-2 lg:order-1 min-w-0 max-w-full overflow-hidden">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm overflow-hidden">
                <div className="w-full min-w-0 overflow-hidden pb-2">
                  <div className="roulette-board-fluid">
                    <div className="roulette-board-scale rounded-md border border-emerald-700/30 bg-[radial-gradient(circle_at_50%_40%,rgba(22,163,74,0.35),rgba(4,47,46,0.85)_42%,rgba(2,6,23,0.95)_100%)] p-2 shadow-[inset_0_0_50px_rgba(0,0,0,0.45)]">
                    <div className="grid grid-cols-[minmax(34px,0.95fr)_12fr_minmax(34px,0.9fr)] gap-[2px]">
                      <BetCell
                        label="0"
                        type="number"
                        value="0"
                        selected={hasBet('number', '0')}
                        stake={getStake('number', '0')}
                        onPlaceBet={placeChip}
                        isWinning={winningBetKey === getBetKey('number', '0')}
                        dimmed={isWinningFocus && winningBetKey !== getBetKey('number', '0')}
                        baseClassName="roulette-board-cell roulette-board-cell-number relative row-span-3 rounded-sm border font-bold transition-all duration-200 shadow-[inset_0_-8px_16px_rgba(0,0,0,0.35)]"
                        idleClassName={getNumberCellIdleClass('green')}
                      />

                      <div className="grid grid-rows-3 gap-[2px]">
                        {BOARD_ROWS.map((row, rowIndex) => (
                          <div key={rowIndex} className="grid grid-cols-12 gap-[2px]">
                            {row.map((number) => {
                              const color = getNumberColor(number);
                              const selected = hasBet('number', String(number));
                              return (
                                <BetCell
                                  key={number}
                                  label={String(number)}
                                  type="number"
                                  value={String(number)}
                                  selected={selected}
                                  stake={getStake('number', String(number))}
                                  onPlaceBet={placeChip}
                                  isWinning={winningBetKey === getBetKey('number', String(number))}
                                  dimmed={isWinningFocus && winningBetKey !== getBetKey('number', String(number))}
                                  baseClassName="roulette-board-cell roulette-board-cell-number relative aspect-square rounded-sm border p-1 font-bold transition-all duration-200 shadow-[inset_0_-8px_16px_rgba(0,0,0,0.38)]"
                                  idleClassName={getNumberCellIdleClass(color)}
                                  selectedClassName="bg-blue-600/40 text-white border-cyan-300/50 ring-1 ring-cyan-300/60 shadow-[0_0_20px_rgba(34,211,238,0.35)]"
                                />
                              );
                            })}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-rows-3 gap-[2px]">
                        {COLUMN_BET_CELLS.map((col) => (
                          <BetCell
                            key={col.value}
                            label={col.label}
                            type={col.type}
                            value={col.value}
                            selected={hasBet(col.type, col.value)}
                            stake={getStake(col.type, col.value)}
                            onPlaceBet={placeChip}
                            dimmed={isWinningFocus}
                            baseClassName="roulette-board-cell roulette-board-cell-side relative rounded-sm border font-bold transition-all duration-200 shadow-[inset_0_-8px_16px_rgba(0,0,0,0.35)]"
                            idleClassName="border-white/10 bg-white/5 text-emerald-100 backdrop-blur-sm hover:shadow-[0_0_15px_rgba(250,204,21,0.28)]"
                          />
                        ))}
                      </div>
                    </div>

                    <div className="mt-[2px] grid grid-cols-3 gap-[2px]">
                      {DOZEN_BET_CELLS.map((item) => (
                        <BetCell
                          key={item.label}
                          label={item.label}
                          type={item.type}
                          value={item.value}
                          selected={hasBet(item.type, item.value)}
                          stake={getStake(item.type, item.value)}
                          onPlaceBet={placeChip}
                          dimmed={isWinningFocus}
                          baseClassName="roulette-board-cell roulette-board-cell-band relative h-10 rounded-sm border font-bold transition-all duration-200 shadow-[inset_0_-8px_16px_rgba(0,0,0,0.35)]"
                          idleClassName="border-white/10 bg-white/5 text-emerald-100 backdrop-blur-sm hover:shadow-[0_0_15px_rgba(250,204,21,0.28)]"
                        />
                      ))}
                    </div>

                    <div className="mt-[2px] grid grid-cols-6 gap-[2px]">
                      {OUTSIDE_BET_CELLS.map((item) => (
                        <BetCell
                          key={item.label}
                          label={item.label}
                          type={item.type}
                          value={item.value}
                          selected={hasBet(item.type, item.value)}
                          stake={getStake(item.type, item.value)}
                          onPlaceBet={placeChip}
                          dimmed={isWinningFocus}
                          baseClassName="roulette-board-cell roulette-board-cell-band relative h-10 rounded-sm border font-bold transition-all duration-200 shadow-[inset_0_-8px_16px_rgba(0,0,0,0.35)]"
                          idleClassName="border-white/10 bg-white/5 text-slate-100 backdrop-blur-sm hover:shadow-[0_0_15px_rgba(34,211,238,0.25)]"
                        />
                      ))}
                    </div>
                  </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="col-span-12 lg:col-span-4 order-1 lg:order-2 min-w-0 overflow-hidden flex justify-center">
              <div className="min-h-[300px] w-full rounded-lg border border-white/10 bg-white/[0.03] p-3 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="relative z-50 w-full max-w-[250px] aspect-square">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-b from-slate-400 to-slate-800 border border-slate-500 shadow-[inset_0_12px_26px_rgba(255,255,255,0.18)]" />
                  <div className="absolute inset-3 rounded-full bg-slate-950 border border-slate-700 shadow-[inset_0_8px_20px_rgba(0,0,0,0.6)]" />
                  {isHydrated ? (
                    <div
                      style={{
                        transform: `rotate(${rotation}deg)`,
                        transition: `transform ${Math.max(0, spinDurationMs)}ms ${spinPhase === 'decelerating' ? 'cubic-bezier(0.12, 0.78, 0.15, 1)' : 'linear'}`,
                      }}
                      className="absolute inset-7 rounded-full border border-slate-600 bg-slate-900 overflow-hidden will-change-transform"
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
                        <circle cx="150" cy="150" r="100" fill="url(#innerTrackWheelInline)" stroke="#334155" strokeWidth="2" />
                        <circle cx="150" cy="150" r="64" fill="url(#hubGradWheelInline)" stroke="#64748b" strokeWidth="2" />
                        <defs>
                          <linearGradient id="innerTrackWheelInline" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#334155" />
                            <stop offset="100%" stopColor="#020617" />
                          </linearGradient>
                          <linearGradient id="hubGradWheelInline" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#cbd5e1" />
                            <stop offset="100%" stopColor="#64748b" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                  ) : (
                    <div className="absolute inset-7 rounded-full border border-slate-600 bg-slate-900" />
                  )}
                  <div className="absolute left-1/2 top-[9px] -translate-x-1/2 text-[16px] text-slate-100 font-bold tracking-wider">▼</div>
                  <div className="absolute left-1/2 top-[30px] -translate-x-1/2 h-4 w-4 rounded-full bg-white border border-slate-300 shadow-[0_0_14px_rgba(255,255,255,0.6)]" />
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/40 bg-slate-950/80 px-4 py-2 text-center shadow-[0_0_18px_rgba(34,211,238,0.35)] backdrop-blur-sm">
                    <p className="text-[10px] uppercase tracking-wide text-slate-400">Winner</p>
                    <p className="text-xl font-black text-cyan-300">{winningNumber ?? '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
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

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm">
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

      <div className="border-t border-white/10 bg-slate-950/70 p-3 shrink-0 lg:p-4">
        <div className="mt-4 flex w-full flex-col items-center gap-3 md:flex-row md:items-end">
        <div className="w-full md:max-w-xs">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Chip Value</label>
          <input
            type="number"
            min={1}
            value={chipValue}
            onChange={(event) => setChipValue(Math.max(0, parseInt(event.target.value, 10) || 0))}
            disabled={isSpinning}
            className="w-full rounded-lg border border-white/10 bg-slate-900/70 p-3 font-mono text-white outline-none focus:border-cyan-300/60"
          />
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              onClick={() => setChipValue((value) => Math.max(1, Math.floor(value / 2) || 1))}
              disabled={isSpinning}
              className="h-9 rounded-md border border-white/10 bg-white/[0.04] text-xs font-bold text-slate-300 transition-all hover:bg-white/[0.08] disabled:opacity-40"
            >
              1/2
            </button>
            <button
              onClick={() => setChipValue(Math.max(0, Math.floor(parseFloat(balance))))}
              disabled={isSpinning}
              className="h-9 rounded-md border border-white/10 bg-white/[0.04] text-xs font-bold text-slate-300 transition-all hover:bg-white/[0.08] disabled:opacity-40"
            >
              MAX
            </button>
          </div>
          <p className="text-xs mt-2 text-slate-500">Total on table: {totalOnTable.toFixed(0)}</p>
          {errorText ? <p className="text-red-500 text-xs mt-2 font-medium">{errorText}</p> : null}
        </div>

        <div className="flex w-full flex-col gap-3 md:flex-1 md:flex-row">
          <button
            onClick={clearBets}
              disabled={(isSpinning && pendingStake === 0 && lockedStake > 0) || isSpinPending || activeBets.length === 0}
            className={`h-11 w-full rounded-lg border font-bold text-sm uppercase transition-all md:w-40 ${
              (isSpinning && pendingStake === 0 && lockedStake > 0) || isSpinPending || activeBets.length === 0
                ? 'border-white/10 bg-white/[0.04] text-slate-500 cursor-not-allowed'
                : 'border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]'
            }`}
          >
            Clear
          </button>
          <button
            onClick={spin}
            disabled={isSpinning || isSpinPending || activeBets.length === 0 || totalOnTable <= 0}
            className={`flex-1 h-11 rounded-lg border font-bold text-sm uppercase transition-all ${
              isSpinning || isSpinPending || activeBets.length === 0 || totalOnTable <= 0
                ? 'border-cyan-400/15 bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'border-cyan-300/50 bg-gradient-to-r from-cyan-500/80 to-blue-500/80 text-white shadow-[0_0_20px_rgba(34,211,238,0.35)] hover:shadow-[0_0_30px_rgba(34,211,238,0.5)]'
            }`}
          >
            {isSpinPending ? 'Starting...' : isSpinning ? 'Spinning...' : 'Spin'}
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

const ChipTag = memo(function ChipTag({ amount }: { amount: number }) {
  const layerCount = Math.min(4, Math.max(1, Math.floor(amount / 100)));
  return (
    <span
      className="absolute top-0 right-0 h-5 min-w-5 px-1 rounded-full bg-blue-600 text-[10px] leading-5 font-bold text-white transform-gpu will-change-transform"
      style={{ transform: 'translate3d(50%, -50%, 0)' }}
    >
      {Array.from({ length: layerCount }).map((_, index) => (
        <span
          key={index}
          className="absolute inset-0 rounded-full border border-white/40"
          style={{
            transform: `translate3d(${index * 1}px, ${index * -1}px, 0)`,
            background:
              'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.95), rgba(56,189,248,0.85) 20%, rgba(37,99,235,0.85) 55%, rgba(15,23,42,0.95) 100%)',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25), 0 2px 6px rgba(2,6,23,0.45)',
          }}
        />
      ))}
      <span className="relative z-10">{Math.round(amount)}</span>
    </span>
  );
});
