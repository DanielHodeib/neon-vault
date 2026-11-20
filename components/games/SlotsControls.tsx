'use client';

import { Square, Volume2, VolumeX, Zap } from 'lucide-react';

import { useT } from '@/components/I18n';
import { coins } from '@/lib/format';
import type { Machine } from '@/lib/slots';
import { BetInput } from '../ui';
import { soundPref } from './sound';
import type { FreeSpins, Phase } from './slotsTypes';

const AUTO = [0, 10, 25, 50, 100];

type Props = {
  machine: Machine;
  phase: Phase;
  free: FreeSpins;
  freeHere: number;
  amount: number;
  setAmount: (n: number) => void;
  balance: number;
  autoRunning: boolean;
  auto: number;
  setAuto: (n: number) => void;
  setAutoFree: (on: boolean) => void;
  stopAuto: () => void;
  spinNow: () => void;
  turbo: boolean;
  toggleTurbo: () => void;
  muted: boolean;
};

/** Bet, spin button, autoplay, turbo and sound. */
export function SlotsControls({ machine, phase, free, freeHere, amount, setAmount, balance, autoRunning, auto, setAuto, setAutoFree, stopAuto, spinNow, turbo, toggleTurbo, muted }: Props) {
  const t = useT();
  return (
    <div className="card space-y-4">
      {freeHere > 0 ? (
        <div className="rounded-lg bg-gold/10 px-3 py-2.5 text-sm text-gold">
          <p className="font-semibold">{freeHere} Free Spins übrig</p>
          <p className="text-xs text-gold/80">
            {t('Einsatz')} <span className="num">{coins(free!.bet)}</span> NVC{free!.special && ` · ${t('Sondersymbol')} ${free!.special}`}
            {machine.freeSpins?.mult && ` · ${t('Gewinne')} ×${machine.freeSpins.mult}`}
          </p>
        </div>
      ) : (
        <BetInput value={amount} onChange={setAmount} balance={balance} min={machine.minBet} />
      )}

      {autoRunning ? (
        <button className="btn-secondary h-14 w-full text-base" onClick={stopAuto}>
          <Square className="h-4 w-4" /> {t('Stopp')}{auto > 0 && ` (${auto})`}
        </button>
      ) : (
        <button className="btn-primary h-14 w-full text-base font-semibold" onClick={spinNow} disabled={phase !== 'idle'}>
          {phase !== 'idle' ? t('Dreht …') : freeHere ? `Free Spin (${freeHere})` : t('Drehen')}
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
              {n || t('Aus')}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button className={`btn h-9 border text-xs ${turbo ? 'border-accent bg-accent/10' : 'border-line text-muted'}`} onClick={toggleTurbo}>
          <Zap className="h-3.5 w-3.5" /> Turbo
        </button>
        <button className={`btn h-9 border text-xs ${muted ? 'border-line text-muted' : 'border-accent bg-accent/10'}`} onClick={soundPref.toggle}>
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />} Ton
        </button>
      </div>
      <p className="hidden text-center text-[11px] text-faint sm:block">{t('Leertaste = Drehen')}</p>
    </div>
  );
}
