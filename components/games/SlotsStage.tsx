'use client';

import { Gift } from 'lucide-react';

import { useT } from '@/components/I18n';
import { coins } from '@/lib/format';
import { lineCount, MACHINES, SLOT_MAX_WIN, topSymbol, type Machine } from '@/lib/slots';
import { BigWin, Badge, Meter, Odd, pct } from './SlotsParts';
import { LINE_COLORS, STRIP, type FreeSpins, type Phase, type Result, type Step, type Win } from './slotsTypes';

type Props = {
  machine: Machine;
  machineKey: string;
  phase: Phase;
  choose: (key: string) => void;
  free: FreeSpins;
  freeHere: number;
  amount: number;
  balance: number;
  grid: string[][];
  strips: string[][];
  stopped: number;
  tease: boolean;
  spinId: number;
  expand: Result['expand'];
  lit: Set<string>;
  reveal: Set<string>;
  vanish: Set<string> | null;
  drawn: Win[];
  focused: Win | null;
  step: Step | null;
  result: Result | null;
  big: { label: string; amount: number } | null;
  closeBig: () => void;
  shownWin: number;
};

/** Machine picker, the cabinet with the reels, and the odds of the chosen machine. */
export function SlotsStage({ machine, machineKey, phase, choose, free, freeHere, amount, balance, grid, strips, stopped, tease, spinId, expand, lit, reveal, vanish, drawn, focused, step, result, big, closeBig, shownWin }: Props) {
  const t = useT();
  const cabinet = (
    <div
      className={`relative overflow-hidden rounded-2xl border p-3 sm:p-5 ${freeHere ? 'border-gold/60' : 'border-white/10'}`}
      style={{ background: `radial-gradient(120% 90% at 50% 0%, ${machine.colors[0]}, ${machine.colors[1]} 70%)` }}
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold tracking-tight sm:text-xl">{t(machine.name)}</p>
          <p className="truncate text-xs text-white/60">{t(machine.tagline)}</p>
        </div>
        <p className="shrink-0 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-medium text-white/70">
          {machine.lines ? t('{n} Linien', { n: machine.lines.length }) : t('{n} Wege', { n: lineCount(machine) })} · {machine.cols}×{machine.rows}
        </p>
      </div>

      {/* Reels keep a fixed size per reel so a 3×3 machine does not fill a wide screen. */}
      <div className="relative mx-auto rounded-xl bg-black/45 p-1.5 shadow-[inset_0_2px_12px_rgba(0,0,0,.6)] sm:p-2" style={{ maxWidth: `${machine.cols * 6.5}rem` }}>
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
          {drawn.length > 0 && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${machine.cols * 100} ${machine.rows * 100}`} preserveAspectRatio="none">
              {drawn.map((w) => {
                const points = machine.lines![w.line!].map((row, c) => `${c * 100 + 50},${row * 100 + 50}`);
                const color = drawn.length > 1 ? LINE_COLORS[w.line! % LINE_COLORS.length] : 'var(--color-gold)';
                return (
                  <g key={w.line} stroke={color} fill="none" strokeLinejoin="round" strokeLinecap="round">
                    {/* the whole payline, faint; solid only across the symbols that pay */}
                    <polyline points={points.join(' ')} strokeWidth="2" strokeDasharray="3 7" vectorEffect="non-scaling-stroke" opacity=".55" />
                    <polyline points={points.slice(0, w.count).join(' ')} strokeWidth="6" vectorEffect="non-scaling-stroke" opacity=".95" />
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {big && (
          <button
            type="button"
            onClick={closeBig}
            className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-black/70 backdrop-blur-sm"
            aria-label={t('Schließen')}
          >
            <BigWin label={big.label} amount={big.amount} />
          </button>
        )}
        {result?.freeWon && !big ? (
          <div className="pop-in pointer-events-none absolute inset-x-0 top-1/2 z-10 mx-auto w-fit -translate-y-1/2 rounded-xl bg-black/80 px-5 py-3 text-center ring-1 ring-gold/60">
            <p className="text-xs font-semibold tracking-wider text-gold uppercase">{t('Free Spins')}</p>
            <p className="text-2xl font-bold">+{result.freeWon}</p>
            {result.special && <p className="text-xs text-white/70">{t('Sondersymbol')} {result.special}</p>}
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-3 items-center gap-2 text-center">
        <Meter label={t('Einsatz')} value={coins(freeHere ? free!.bet : amount)} />
        <div>
          <p className="text-[10px] font-semibold tracking-wider text-white/50 uppercase">{t('Gewinn')}</p>
          <p className={`num text-xl font-bold sm:text-2xl ${result?.win ? 'text-gold' : 'text-white/40'}`}>{coins(shownWin)}</p>
        </div>
        <Meter label={t('Guthaben')} value={coins(balance)} />
      </div>

      <div className="mt-2 flex min-h-7 flex-wrap items-center justify-center gap-1.5 text-xs">
        {focused && (
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-white/80">
            {focused.line !== undefined ? t('Linie {n}', { n: focused.line + 1 }) : t('{n} Wege', { n: focused.ways! })} · {focused.count}× {focused.symbol} ·{' '}
            <span className="num text-gold">{coins(Math.floor(focused.amount * (result?.bet ?? amount) * (step?.mult ?? 1) * (result?.chaos ?? 1) * (result?.free ? (machine.freeSpins?.mult ?? 1) : 1)))}</span>
          </span>
        )}
        {step && step.mult > 1 && <Badge>{t('Kaskade')} ×{step.mult}</Badge>}
        {result?.chaos && result.chaos > 1 && <Badge>Chaos ×{result.chaos}</Badge>}
        {result?.features.includes('mystery') && <Badge>Mystery!</Badge>}
        {result?.expand && <Badge>{result.expand.symbol} breitet sich aus · {result.expand.amount}×</Badge>}
        {result?.free && machine.freeSpins?.mult && result.win > 0 && <Badge>Free Spin ×{machine.freeSpins.mult}</Badge>}
        {!focused && phase === 'idle' && result && !result.win && <span className="text-white/40">{t('Kein Gewinn')}</span>}
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
              k === machineKey ? 'border-accent' : 'border-line opacity-80 hover:opacity-100'
            }`}
            style={{ background: `linear-gradient(160deg, ${m.colors[0]}, ${m.colors[1]})` }}
          >
            <span className="text-2xl leading-none">{topSymbol(m)}</span>
            <span className="w-full truncate text-xs font-semibold">{t(m.name)}</span>
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
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Odd label={t('Auszahlungsquote')} value={`${pct(machine.odds.rtp)} %`} hint={t('langfristig zurück')} />
        <Odd label={t('Trefferquote')} value={`${pct(machine.odds.hit)} %`} hint={t('etwa jeder {n}. Spin', { n: Math.round(100 / machine.odds.hit) })} />
        <Odd
          label={machine.freeSpins ? t('Free Spins') : 'Feature'}
          value={machine.odds.feature ? `1 : ${machine.odds.feature}` : t(featureShort(machine))}
          hint={machine.odds.feature ? t('Chance pro Spin') : t('bei jedem Spin aktiv')}
        />
        <Odd label={t('Max. Gewinn')} value={`${coins(SLOT_MAX_WIN)}×`} hint={coins(SLOT_MAX_WIN * amount) + ' NVC'} />
      </dl>
    </div>
  );

  return stage;
}

/** Short feature name for machines without a triggered bonus. */
const featureShort = (m: Machine) =>
  m.tumble ? 'Kaskaden' : m.chaos ? 'Chaos-Multiplikator' : m.wildMult ? `Wild ×${m.wildMult}` : m.symbols.some((s) => s.mystery) ? 'Mystery' : m.symbols.some((s) => s.pays?.[2]) ? 'Paare zahlen' : 'Hohe Gewinne';
