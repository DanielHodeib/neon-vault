'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { io, type Socket } from 'socket.io-client';

import type { ChatMessage, GlobalEvent } from '@/lib/hub';

type Online = { id: string; username: string; activity: string };
type Ctx = {
  socket: Socket | null;
  me: { id: string; username: string; soundEnabled: boolean };
  balance: number;
  online: Online[];
  chat: ChatMessage[];
  event: GlobalEvent | null;
  rain: { amount: number; endsAt: number; players: number; by: string } | null;
  call: <T = Record<string, unknown>>(event: string, data?: unknown) => Promise<T | null>;
};

const SocketContext = createContext<Ctx | null>(null);

export const useLive = () => {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useLive outside SocketProvider');
  return ctx;
};

/** Subscribes to a socket event for the lifetime of the component. */
export function useSocketEvent<T>(event: string, fn: (data: T) => void) {
  const { socket } = useLive();
  useEffect(() => {
    if (!socket) return;
    socket.on(event, fn);
    return () => void socket.off(event, fn);
  }, [socket, event, fn]);
}

function beep() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.connect(ctx.destination);
  osc.frequency.value = 880;
  osc.start();
  osc.stop(ctx.currentTime + 0.12);
}

/** Calls a join event now and after every reconnect (rooms are lost on reconnect). */
export function useJoin<T>(event: string, onResult: (r: T) => void) {
  const { socket, call } = useLive();
  useEffect(() => {
    if (!socket) return;
    const join = () => void call<T>(event).then((r) => r && onResult(r));
    if (socket.connected) join();
    socket.on('connect', join);
    return () => void socket.off('connect', join);
  }, [socket, call, event, onResult]);
}

const ACTIVITY: Record<string, string> = { crash: 'Crash', slots: 'Slots', blackjack: 'Blackjack', roulette: 'Roulette', poker: 'Poker', coinflip: 'Coinflip' };

export function SocketProvider({ me, initialBalance, children }: { me: Ctx['me']; initialBalance: number; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [socket] = useState(() => (typeof window === 'undefined' ? null : io({ autoConnect: false, transports: ['websocket', 'polling'] })));
  const [balance, setBalance] = useState(initialBalance);
  const [online, setOnline] = useState<Online[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [event, setEvent] = useState<GlobalEvent | null>(null);
  const [rain, setRain] = useState<Ctx['rain']>(null);

  useEffect(() => {
    if (!socket) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket.io listener signature
    const handlers: Record<string, (...args: any[]) => void> = {
      hello: (d: { chat: ChatMessage[]; online: Online[]; event: GlobalEvent | null }) => {
        setChat(d.chat);
        setOnline(d.online);
        setEvent(d.event);
      },
      balance: setBalance,
      online: setOnline,
      chat: (m: ChatMessage) => {
        setChat((c) => [...c.slice(-49), m]);
        if (me.soundEnabled && m.userId !== me.id && m.text.includes(`@${me.username}`)) beep();
      },
      event: setEvent,
      rain: setRain,
      toast: (msg: string) => toast(msg),
      announcement: (a: { message: string; from: string }) => toast(`${a.from}: ${a.message}`, { duration: 10_000 }),
      notification: (n: { title: string; message: string }) => {
        toast(`${n.title}: ${n.message}`);
        router.refresh();
      },
      tickets: () => router.refresh(),
      maintenance: () => router.refresh(),
      connect_error: (err: Error) => err.message === 'unauthorized' && router.replace('/login'),
      disconnect: (reason: string) => reason === 'io server disconnect' && router.refresh(),
    };
    for (const [name, fn] of Object.entries(handlers)) socket.on(name, fn);
    socket.connect();
    return () => {
      for (const [name, fn] of Object.entries(handlers)) socket.off(name, fn);
      socket.disconnect();
    };
  }, [socket, me.id, me.username, me.soundEnabled, router]);

  useEffect(() => {
    const game = pathname.split('/')[2];
    socket?.emit('presence', { activity: pathname.startsWith('/play/') ? (ACTIVITY[game] ?? 'Spielt') : 'Lobby' });
  }, [socket, pathname]);

  const call = useCallback(
    <T,>(name: string, data?: unknown) =>
      new Promise<T | null>((resolve) => {
        if (!socket) return resolve(null);
        socket.timeout(10_000).emit(name, data ?? {}, (err: Error | null, res: { ok: boolean; error?: string } & T) => {
          if (err) toast.error('Keine Antwort vom Server.');
          else if (!res.ok) toast.error(res.error ?? 'Fehler');
          resolve(err || !res.ok ? null : res);
        });
      }),
    [socket],
  );

  const value = useMemo(() => ({ socket, me, balance, online, chat, event, rain, call }), [socket, me, balance, online, chat, event, rain, call]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
