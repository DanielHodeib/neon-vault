'use client';

import { Gift, Square, Volume2, VolumeX, Zap } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { coins } from '@/lib/format';
import { BIG_WIN, lineCount, MACHINES, topSymbol, type Machine } from '@/lib/slots';
import { useJoin, useLive } from '../SocketProvider';
import { BetInput, Section } from '../ui';
import { GameFrame } from './GameFrame';
import { sound, soundPref } from './sound';

type Cell = [number, number];
type Win = { symbol: string; count: number; cells: Cell[]; amount: number; line?: number; ways?: number };
type Step = { grid: string[][]; wins: Win[]; mult: number; reveal?: Cell[] };
type FreeSpins = { machine: string; spins: number; bet: number; special: string | null } | null;
type Result = {
  steps: Step[];
  multiplier: number;
  features: string[];
  freeWon: number;
  freeSpins: FreeSpins;
  win: number;
  bet: number;
  free: boolean;
  special?: string;
  chaos?: number;
  expand?: { symbol: string; cols: number[]; amount: number };
};
type Phase = 'idle' | 'spinning' | 'showing';

const AUTO = [0, 10, 25, 50, 100];
const STRIP = 10;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const cellKey = ([c, r]: Cell) => `${c}:${r}`;
const startGrid = (m: Machine) =>
  Array.from({ length: m.cols }, (_, c) => Array.from({ length: m.rows }, (_, r) => m.symbols[(c * 2 + r) % m.symbols.length].icon));

function useCountUp(target: number, ms = 900) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / ms);
      setValue(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

export function Slots() {
  const { call, balance } = useLive();
  const [key, setKey] = useState('classic');
  const machine = MACHINES[key];
  const [amount, setAmount] = useState(machine.minBet);
  const [grid, setGrid] = useState(() => startGrid(machine));
  const [strips, setStrips] = useState<string[][]>([]);
  const [stopped, setStopped] = useState(machine.cols);
  const [tease, setTease] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [spinId, setSpinId] = useState(0);
  const [step, setStep] = useState<Step | null>(null);
  const [vanish, setVanish] = useState<Set<string> | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [big, setBig] = useState<{ label: string; amount: number } | null>(null);
  const [expand, setExpand] = useState<Result['expand']>();
  const [free, setFree] = useState<FreeSpins>(null);
  const [auto, setAuto] = useState(0);
  const [autoFree, setAutoFree] = useState(true);
  const [turbo, setTurbo] = useState(false);
  const [session, setSession] = useState({ spins: 0, bet: 0, won: 0, best: 0 });
  const [history, setHistory] = useState<{ id: number; machine: string; win: number; mult: number }[]>([]);
  const muted = useSyncExternalStore(soundPref.subscribe, soundPref.muted, soundPref.server);
  const busy = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  useJoin<{ freeSpins: FreeSpins }>('slots:state', useCallback((r) => setFree(r.freeSpins), []));

  const freeHere = free?.machine === key ? free.spins : 0;
  const scatter = machine.symbols.find((s) => s.scatter)?.icon;

  const choose = (k: string) => {
    if (busy.current) return;
    setKey(k);
    setAmount((a) => Math.max(a, MACHINES[k].minBet));
    setGrid(startGrid(MACHINES[k]));
    setStopped(MACHINES[k].cols);
    setStep(null);
    setResult(null);
    setAuto(0);
  };

  const run = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const m = machine;
    setPhase('spinning');
    setSpinId((n) => n + 1);
    setStep(null);
    setFocus(null);
    setResult(null);
    setBig(null);
    setExpand(undefined);
    setStrips(Array.from({ length: m.cols }, () => Array.from({ length: STRIP }, () => m.symbols[Math.floor(Math.random() * m.symbols.length)].icon)));
    setStopped(0);
    const started = Date.now();
    const res = await call<Result>('slots:spin', { machine: key, amount });
    if (!alive.current) return;
    if (!res) {
      setStopped(m.cols);
      setPhase('idle');
      setAuto(0);
      busy.current = false;
      return;
    }

    // Reels stop left to right; two scatters already showing slow the rest down.
    const first = res.steps[0];
    await sleep(Math.max(0, (turbo ? 250 : m.spinMs * 0.5) - (Date.now() - started)));
    setGrid(first.grid);
    for (let c = 0; c < m.cols; c++) {
      const teasing = !turbo && !!scatter && first.grid.slice(0, c).flat().filter((i) => i === scatter).length >= 2;
      setTease(teasing);
      if (teasing) sound.tease();
      await sleep(c === 0 ? 0 : teasing ? 700 : turbo ? 60 : 190);
      setStopped(c + 1);
      sound.stop();
    }
    setTease(false);
    setPhase('showing');

    // Show each grid (tumbling machines have several), then the expanding symbol.
    for (let i = 0; i < res.steps.length; i++) {
      const st = res.steps[i];
      setGrid(st.grid);
      setStep(st);
      if (st.wins.length) sound.win(Math.min(2, i));
      if (i < res.steps.length - 1) {
        await sleep(turbo ? 450 : 900);
        setVanish(new Set(st.wins.flatMap((w) => w.cells.map(cellKey))));
        await sleep(300);
        setVanish(null);
      }
    }
    if (res.expand) {
      setExpand(res.expand);
      sound.feature();
      await sleep(turbo ? 300 : 700);
    }
    if (!alive.current) return;

    const mult = res.win / res.bet;
    const tier = BIG_WIN.find(([min]) => mult >= min);
    if (tier) {
      setBig({ label: tier[1], amount: res.win });
      sound.big();
    } else if (res.win) sound.win(mult >= 3 ? 2 : mult >= 1 ? 1 : 0);
    if (res.freeWon) sound.feature();
    setResult(res);
    setFree(res.freeSpins);
    setSession((s) => ({ spins: s.spins + 1, bet: s.bet + (res.free ? 0 : res.bet), won: s.won + res.win, best: Math.max(s.best, res.win) }));
    if (res.win) setHistory((h) => [{ id: Date.now(), machine: m.name, win: res.win, mult }, ...h].slice(0, 8));
    setPhase('idle');
    busy.current = false;
  }, [machine, key, amount, turbo, scatter, call]);

  // Autoplay, and free spins play on by themselves until paused.
  useEffect(() => {
    if (phase !== 'idle') return;
    const freeNow = free?.machine === key && free.spins > 0;
    if (!(auto > 0 || (freeNow && autoFree && result))) return;
    const t = setTimeout(() => {
      if (!freeNow) setAuto((a) => a - 1);
      void run();
    }, big ? 3200 : result?.freeWon ? 2200 : turbo ? 350 : 900);
    return () => clearTimeout(t);
  }, [phase, auto, autoFree, free, key, result, big, turbo, run]);

  // Cycle through the winning lines one by one.
  useEffect(() => {
    if (phase !== 'idle' || !step || step.wins.length < 2) return;
    const t = setInterval(() => setFocus((f) => ((f ?? -1) + 1) % step.wins.length), 1500);
    return () => clearInterval(t);
  }, [phase, step]);

  // Space bar spins (outside of inputs).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || (e.target as HTMLElement).closest('input, textarea, button, select')) return;
      e.preventDefault();
      setAutoFree(true);
      void run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run]);

  const spinNow = () => {
    setAutoFree(true);
    void run();
  };
  const stopAuto = () => {
    setAuto(0);
    setAutoFree(false);
  };

  const shownWins = step?.wins ?? [];
  const focused = focus !== null ? shownWins[focus] : null;
  const lit = new Set((focused ? [focused] : shownWins).flatMap((w) => w.cells.map(cellKey)));
  const reveal = new Set(step?.reveal?.map(cellKey));
  const line = focused?.line !== undefined ? machine.lines?.[focused.line] : undefined;
  const autoRunning = auto > 0 || (freeHere > 0 && autoFree && !!result);
  const lineBet = amount / lineCount(machine);
  const shownWin = useCountUp(result?.win ?? 0);

  const cabinet = (
    <div
      className={`relative overflow-hidden rounded-2xl border p-3 sm:p-5 ${freeHere ? 'border-gold/60' : 'border-white/10'}`}
      style={{ background: `radial-gradient(120% 90% at 50% 0%, ${machine.colors[0]}, ${machine.colors[1]} 70%)` }}
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold tracking-tight sm:text-xl">{machine.name}</p>
          <p className="truncate text-xs text-white/60">{machine.tagline}</p>
        </div>
        <p className="shrink-0 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-medium text-white/70">
          {machine.lines ? `${machine.lines.length} Linien` : `${lineCount(machine)} Wege`} · {machine.cols}×{machine.rows}
        </p>
      </div>

      <div className="relative rounded-xl bg-black/45 p-1.5 shadow-[inset_0_2px_12px_rgba(0,0,0,.6)] sm:p-2">
        <div className="relative grid gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${machine.cols}, minmax(0, 1fr))` }}>
          {grid.map((col, c) => {
            const spinning = c >= stopped;
            const expanded = expand && expand.cols.includes(c);
            return (
              <div key={c} className={`relative overflow-hidden rounded-lg bg-black/40 ${spinning && tease ? 'ring-2 ring-gold/70' : ''}`}>
                <div>
                  {col.map((icon, r) => {
                    if (spinning) return <div key={r} className="aspect-square" />;
                    const k = `${c}:${r}`;
                    const win = lit.has(k);
                    return (
                      <div
                        key={`${spinId}-${k}-${icon}`}
                        className={`grid aspect-square place-items-center text-[clamp(1.5rem,7vw,2.75rem)] leading-none transition-opacity ${
                          vanish?.has(k) ? 'slot-pop' : reveal.has(k) ? 'slot-flip' : 'slot-land'
                        } ${lit.size && !win ? 'opacity-30' : ''}`}
                      >
                        <span className={`grid h-[86%] w-[86%] place-items-center rounded-md ${win ? 'slot-win bg-gold/15 ring-2 ring-gold/80' : ''}`}>{icon}</span>
                      </div>
                    );
                  })}
                </div>
                {spinning && strips[c] && (
                  <div className="absolute inset-0 overflow-hidden">
                    <div className="slot-strip absolute inset-x-0 top-0" style={{ height: `${((STRIP * 2) / machine.rows) * 100}%` }}>
                      {[...strips[c], ...strips[c]].map((icon, i) => (
                        <div key={i} className="grid place-items-center text-[clamp(1.5rem,7vw,2.75rem)] opacity-80" style={{ height: `${100 / (STRIP * 2)}%` }}>
                          {icon}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {expanded && expand && (
                  <div className="pop-in absolute inset-0 grid place-items-center rounded-lg bg-gold/20 text-[clamp(2.5rem,12vw,4.5rem)] ring-2 ring-gold">
                    {expand.symbol}
                  </div>
                )}
              </div>
            );
          })}
          {line && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${machine.cols * 100} ${machine.rows * 100}`} preserveAspectRatio="none">
              <polyline
                points={line.map((row, c) => `${c * 100 + 50},${row * 100 + 50}`).join(' ')}
                fill="none"
                stroke="var(--color-gold)"
                strokeWidth="6"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                opacity=".9"
              />
            </svg>
          )}
        </div>

        {big && (
          <button
            type="button"
            onClick={() => setBig(null)}
            className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-black/70 backdrop-blur-sm"
            aria-label="Schließen"
          >
            <BigWin label={big.label} amount={big.amount} />
          </button>
        )}
        {result?.freeWon && !big ? (
          <div className="pop-in pointer-events-none absolute inset-x-0 top-1/2 z-10 mx-auto w-fit -translate-y-1/2 rounded-xl bg-black/80 px-5 py-3 text-center ring-1 ring-gold/60">
            <p className="text-xs font-semibold tracking-wider text-gold uppercase">Free Spins</p>
            <p className="text-2xl font-bold">+{result.freeWon}</p>
            {result.special && <p className="text-xs text-white/70">Sondersymbol {result.special}</p>}
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-3 items-center gap-2 text-center">
        <Meter label="Einsatz" value={coins(freeHere ? free!.bet : amount)} />
        <div>
          <p className="text-[10px] font-semibold tracking-wider text-white/50 uppercase">Gewinn</p>
          <p className={`num text-xl font-bold sm:text-2xl ${result?.win ? 'text-gold' : 'text-white/40'}`}>{coins(shownWin)}</p>
        </div>
        <Meter label="Guthaben" value={coins(balance)} />
      </div>

      <div className="mt-2 flex min-h-7 flex-wrap items-center justify-center gap-1.5 text-xs">
        {focused && (
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-white/80">
            {focused.line !== undefined ? `Linie ${focused.line + 1}` : `${focused.ways} Wege`} · {focused.count}× {focused.symbol} ·{' '}
            <span className="num text-gold">{coins(Math.floor(focused.amount * (result?.bet ?? amount) * (step?.mult ?? 1) * (result?.chaos ?? 1) * (result?.free ? (machine.freeSpins?.mult ?? 1) : 1)))}</span>
          </span>
        )}
        {step && step.mult > 1 && <Badge>Kaskade ×{step.mult}</Badge>}
        {result?.chaos && result.chaos > 1 && <Badge>Chaos ×{result.chaos}</Badge>}
        {result?.features.includes('mystery') && <Badge>Mystery!</Badge>}
        {result?.expand && <Badge>{result.expand.symbol} breitet sich aus · {result.expand.amount}×</Badge>}
        {result?.free && machine.freeSpins?.mult && result.win > 0 && <Badge>Free Spin ×{machine.freeSpins.mult}</Badge>}
        {!focused && phase === 'idle' && result && !result.win && <span className="text-white/40">Kein Gewinn</span>}
      </div>
    </div>
  );

  const stage = (
    <div className="space-y-3">
      <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        {Object.entries(MACHINES).map(([k, m]) => (
          <button
            key={k}
            onClick={() => choose(k)}
            disabled={phase !== 'idle'}
            className={`relative flex w-28 shrink-0 flex-col items-start gap-1 rounded-xl border p-2.5 text-left transition sm:w-32 ${
              k === key ? 'border-accent' : 'border-line opacity-80 hover:opacity-100'
            }`}
            style={{ background: `linear-gradient(160deg, ${m.colors[0]}, ${m.colors[1]})` }}
          >
            <span className="text-2xl leading-none">{topSymbol(m)}</span>
            <span className="w-full truncate text-xs font-semibold">{m.name}</span>
            <span className="text-[10px] text-white/60">ab {coins(m.minBet)}</span>
            {free?.machine === k && free.spins > 0 && (
              <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 rounded-full bg-gold px-1.5 text-[10px] font-bold text-black">
                <Gift className="h-3 w-3" /> {free.spins}
              </span>
            )}
          </button>
        ))}
      </div>
      {cabinet}
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      {freeHere > 0 ? (
        <div className="rounded-lg bg-gold/10 px-3 py-2.5 text-sm text-gold">
          <p className="font-semibold">{freeHere} Free Spins übrig</p>
          <p className="text-xs text-gold/80">
            Einsatz <span className="num">{coins(free!.bet)}</span> NVC{free!.special && ` · Sondersymbol ${free!.special}`}
            {machine.freeSpins?.mult && ` · Gewinne ×${machine.freeSpins.mult}`}
          </p>
        </div>
      ) : (
        <BetInput value={amount} onChange={setAmount} balance={balance} min={machine.minBet} />
      )}

      {autoRunning ? (
        <button className="btn-secondary h-14 w-full text-base" onClick={stopAuto}>
          <Square className="h-4 w-4" /> Stopp{auto > 0 && ` (${auto})`}
        </button>
      ) : (
        <button className="btn-primary h-14 w-full text-base font-semibold" onClick={spinNow} disabled={phase !== 'idle'}>
          {phase !== 'idle' ? 'Dreht …' : freeHere ? `Free Spin (${freeHere})` : 'Drehen'}
        </button>
      )}

      <div>
        <p className="label">Autoplay</p>
        <div className="grid grid-cols-5 gap-1.5">
          {AUTO.map((n) => (
            <button
              key={n}
              className={`h-9 rounded-lg border text-xs font-medium ${auto === n ? 'border-accent bg-accent/10' : 'border-line text-muted hover:text-fg'}`}
              onClick={() => {
                setAuto(n);
                setAutoFree(true);
              }}
            >
              {n || 'Aus'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button className={`btn h-9 border text-xs ${turbo ? 'border-accent bg-accent/10' : 'border-line text-muted'}`} onClick={() => setTurbo((t) => !t)}>
          <Zap className="h-3.5 w-3.5" /> Turbo
        </button>
        <button className={`btn h-9 border text-xs ${muted ? 'border-line text-muted' : 'border-accent bg-accent/10'}`} onClick={soundPref.toggle}>
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />} Ton
        </button>
      </div>
      <p className="hidden text-center text-[11px] text-faint sm:block">Leertaste = Drehen</p>
    </div>
  );

  const extra = (
    <>
      <Section title="Gewinntabelle" action={<span className="text-xs text-muted">bei {coins(amount)} NVC Einsatz</span>} pad>
        <p className="mb-3 text-sm text-muted">{machine.feature}</p>
        <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {[...machine.symbols].reverse().map((s) => (
            <li key={s.icon} className="flex items-center gap-3 text-sm">
              <span className="w-8 text-center text-2xl">{s.icon}</span>
              <span className="min-w-0 flex-1 text-xs text-muted">
                {s.mystery ? 'Mystery – alle werden zum selben Symbol' : s.wild && !s.pays ? 'Wild – ersetzt alle Symbole' : (
                  <>
                    {s.wild && <span className="text-gold">Wild{s.scatter && ' + Scatter'} · </span>}
                    {s.scatter && !s.wild && <span className="text-gold">Scatter · </span>}
                    {Object.entries(s.pays ?? {}).map(([n, p]) => (
                      <span key={n} className="mr-2 whitespace-nowrap">
                        {n}× <span className="num text-fg">{coins(Math.floor(s.scatter ? p * amount : machine.lines ? p * lineBet : (p * amount) / machine.waysDivisor!))}</span>
                      </span>
                    ))}
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
        {!machine.lines && <p className="mt-3 text-xs text-faint">Werte pro Weg. Mehrere gleiche Symbole auf einer Walze multiplizieren die Wege.</p>}
      </Section>
      {session.spins > 0 && (
        <Section title="Diese Sitzung" pad>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Spins" value={String(session.spins)} />
            <Stat label="Eingesetzt" value={coins(session.bet)} />
            <Stat label="Gewonnen" value={coins(session.won)} />
            <Stat label="Bester Treffer" value={coins(session.best)} />
          </dl>
          {history.length > 0 && (
            <ul className="mt-4 divide-y divide-line text-sm">
              {history.map((h) => (
                <li key={h.id} className="flex justify-between py-2">
                  <span className="text-muted">{h.machine}</span>
                  <span>
                    <span className="num text-win">+{coins(h.win)}</span> <span className="text-xs text-faint">{h.mult.toFixed(1)}×</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </>
  );

  return <GameFrame title="Slots" subtitle="Acht Automaten, jeder mit eigenen Regeln." stage={stage} controls={controls} extra={extra} />;
}

function BigWin({ label, amount }: { label: string; amount: number }) {
  const value = useCountUp(amount, 2200);
  return (
    <span className="pop-in block text-center">
      <span className="slot-glow block text-sm font-bold tracking-[0.3em] text-gold uppercase">{label}</span>
      <span className="num mt-1 block text-4xl font-bold text-white sm:text-5xl">{coins(value)}</span>
      <span className="mt-2 block text-xs text-white/50">Tippen zum Schließen</span>
    </span>
  );
}

const Meter = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-semibold tracking-wider text-white/50 uppercase">{label}</p>
    <p className="num truncate text-sm text-white/85">{value}</p>
  </div>
);

const Badge = ({ children }: { children: ReactNode }) => <span className="pop-in rounded-full bg-gold/15 px-2.5 py-1 font-medium text-gold">{children}</span>;

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <dt className="text-xs text-muted">{label}</dt>
    <dd className="num font-medium">{value}</dd>
  </div>
);
