'use client';

import { Swords, Trophy, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { DUEL_FEE, DUEL_GAMES, DUEL_ROUNDS, duelTotal, type DuelGame, type DuelPublic, type DuelResult } from '@/lib/duel';
import { coins } from '@/lib/format';
import { MACHINES } from '@/lib/slots';
import { PLINKO, PLINKO_RISK_LABEL, type PlinkoRisk } from '@/lib/solo';
import { useT } from '../I18n';
import { NameDot } from '../games/Reactions';
import { sound } from '../games/sound';
import { useJoin, useLive, useSocketEvent } from '../SocketProvider';
import { BetInput, Empty } from '../ui';

type Lobby = { open: DuelPublic[]; recent: DuelResult[] };
const STEP_MS = 750;

/** Duel arena: challenge a friend (or anyone) to the same game; the higher total takes the pot. */
export function Duels({ friends }: { friends: string[] }) {
  const t = useT();
  const { call, me, balance } = useLive();
  const [lobby, setLobby] = useState<Lobby>({ open: [], recent: [] });
  const [game, setGame] = useState<DuelGame>('slots');
  const [machine, setMachine] = useState('classic');
  const [risk, setRisk] = useState<PlinkoRisk>('medium');
  const [rounds, setRounds] = useState<number>(5);
  const [stake, setStake] = useState(500);
  const [to, setTo] = useState('');
  const [replay, setReplay] = useState<DuelResult | null>(null);
  const [busy, setBusy] = useState(false);

  useJoin<Lobby>('duel:join', useCallback((r: Lobby) => setLobby(r), []));
  useSocketEvent('duel:lobby', setLobby);
  // Your own duels play automatically when they are decided.
  useSocketEvent('duel:result', (r: DuelResult) => (r.from.id === me.id || r.opponent.id === me.id) && setReplay(r));

  const create = async () => {
    setBusy(true);
    await call('duel:create', { game, setting: game === 'slots' ? machine : game === 'plinko' ? risk : '', rounds, stake, ...(to ? { to } : {}) });
    setBusy(false);
  };
  const accept = async (id: string) => {
    setBusy(true);
    const res = await call<{ result: DuelResult }>('duel:accept', { id });
    setBusy(false);
    if (res) setReplay(res.result);
  };

  const settingLabel = (d: DuelPublic) => (d.game === 'slots' ? (MACHINES[d.setting]?.name ?? '') : d.game === 'plinko' ? t(PLINKO_RISK_LABEL[d.setting as PlinkoRisk] ?? '') : '');

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <section className="card space-y-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Swords size={18} className="text-accent" /> {t('Neues Duell')}
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(DUEL_GAMES) as DuelGame[]).map((g) => (
            <button key={g} onClick={() => setGame(g)} aria-pressed={game === g} className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${game === g ? 'border-accent bg-accent/15' : 'border-line hover:border-line-strong'}`}>
              <span className="mr-1.5">{DUEL_GAMES[g].icon}</span>
              {t(DUEL_GAMES[g].name)}
            </button>
          ))}
        </div>
        {game === 'slots' && (
          <select className="input" value={machine} onChange={(e) => setMachine(e.target.value)} aria-label={t('Automat')}>
            {Object.entries(MACHINES).map(([k, m]) => (
              <option key={k} value={k}>{t(m.name)}</option>
            ))}
          </select>
        )}
        {game === 'plinko' && (
          <div className="flex gap-2">
            {(Object.keys(PLINKO) as PlinkoRisk[]).map((r) => (
              <button key={r} className={risk === r ? 'chip-active' : 'chip'} onClick={() => setRisk(r)}>{t(PLINKO_RISK_LABEL[r])}</button>
            ))}
          </div>
        )}
        <div>
          <p className="label">{t('Runden')}</p>
          <div className="flex gap-2">
            {DUEL_ROUNDS.map((n) => (
              <button key={n} className={rounds === n ? 'chip-active' : 'chip'} onClick={() => setRounds(n)}>{n}</button>
            ))}
          </div>
        </div>
        <BetInput value={stake} onChange={setStake} balance={balance} />
        <div>
          <label className="label" htmlFor="duel-to">{t('Gegner')}</label>
          <select id="duel-to" className="input" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">{t('Jeder darf annehmen')}</option>
            {friends.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary h-11 w-full" onClick={create} disabled={busy || stake < 1}>
          {t('Herausfordern')} · <span className="num">{coins(stake)}</span>
        </button>
        <p className="text-xs text-faint">{t('Gewertet: {how}. Wer mehr hat, bekommt den Pot minus {fee} %. Gleichstand: beide bekommen ihren Einsatz zurück.', { how: t(DUEL_GAMES[game].score), fee: DUEL_FEE * 100 })}</p>
      </section>

      <div className="min-w-0 space-y-4">
        <section className="panel">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">{t('Offene Duelle')}</h2>
          {lobby.open.length === 0 ? (
            <Empty>{t('Gerade kein offenes Duell – fordere jemanden heraus!')}</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {lobby.open.map((d) => {
                const mine = d.from.id === me.id;
                const forMe = !d.to || d.to.id === me.id;
                return (
                  <li key={d.id} className="pop-in flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="text-2xl">{DUEL_GAMES[d.game].icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <NameDot name={d.from.name} /> {d.from.name}
                        <span className="text-faint">vs.</span> {d.to ? d.to.name : t('jeder')}
                      </span>
                      <span className="text-xs text-muted">
                        {t(DUEL_GAMES[d.game].name)} {settingLabel(d) && `· ${settingLabel(d)}`} · {t('{n} Runden', { n: d.rounds })}
                      </span>
                    </span>
                    <span className="num text-sm text-gold">{coins(d.stake)}</span>
                    {mine ? (
                      <button className="btn-ghost h-8 px-2 text-xs" onClick={() => call('duel:cancel', { id: d.id })} aria-label={t('Zurückziehen')}>
                        <X size={14} /> {t('Zurückziehen')}
                      </button>
                    ) : forMe ? (
                      <button className="btn-primary h-8 text-xs" disabled={busy} onClick={() => accept(d.id)}>
                        {t('Annehmen')}
                      </button>
                    ) : (
                      <span className="text-xs text-faint">{t('privat')}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {lobby.recent.length > 0 && (
          <section className="panel">
            <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">{t('Letzte Duelle')}</h2>
            <ul className="divide-y divide-line">
              {lobby.recent.map((r) => {
                const win = r.winner === r.from.id ? r.from.name : r.winner ? r.opponent.name : null;
                return (
                  <li key={r.id}>
                    <button onClick={() => setReplay(r)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-raised">
                      <span>{DUEL_GAMES[r.game].icon}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {r.from.name} <span className="text-faint">vs.</span> {r.opponent.name}
                      </span>
                      <span className="text-xs text-muted">{win ? <><Trophy size={12} className="mr-1 inline text-gold" />{win}</> : t('Unentschieden')}</span>
                      <span className="text-xs text-accent">{t('Ansehen')}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {replay && <DuelReplay result={replay} onClose={() => setReplay(null)} />}
    </div>
  );
}

/** Both players side by side; rounds appear one after another, then the winner lights up. */
function DuelReplay({ result, onClose }: { result: DuelResult; onClose: () => void }) {
  const t = useT();
  const { me } = useLive();
  const [shown, setShown] = useState(0);
  const done = shown >= result.rounds;
  useEffect(() => {
    if (done) {
      if (result.winner === me.id) sound.big();
      else if (result.winner) sound.lose();
      return;
    }
    const id = setTimeout(() => {
      setShown((n) => n + 1);
      sound.tick();
    }, shown === 0 ? 400 : STEP_MS);
    return () => clearTimeout(id);
  }, [shown, done, result.winner, me.id]);

  const side = (name: string, userId: string, rounds: DuelResult['a']) => {
    const total = duelTotal(rounds.slice(0, shown));
    const won = done && result.winner === userId;
    return (
      <div className={`flex-1 rounded-xl border p-3 transition ${won ? 'border-gold bg-gold/10 shadow-[0_0_30px_#e4c06a33]' : 'border-line'}`}>
        <p className={`flex items-center justify-center gap-2 text-sm font-semibold ${userId === me.id ? 'text-accent' : ''}`}>
          <NameDot name={name} /> {name} {won && <Trophy size={14} className="text-gold" />}
        </p>
        <ul className="mt-3 space-y-1.5">
          {rounds.map((r, i) => (
            <li key={i} className={`flex items-center justify-between rounded-lg px-2 py-1 text-sm ${i < shown ? 'pop-in bg-raised' : 'opacity-20'}`}>
              <span className="text-xs text-faint">{i + 1}</span>
              <span>{i < shown ? r.detail : '·'}</span>
              <span className="num text-xs text-muted">{i < shown ? r.score : ''}</span>
            </li>
          ))}
        </ul>
        <p className="num mt-3 text-center text-2xl font-bold">{total}</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-3 backdrop-blur-sm" onClick={onClose}>
      <div className="pop-in w-full max-w-xl rounded-2xl border border-line bg-surface p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold">
            {DUEL_GAMES[result.game].icon} {t(DUEL_GAMES[result.game].name)} · {t('{n} Runden', { n: result.rounds })}
          </p>
          <button onClick={onClose} className="btn-ghost h-8 w-8 px-0" aria-label={t('Schließen')}>
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-3">
          {side(result.from.name, result.from.id, result.a)}
          {side(result.opponent.name, result.opponent.id, result.b)}
        </div>
        <p className="mt-4 min-h-6 text-center font-semibold">
          {done &&
            (result.winner ? (
              <span className={result.winner === me.id ? 'text-win' : ''}>
                {t('{name} gewinnt {n} NVC', { name: result.winner === result.from.id ? result.from.name : result.opponent.name, n: coins(result.prize) })}
              </span>
            ) : (
              <span className="text-muted">{t('Unentschieden – beide bekommen ihren Einsatz zurück')}</span>
            ))}
        </p>
      </div>
    </div>
  );
}
