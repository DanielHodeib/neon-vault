'use client';

import { Skull, Gem } from 'lucide-react';
import { useCallback, useState } from 'react';

import { TOWER_DOORS, TOWER_FLOORS, TOWER_RISK_LABEL, towerMultiplier, type TowerRisk } from '@/lib/arcade';
import { coins } from '@/lib/format';
import { useT } from '@/components/I18n';
import { useJoin, useLive } from '../SocketProvider';
import { BetInput } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';

type Round = { bet: number; risk: TowerRisk; floor: number; picks: number[]; multiplier: number; next: number };
type Pick = { trap: boolean; door?: number; done?: boolean; round?: Round; traps?: number[]; multiplier?: number; payout?: number };
type Outcome = { win: boolean; payout: number; multiplier: number };

/** Tower: pick one door per floor; one hides a trap. Climb as high as you dare, cash out any time. */
export function Tower() {
  const t = useT();
  const { call, balance } = useLive();
  const [amount, setAmount] = useState(100);
  const [risk, setRisk] = useState<TowerRisk>('medium');
  const [round, setRound] = useState<Round | null>(null);
  const [picks, setPicks] = useState<number[]>([]);
  const [traps, setTraps] = useState<number[] | null>(null);
  const [hit, setHit] = useState<{ floor: number; door: number } | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);

  const restore = useCallback((r: { round: Round | null }) => {
    if (!r.round) return;
    setRound(r.round);
    setRisk(r.round.risk);
    setPicks(r.round.picks);
    setTraps(null);
    setHit(null);
    setOutcome(null);
  }, []);
  useJoin('tower:state', restore);

  const run = async <T,>(event: string, data?: unknown) => {
    setBusy(true);
    const res = await call<T>(event, data);
    setBusy(false);
    return res;
  };

  const start = async () => {
    setPicks([]);
    setTraps(null);
    setHit(null);
    setOutcome(null);
    const res = await run<{ round: Round }>('tower:start', { amount, risk });
    if (res) restore(res);
  };

  const pick = async (door: number) => {
    if (!round || busy) return;
    const floor = round.floor;
    const res = await run<Pick>('tower:pick', { door });
    if (!res) return;
    if (res.trap) {
      setRound(null);
      setHit({ floor, door });
      setTraps(res.traps ?? null);
      setOutcome({ win: false, payout: 0, multiplier: 0 });
      sound.bomb();
      return;
    }
    setPicks((p) => [...p, door]);
    if (res.done) {
      setRound(null);
      setTraps(res.traps ?? null);
      setOutcome({ win: true, payout: res.payout ?? 0, multiplier: res.multiplier ?? 0 });
      sound.big();
    } else {
      setRound(res.round ?? null);
      sound.gem();
    }
  };

  const cashout = async () => {
    const res = await run<{ multiplier: number; payout: number; traps: number[] }>('tower:cashout');
    if (!res) return;
    setRound(null);
    setTraps(res.traps);
    setOutcome({ win: true, payout: res.payout, multiplier: res.multiplier });
    sound.win(res.multiplier >= 5 ? 2 : 1);
  };

  const shownRisk = round?.risk ?? risk;
  const doors = TOWER_DOORS[shownRisk];
  const floorNow = round?.floor ?? picks.length;

  const stage = (
    <div className="panel p-3 sm:p-6">
      {/* top floor first, so the player climbs upwards */}
      <div className="mx-auto flex max-w-md flex-col-reverse gap-1.5">
        {Array.from({ length: TOWER_FLOORS }, (_, f) => {
          const current = !!round && f === round.floor;
          const passed = f < picks.length;
          return (
            <div key={f} className={`flex items-center gap-2 rounded-xl p-1.5 transition ${current ? 'bg-accent/10 ring-1 ring-accent/50' : ''}`}>
              <span className={`num w-14 shrink-0 text-right text-xs ${current ? 'text-accent' : passed ? 'text-win' : 'text-faint'}`}>{towerMultiplier(shownRisk, f + 1)}×</span>
              <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${doors}, minmax(0, 1fr))` }}>
                {Array.from({ length: doors }, (_, d) => {
                  const chosen = picks[f] === d;
                  const trap = traps?.[f] === d;
                  const boom = hit?.floor === f && hit.door === d;
                  return (
                    <button
                      key={d}
                      disabled={!current || busy}
                      onClick={() => pick(d)}
                      aria-label={t('Stockwerk {f}, Tür {d}', { f: f + 1, d: d + 1 })}
                      className={`grid h-10 place-items-center rounded-lg border transition sm:h-11 ${
                        boom
                          ? 'border-loss bg-loss/30'
                          : chosen
                            ? 'border-win/60 bg-win/15'
                            : trap
                              ? 'border-loss/40 bg-loss/10'
                              : current
                                ? 'border-line-strong bg-raised hover:-translate-y-0.5 hover:border-accent active:scale-95'
                                : 'border-line bg-raised/40'
                      }`}
                    >
                      {chosen && <Gem size={16} className="text-win" />}
                      {(boom || (trap && !chosen)) && <Skull size={16} className="text-loss" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 min-h-7 text-center text-lg font-semibold">
        {outcome ? (
          outcome.win ? (
            <span className="text-win">
              +<span className="num">{coins(outcome.payout)}</span> NVC · {outcome.multiplier}×
            </span>
          ) : (
            <span className="text-loss">{t('In die Falle getappt')}</span>
          )
        ) : (
          round && (
            <span className="text-muted">
              {t('Stockwerk {n} von {max}', { n: floorNow + 1, max: TOWER_FLOORS })} · <span className="num text-fg">{round.next}×</span>
            </span>
          )
        )}
      </p>
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div>
        <label className="label">{t('Risiko')}</label>
        <div className="flex gap-2">
          {(Object.keys(TOWER_DOORS) as TowerRisk[]).map((r) => (
            <button key={r} className={shownRisk === r ? 'chip-active' : 'chip'} disabled={!!round} onClick={() => setRisk(r)}>
              {t(TOWER_RISK_LABEL[r])}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-faint">{t('{n} Türen pro Stockwerk, eine davon ist eine Falle.', { n: TOWER_DOORS[shownRisk] })}</p>
      </div>
      {round ? (
        <button className="btn-primary h-12 w-full text-base" onClick={cashout} disabled={busy || !round.floor}>
          {t('Auszahlen')} · <span className="num">{round.multiplier}× = {coins(Math.floor(round.bet * round.multiplier))}</span>
        </button>
      ) : (
        <button className="btn-primary h-12 w-full text-base" disabled={busy} onClick={start}>
          Start
        </button>
      )}
      <p className="text-xs text-faint">{t('Ganz oben: {x}×. 3 % Hausvorteil.', { x: towerMultiplier(shownRisk, TOWER_FLOORS) })}</p>
    </div>
  );

  return <GameFrame title="Tower" subtitle={t('Kletter hoch, aber tritt nicht in die Falle.')} stage={stage} controls={controls} />;
}
