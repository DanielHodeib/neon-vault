'use client';

import { Crown, Star } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { coins } from '@/lib/format';
import { COINFLIP_SOLO_PAYOUT } from '@/lib/games';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { BetInput, Empty } from '../ui';
import { GameFrame } from './GameFrame';
import { sound } from './sound';
import { useT } from '@/components/I18n';

type Side = 'heads' | 'tails';
type Mode = 'solo' | 'duel';
type Lobby = { id: string; userId: string; username: string; side: Side; amount: number };
type Result = { lobby: Lobby; opponent: string; result: Side; winner: string; prize: number };
type Flip = { id: number; side: Side; result: Side; win: number; amount: number };

const SIDE: Record<Side, string> = { heads: 'Kopf', tails: 'Zahl' };
const FLIP_MS = 1400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function Coinflip() {
  const t = useT();
  const { call, balance, me, holdBalance } = useLive();
  const [mode, setMode] = useState<Mode>('solo');
  const [lobbies, setLobbies] = useState<Lobby[]>([]);
  const [amount, setAmount] = useState(500);
  const [side, setSide] = useState<Side>('heads');
  const [results, setResults] = useState<Result[]>([]);
  const [flipping, setFlipping] = useState<Flip | null>(null);
  const [last, setLast] = useState<Flip | null>(null);
  const [history, setHistory] = useState<Flip[]>([]);
  const busy = useRef(false);

  useJoin<{ lobbies: Lobby[] }>('coinflip:join', useCallback((r) => setLobbies(r.lobbies), []));
  useSocketEvent('coinflip:lobbies', setLobbies);
  useSocketEvent('coinflip:result', useCallback((r: Result) => setResults((rs) => [r, ...rs].slice(0, 10)), []));

  const flip = async (stake = amount) => {
    if (busy.current) return;
    busy.current = true;
    const release = holdBalance();
    const res = await call<{ result: Side; win: number }>('coinflip:solo', { amount: stake, side });
    if (!res) {
      release();
      return void (busy.current = false);
    }
    const f = { id: Date.now(), side, result: res.result, win: res.win, amount: stake };
    setLast(null);
    setFlipping(f);
    sound.flip();
    await sleep(FLIP_MS);
    busy.current = false;
    release();
    setFlipping(null);
    setLast(f);
    setHistory((h) => [f, ...h].slice(0, 24));
    if (f.win) sound.win(1);
    else sound.lose();
  };

  // Current run of wins (or losses) from the latest flip backwards.
  const streak = history.length ? history.findIndex((f) => !!f.win !== !!history[0].win) : 0;
  const streakLen = streak === -1 ? history.length : streak;
  const coinFace = flipping?.result ?? last?.result ?? side;

  const solo = (
    <div className="panel overflow-hidden">
      <div className="relative grid place-items-center bg-[radial-gradient(70%_60%_at_50%_40%,rgba(228,192,106,.12),transparent)] px-4 py-10 sm:py-14 [perspective:900px]">
        <div
          key={flipping?.id ?? 'still'}
          className={`coin relative h-36 w-36 sm:h-44 sm:w-44 ${flipping ? (flipping.result === 'heads' ? 'coin-heads' : 'coin-tails') : ''}`}
          style={flipping ? undefined : { transform: `rotateY(${coinFace === 'tails' ? 180 : 0}deg)` }}
        >
          <CoinFace side="heads" />
          <CoinFace side="tails" />
        </div>
        <div className="mt-6 min-h-14 text-center">
          {flipping ? (
            <p className="text-sm text-muted">{t('Die Münze fliegt …')}</p>
          ) : last ? (
            <div className="pop-in">
              <p className={`text-2xl font-bold ${last.win ? 'text-win' : 'text-loss'}`}>
                {last.win ? <>+<span className="num">{coins(last.win)}</span> NVC</> : <>−<span className="num">{coins(last.amount)}</span> NVC</>}
              </p>
              <p className="text-sm text-muted">
                {t(SIDE[last.result])} – {last.win ? t('gewonnen!') : t('leider daneben.')}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">{t('Wähle Kopf oder Zahl. Treffer zahlt {x}×.', { x: COINFLIP_SOLO_PAYOUT })}</p>
          )}
        </div>
      </div>
      {history.length > 0 && (
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <div className="no-scrollbar flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {history.map((f) => (
              <span
                key={f.id}
                title={`${t(SIDE[f.result])} · ${f.win ? t('Gewonnen') : t('Verloren')}`}
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                  f.result === 'heads' ? 'bg-gold/20 text-gold' : 'bg-white/10 text-white/70'
                } ${f.win ? 'ring-1 ring-win' : ''}`}
              >
                {t(SIDE[f.result])[0]}
              </span>
            ))}
          </div>
          {streakLen > 1 && (
            <span className={`shrink-0 text-xs font-medium ${history[0].win ? 'text-win' : 'text-loss'}`}>
              {streakLen}× {history[0].win ? 'gewonnen' : 'verloren'} in Folge
            </span>
          )}
        </div>
      )}
    </div>
  );

  const duel = (
    <div className="panel">
      <p className="border-b border-line px-4 py-3 text-sm font-semibold">{t('Offene Duelle')}</p>
      {lobbies.length === 0 ? (
        <Empty>{t('Keine offenen Duelle – erstelle das erste.')}</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {lobbies.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold/40 text-xs font-semibold text-gold">{t(SIDE[l.side])[0]}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{l.username}</span>
                <span className="text-xs text-muted">{t('setzt auf {side}', { side: t(SIDE[l.side]) })}</span>
              </span>
              <span className="num text-sm text-gold">{coins(l.amount)}</span>
              {l.userId === me.id ? (
                <button className="btn-secondary h-8" onClick={() => call('coinflip:cancel', { id: l.id })}>{t('Abbrechen')}</button>
              ) : (
                <button className="btn-primary h-8" onClick={() => call('coinflip:accept', { id: l.id })}>{t('Annehmen')}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const controls = (
    <div className="card space-y-4">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-bg p-1">
        {(['solo', 'duel'] as const).map((m) => (
          <button key={m} className={`h-9 rounded-md text-sm font-medium ${mode === m ? 'bg-raised text-fg' : 'text-muted hover:text-fg'}`} onClick={() => setMode(m)}>
            {m === 'solo' ? t('Gegen das Haus') : `${t('Duelle')}${lobbies.length ? ` (${lobbies.length})` : ''}`}
          </button>
        ))}
      </div>
      <BetInput value={amount} onChange={setAmount} balance={balance} />
      <div className="grid grid-cols-2 gap-2">
        {(['heads', 'tails'] as const).map((s) => (
          <button key={s} className={`h-11 ${side === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSide(s)}>
            {s === 'heads' ? <Crown className="h-4 w-4" /> : <Star className="h-4 w-4" />} {t(SIDE[s])}
          </button>
        ))}
      </div>
      {mode === 'solo' ? (
        <>
          <button className="btn-primary h-12 w-full text-base font-semibold" onClick={() => void flip()} disabled={!!flipping}>
            {flipping ? t('Fliegt …') : t('Münze werfen')}
          </button>
          {last?.win ? (
            <button className="btn-secondary h-10 w-full" onClick={() => void flip(last.win)} disabled={!!flipping || last.win > balance}>
              Gewinn nochmal setzen ({coins(last.win)})
            </button>
          ) : null}
          <p className="text-xs text-faint">{t('Treffer zahlt das {x}-fache des Einsatzes.', { x: COINFLIP_SOLO_PAYOUT })}</p>
        </>
      ) : (
        <>
          <button className="btn-primary h-12 w-full" onClick={() => call('coinflip:create', { amount, side })}>{t('Duell eröffnen')}</button>
          <p className="text-xs text-faint">{t('Der Gewinner bekommt den Pot abzüglich 5 % Gebühr.')}</p>
        </>
      )}
    </div>
  );

  const extra = mode === 'duel' && results.length > 0 && (
    <div className="panel">
      <p className="border-b border-line px-4 py-3 text-sm font-semibold">{t('Letzte Duelle')}</p>
      <ul className="divide-y divide-line text-sm">
        {results.map((r, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2.5">
            <span className="text-muted">{r.lobby.username} vs. {r.opponent} · {t(SIDE[r.result])}</span>
            <span><span className="font-medium">{r.winner}</span> <span className="num text-win">+{coins(r.prize)}</span></span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <GameFrame
      title="Coinflip"
      subtitle={mode === 'solo' ? t('Kopf oder Zahl gegen das Haus.') : t('Kopf oder Zahl, Spieler gegen Spieler.')}
      stage={mode === 'solo' ? solo : duel}
      controls={controls}
      extra={extra}
    />
  );
}

function CoinFace({ side }: { side: Side }) {
  const t = useT();
  const heads = side === 'heads';
  return (
    <div
      className={`coin-face absolute inset-0 grid place-items-center rounded-full border-4 shadow-[0_10px_40px_rgba(0,0,0,.5)] ${
        heads ? 'border-[#b8912f] bg-[radial-gradient(circle_at_35%_30%,#fbe7a1,#e4c06a_45%,#a37b22)] text-[#5a4210]' : 'border-[#8d949e] bg-[radial-gradient(circle_at_35%_30%,#f4f6f8,#c3c9d1_45%,#7d848e)] text-[#3a3f46]'
      }`}
      style={heads ? undefined : { transform: 'rotateY(180deg)' }}
    >
      <div className="grid h-[82%] w-[82%] place-items-center rounded-full border-2 border-current/30">
        <div className="text-center">
          {heads ? <Crown className="mx-auto h-12 w-12 sm:h-14 sm:w-14" /> : <Star className="mx-auto h-12 w-12 sm:h-14 sm:w-14" />}
          <p className="mt-1 text-xs font-bold tracking-[0.25em] uppercase">{t(SIDE[side])}</p>
        </div>
      </div>
    </div>
  );
}
