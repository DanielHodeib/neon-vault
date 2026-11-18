'use client';

import { coins, gameName } from '@/lib/format';
import { useLang, useT } from '../I18n';

const signed = (n: number) => `${n > 0 ? '+' : ''}${coins(n)}`;
const hue = (i: number) => `hsl(${(i * 47 + 150) % 360} 70% 62%)`;

export type GameRow = { game: string; rounds: number; staked: number; net: number };

/** Running total of the last 30 days as a line; green above zero, red below. */
export function BalanceCurve({ curve }: { curve: { day: string; net: number; total: number }[] }) {
  const t = useT();
  const lang = useLang();
  const W = 600;
  const H = 150;
  const min = Math.min(0, ...curve.map((d) => d.total));
  const max = Math.max(0, ...curve.map((d) => d.total));
  const span = max - min || 1;
  const x = (i: number) => (i / (curve.length - 1)) * W;
  const y = (v: number) => 8 + (1 - (v - min) / span) * (H - 16);
  const line = curve.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.total).toFixed(1)}`).join(' ');
  const last = curve[curve.length - 1]?.total ?? 0;
  const color = last >= 0 ? 'var(--color-win)' : 'var(--color-loss)';
  const date = (day: string) => new Date(day).toLocaleDateString(lang === 'en' ? 'en-GB' : 'de-DE', { day: 'numeric', month: 'short' });
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs text-muted">{t('Gewinn/Verlust in 30 Tagen')}</span>
        <span className={`num text-lg font-semibold ${last >= 0 ? 'text-win' : 'text-loss'}`}>{signed(last)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-40 w-full overflow-visible" role="img" aria-label={t('Verlauf deines Gewinns')}>
        <defs>
          <linearGradient id="curve-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-line-strong)" strokeDasharray="4 4" />
        <path d={`${line} L${W} ${y(0).toFixed(1)} L0 ${y(0).toFixed(1)} Z`} fill="url(#curve-fill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="draw-line" />
        {curve.map((d, i) => (
          <g key={d.day}>
            <rect x={x(i) - W / curve.length / 2} y="0" width={W / curve.length} height={H} fill="transparent">
              <title>{`${date(d.day)}: ${signed(d.net)} · ${t('gesamt')} ${signed(d.total)}`}</title>
            </rect>
            {d.net !== 0 && <circle cx={x(i)} cy={y(d.total)} r="2.6" fill={color} className="pointer-events-none" />}
          </g>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[11px] text-faint">
        <span>{date(curve[0].day)}</span>
        <span>{t('heute')}</span>
      </div>
    </div>
  );
}

/** Where the stakes go: share of the total staked per game. */
export function GameDonut({ rows }: { rows: GameRow[] }) {
  const t = useT();
  const total = rows.reduce((s, r) => s + r.staked, 0) || 1;
  const top = rows.slice(0, 7);
  const rest = rows.slice(7).reduce((s, r) => s + r.staked, 0);
  const parts = [...top.map((r) => ({ label: gameName(r.game), value: r.staked })), ...(rest ? [{ label: 'Andere', value: rest }] : [])];
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg viewBox="0 0 42 42" className="h-40 w-40 -rotate-90 shrink-0" role="img" aria-label={t('Einsatz pro Spiel')}>
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--color-raised)" strokeWidth="6" />
        {parts.map((p, i) => {
          const pct = (p.value / total) * 100;
          const el = (
            <circle key={p.label} cx="21" cy="21" r="15.9155" fill="none" stroke={hue(i)} strokeWidth="6" pathLength={100} strokeDasharray={`${Math.max(pct - 0.6, 0.1)} ${100 - Math.max(pct - 0.6, 0.1)}`} strokeDashoffset={-offset} className="donut-seg" style={{ animationDelay: `${i * 70}ms` }}>
              <title>{`${t(p.label)}: ${coins(p.value)} (${pct.toFixed(0)} %)`}</title>
            </circle>
          );
          offset += pct;
          return el;
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {parts.map((p, i) => (
          <li key={p.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: hue(i) }} />
            <span className="min-w-0 flex-1 truncate">{t(p.label)}</span>
            <span className="num text-xs text-muted">{((p.value / total) * 100).toFixed(0)} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Net result per game: losses grow to the left, wins to the right of the centre line. */
export function NetBars({ rows }: { rows: GameRow[] }) {
  const t = useT();
  const peak = Math.max(1, ...rows.map((r) => Math.abs(r.net)));
  return (
    <ul className="stagger space-y-2">
      {rows.map((r) => (
        <li key={r.game} className="grid grid-cols-[7rem_1fr_6rem] items-center gap-3 text-sm sm:grid-cols-[9rem_1fr_7rem]">
          <span className="truncate">{t(gameName(r.game))}</span>
          <span className="relative flex h-3 items-center">
            <span className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
            <span className="flex h-full w-1/2 justify-end">
              {r.net < 0 && <span className="grow-x grow-x-r h-full rounded-l bg-loss/80" style={{ width: `${(-r.net / peak) * 100}%` }} />}
            </span>
            <span className="flex h-full w-1/2">{r.net > 0 && <span className="grow-x h-full rounded-r bg-win/80" style={{ width: `${(r.net / peak) * 100}%` }} />}</span>
          </span>
          <span className={`num text-right ${r.net >= 0 ? 'text-win' : 'text-loss'}`}>{signed(r.net)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Where the money is lost: each losing game's share of all losses, with the loss per round. */
export function LossRanking({ rows }: { rows: GameRow[] }) {
  const t = useT();
  const losing = rows.filter((r) => r.net < 0).sort((a, b) => a.net - b.net);
  const total = losing.reduce((s, r) => s - r.net, 0) || 1;
  if (!losing.length) return <p className="py-6 text-center text-sm text-faint">{t('Du liegst in keinem Spiel im Minus – stark!')}</p>;
  return (
    <ul className="stagger space-y-3">
      {losing.slice(0, 6).map((r) => {
        const share = (-r.net / total) * 100;
        return (
          <li key={r.game}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{t(gameName(r.game))}</span>
              <span className="num text-loss">{signed(r.net)}</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-raised">
              <div className="grow-x h-full rounded-full bg-gradient-to-r from-loss/50 to-loss" style={{ width: `${share}%` }} />
            </div>
            <p className="mt-0.5 text-[11px] text-faint">
              {t('{p} % deiner Verluste · Ø {n} NVC pro Runde', { p: share.toFixed(0), n: coins(Math.round(-r.net / Math.max(1, r.rounds))) })}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const SLOTS = ['0–6 Uhr', '6–12 Uhr', '12–18 Uhr', '18–24 Uhr'];

/** Weekday × time of day: green = you won, red = you lost, stronger = more. */
export function Heatmap({ heat, rounds }: { heat: number[][]; rounds: number[][] }) {
  const t = useT();
  const peak = Math.max(1, ...heat.flat().map(Math.abs));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[22rem] grid-cols-[3rem_repeat(4,1fr)] gap-1.5 text-xs">
        <span />
        {SLOTS.map((s) => (
          <span key={s} className="text-center text-[11px] text-faint">{t(s)}</span>
        ))}
        {heat.map((row, d) => (
          <div key={d} className="contents">
            <span className="self-center text-muted">{t(DAYS[d])}</span>
            {row.map((v, s) => (
              <span
                key={s}
                title={`${t(DAYS[d])} ${t(SLOTS[s])}: ${signed(v)} · ${t('{n} Runden', { n: rounds[d][s] })}`}
                className="grid h-10 place-items-center rounded-md border border-line/60 num text-[11px] transition hover:scale-105 hover:border-line-strong"
                style={{ background: v === 0 ? 'transparent' : `color-mix(in oklab, ${v > 0 ? 'var(--color-win)' : 'var(--color-loss)'} ${Math.round(12 + (Math.abs(v) / peak) * 60)}%, transparent)` }}
              >
                {rounds[d][s] ? rounds[d][s] : ''}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-faint">{t('Zahl = Runden. Fahr über ein Feld für das Ergebnis.')}</p>
    </div>
  );
}
