'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BIG_WIN, MACHINES, type Machine } from '@/lib/slots';
import { useJoin, useLive } from '../SocketProvider';
import { GameFrame } from './GameFrame';
import { sound, soundPref } from './sound';
import { useT } from '@/components/I18n';
import { useCountUp } from '../useCountUp';
import { SlotsControls } from './SlotsControls';
import { SlotsInfo } from './SlotsInfo';
import { SlotsStage } from './SlotsStage';
import { cellKey, STRIP, type FreeSpins, type Phase, type Result, type Step } from './slotsTypes';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const startGrid = (m: Machine) =>
  Array.from({ length: m.cols }, (_, c) => Array.from({ length: m.rows }, (_, r) => m.symbols[(c * 2 + r) % m.symbols.length].icon));

export function Slots() {
  const t = useT();
  const { call, balance, holdBalance } = useLive();
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
  // Set it to true again on every mount: React can hide a page and show the same instance later (effects re-run, refs stay).
  useEffect(() => {
    alive.current = true;
    return () => void (alive.current = false);
  }, []);

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
    sound.pull();
    const stopRattle = sound.reelLoop();
    const started = Date.now();
    const release = holdBalance(); // the meter shows the new balance once the reels are done
    const res = await call<Result>('slots:spin', { machine: key, amount });
    if (!alive.current || !res) stopRattle();
    if (!alive.current) return release();
    if (!res) {
      setStopped(m.cols);
      setPhase('idle');
      setAuto(0);
      busy.current = false;
      return release();
    }

    // Reels stop left to right; two scatters already showing slow the rest down.
    const first = res.steps[0];
    await sleep(Math.max(0, (turbo ? 250 : m.spinMs * 0.5) - (Date.now() - started)));
    setGrid(first.grid);
    for (let c = 0; c < m.cols; c++) {
      const teasing = !turbo && !!scatter && first.grid.slice(0, c).flat().filter((i) => i === scatter).length >= 2;
      setTease(teasing);
      if (teasing) sound.drumroll(0.7);
      await sleep(c === 0 ? 0 : teasing ? 700 : turbo ? 60 : 190);
      setStopped(c + 1);
      sound.reelStop(c);
    }
    stopRattle();
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
        sound.pop();
        await sleep(300);
        setVanish(null);
      }
    }
    if (res.expand) {
      setExpand(res.expand);
      sound.feature();
      await sleep(turbo ? 300 : 700);
    }
    if (!alive.current) return release();

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
    release();
  }, [machine, key, amount, turbo, scatter, call, holdBalance]);

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
  // A single win is always "focused", so its line and label show without cycling.
  const focused = focus !== null ? shownWins[focus] : shownWins.length === 1 ? shownWins[0] : null;
  const lit = new Set((focused ? [focused] : shownWins).flatMap((w) => w.cells.map(cellKey)));
  const reveal = new Set(step?.reveal?.map(cellKey));
  // Paylines to draw: the focused one, or every winning one before cycling starts.
  const drawn = machine.lines ? (focused ? [focused] : shownWins).filter((w) => w.line !== undefined) : [];
  const autoRunning = auto > 0 || (freeHere > 0 && autoFree && !!result);
  const shownWin = useCountUp(result?.win ?? 0);

  const stage = (
    <SlotsStage
      machine={machine}
      machineKey={key}
      phase={phase}
      choose={choose}
      free={free}
      freeHere={freeHere}
      amount={amount}
      balance={balance}
      grid={grid}
      strips={strips}
      stopped={stopped}
      tease={tease}
      spinId={spinId}
      expand={expand}
      lit={lit}
      reveal={reveal}
      vanish={vanish}
      drawn={drawn}
      focused={focused}
      step={step}
      result={result}
      big={big}
      closeBig={() => setBig(null)}
      shownWin={shownWin}
    />
  );

  const controls = (
    <SlotsControls
      machine={machine}
      phase={phase}
      free={free}
      freeHere={freeHere}
      amount={amount}
      setAmount={setAmount}
      balance={balance}
      autoRunning={autoRunning}
      auto={auto}
      setAuto={setAuto}
      setAutoFree={setAutoFree}
      stopAuto={stopAuto}
      spinNow={spinNow}
      turbo={turbo}
      toggleTurbo={() => setTurbo((on) => !on)}
      muted={muted}
    />
  );

  const extra = <SlotsInfo machine={machine} amount={amount} session={session} history={history} />;

  return <GameFrame title="Slots" subtitle={t('Acht Automaten, jeder mit eigenen Regeln.')} stage={stage} controls={controls} extra={extra} />;
}
