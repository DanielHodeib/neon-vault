'use client';

import { ArrowDown, ArrowUp, Shuffle } from 'lucide-react';
import { useCallback, useState } from 'react';

import { coins } from '@/lib/format';
import { HILO_SKIPS, hiloChance, hiloStep, type HiloGuess } from '@/lib/solo';
import { useJoin, useLive } from '../SocketProvider';
import { BetInput } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';
import { PlayingCard } from './TableLobby';

type Round = { bet: number; card: string; multiplier: number; steps: number; skips: number; history: string[] };
type Outcome = { win: boolean; payout: number; multiplier: number; card?: string };

const value = (card: string) => '23456789TJQKA'.indexOf(card[0]) + 2;
const pct = (p: number) => `${(p * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;

export function HiLo() {
  const { call, balance } = useLive();
  const [amount, setAmount] = useState(100);
  const [round, setRound] = useState<Round | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const restore = useCallback((r: { round: Round | null }) => {
    if (!r.round) return;
    setRound(r.round);
    setHistory(r.round.history);
    setOutcome(null);
  }, []);
  useJoin('hilo:state', restore);

  const run = async <T,>(event: string, data?: unknown) => {
    setBusy(true);
    const res = await call<T>(event, data);
    setBusy(false);
    return res;
  };

  const start = async () => {
    setOutcome(null);
    const res = await run<{ round: Round }>('hilo:start', { amount });
    if (!res) return;
    restore(res);
    sound.card();
  };

  const guess = async (g: HiloGuess) => {
    const res = await run<{ win: boolean; card: string; round: Round | null }>('hilo:guess', { guess: g });
    if (!res) return;
    sound.card();
    setHistory((h) => [...h, res.card].slice(-12));
    if (res.win && res.round) {
      setRound(res.round);
      sound.gem();
    } else {
      setOutcome({ win: false, payout: 0, multiplier: 0, card: res.card });
      setRound(null);
      sound.lose();
    }
  };

  const skip = async () => {
    const res = await run<{ round: Round }>('hilo:skip');
    if (!res) return;
    setRound(res.round);
    setHistory(res.round.history);
    sound.card();
  };

  const cashout = async () => {
    const res = await run<{ payout: number; multiplier: number }>('hilo:cashout');
    if (!res) return;
    setOutcome({ win: true, ...res });
    setRound(null);
    sound.win(res.multiplier >= 3 ? 2 : 1);
  };

  const card = round?.card ?? outcome?.card ?? history.at(-1);
  const v = card ? value(card) : 8;
  const options = (['higher', 'lower'] as const).map((g) => {
    const p = hiloChance(v, g);
    return { g, p, step: hiloStep(p) };
  });

  const stage = (
    <div className="panel overflow-hidden">
      <div className="grid place-items-center bg-[radial-gradient(70%_60%_at_50%_35%,rgba(61,220,151,.08),transparent)] px-4 py-10 sm:py-14">
        <div key={card ?? 'none'} className="pop-in origin-center scale-[1.9] sm:scale-[2.2]">
          <PlayingCard card={card ?? '??'} />
        </div>
        <div className="mt-14 min-h-14 text-center sm:mt-16">
          {outcome ? (
            outcome.win ? (
              <p className="pop-in text-2xl font-bold text-win">
                +<span className="num">{coins(outcome.payout)}</span> NVC · {outcome.multiplier}×
              </p>
            ) : (
              <p className="pop-in text-2xl font-bold text-loss">Daneben!</p>
            )
          ) : round ? (
            <>
              <p className="num text-3xl font-bold">{round.multiplier}×</p>
              <p className="text-sm text-muted">
                {round.steps} richtig · aktuell <span className="num text-fg">{coins(Math.floor(round.bet * round.multiplier))}</span> NVC
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Höher oder tiefer? Gleich zählt immer für dich.</p>
          )}
        </div>
      </div>
      {history.length > 1 && (
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto border-t border-line px-4 py-3">
          {history.map((c, i) => (
            <span key={i} className={`num shrink-0 rounded-md bg-raised px-2 py-1 text-xs ${c[1] === 'H' || c[1] === 'D' ? 'text-loss' : 'text-fg'}`}>
              {c[0] === 'T' ? '10' : c[0]}
              {{ S: '♠', H: '♥', D: '♦', C: '♣' }[c[1]]}
            </span>
          ))}
        </div>
      )}
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      {round ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            {options.map(({ g, p, step }) => (
              <button key={g} className="btn-secondary h-auto flex-col gap-0.5 py-3" disabled={busy || p >= 1} onClick={() => guess(g)}>
                <span className="flex items-center gap-1.5 font-semibold">
                  {g === 'higher' ? <ArrowUp size={16} /> : <ArrowDown size={16} />} {g === 'higher' ? 'Höher' : 'Tiefer'}
                </span>
                <span className="text-[11px] text-muted">{p >= 1 ? 'sicher' : `${pct(p)} · ${step}×`}</span>
              </button>
            ))}
          </div>
          <button className="btn-ghost h-9 w-full border border-line text-xs" disabled={busy || round.skips >= HILO_SKIPS} onClick={skip}>
            <Shuffle size={14} /> Karte tauschen ({HILO_SKIPS - round.skips} übrig)
          </button>
          <button className="btn-primary h-12 w-full text-base" disabled={busy || !round.steps} onClick={cashout}>
            Auszahlen · <span className="num">{coins(Math.floor(round.bet * round.multiplier))}</span>
          </button>
        </>
      ) : (
        <>
          <BetInput value={amount} onChange={setAmount} balance={balance} />
          <button className="btn-primary h-12 w-full text-base" disabled={busy} onClick={start}>
            Start
          </button>
        </>
      )}
      <p className="text-xs text-faint">Jeder Treffer multipliziert deinen Gewinn. Gleiche Karte zählt als Treffer. 2 % Hausvorteil, max. 5.000×.</p>
    </div>
  );

  return <GameFrame title="Hi-Lo" subtitle="Nächste Karte höher oder tiefer?" stage={stage} controls={controls} />;
}
