'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { io, type Socket } from 'socket.io-client';

import { GAME_NAMES } from '@/lib/format';
import type { FxName } from '@/lib/fx';
import type { ChatMessage, Countdown, GlobalEvent } from '@/lib/hub';
import { runFx } from './fx';

type Online = { id: string; username: string; activity: string };
type Ctx = {
  socket: Socket | null;
  me: { id: string; username: string; soundEnabled: boolean };
  balance: number;
  online: Online[];
  chat: ChatMessage[];
  event: GlobalEvent | null;
  countdown: Countdown | null;
  rain: { amount: number; endsAt: number; players: number; by: string } | null;
  call: <T = Record<string, unknown>>(event: string, data?: unknown) => Promise<T | null>;
  /** Unread private messages; the messages page resets it. */
  dmUnread: number;
  setDmUnread: (n: number) => void;
  /** Freezes the shown balance until the returned release() runs, so it can't spoil an animation. */
  holdBalance: () => () => void;
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


export function SocketProvider({ me, initialBalance, children }: { me: Ctx['me']; initialBalance: number; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [socket] = useState(() => (typeof window === 'undefined' ? null : io({ autoConnect: false, transports: ['websocket', 'polling'] })));
  const [balance, setBalance] = useState(initialBalance);
  const [online, setOnline] = useState<Online[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [event, setEvent] = useState<GlobalEvent | null>(null);
  const [countdown, setCountdown] = useState<Countdown | null>(null);
  const [rain, setRain] = useState<Ctx['rain']>(null);
  const [dmUnread, setDmUnread] = useState(0);
  const held = useRef(0);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    if (!socket) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- socket.io listener signature
    const handlers: Record<string, (...args: any[]) => void> = {
      hello: (d: { chat: ChatMessage[]; online: Online[]; event: GlobalEvent | null; countdown: Countdown | null }) => {
        setChat(d.chat);
        setOnline(d.online);
        setEvent(d.event);
        setCountdown(d.countdown);
      },
      balance: (b: number) => {
        if (held.current > 0) pending.current = b;
        else setBalance(b);
      },
      online: setOnline,
      chat: (m: ChatMessage) => {
        setChat((c) => [...c.slice(-49), m]);
        if (me.soundEnabled && m.userId !== me.id && m.text.includes(`@${me.username}`)) beep();
      },
      event: setEvent,
      countdown: setCountdown,
      fx: (d: { effect: FxName; by: string }) => runFx(d.effect, d.by),
      chatClear: () => setChat([]),
      rain: setRain,
      dm: (m: { from: string; text: string }) => {
        if (m.from === me.username || window.location.pathname.startsWith('/messages')) return;
        setDmUnread((n) => n + 1);
        toast(`✉️ ${m.from}: ${m.text.length > 60 ? `${m.text.slice(0, 60)}…` : m.text}`, { duration: 6000 });
      },
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
    // Unread private messages, fetched again after every reconnect.
    const loadUnread = () => socket.emit('dm:unread', {}, (r: { ok: boolean; unread?: number }) => r.ok && setDmUnread(r.unread ?? 0));
    socket.on('connect', loadUnread);
    socket.connect();
    return () => {
      for (const [name, fn] of Object.entries(handlers)) socket.off(name, fn);
      socket.off('connect', loadUnread);
      socket.disconnect();
    };
  }, [socket, me.id, me.username, me.soundEnabled, router]);

  useEffect(() => {
    const game = pathname.split('/')[2];
    socket?.emit('presence', { activity: pathname.startsWith('/play/') ? (GAME_NAMES[game] ?? 'Spielt') : 'Lobby' });
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

  const holdBalance = useCallback(() => {
    held.current++;
    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      if (--held.current === 0 && pending.current !== null) {
        setBalance(pending.current);
        pending.current = null;
      }
    };
    setTimeout(release, 15_000); // never freeze for good, e.g. if the game unmounts mid-animation
    return release;
  }, []);

  const value = useMemo(
    () => ({ socket, me, balance, online, chat, event, countdown, rain, call, holdBalance, dmUnread, setDmUnread }),
    [socket, me, balance, online, chat, event, countdown, rain, call, holdBalance, dmUnread],
  );
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}
