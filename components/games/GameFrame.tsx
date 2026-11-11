'use client';

import { Volume2, VolumeX } from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';

import { PageHeader } from '../ui';
import { soundPref } from './sound';

/**
 * Shared game layout. Phones/tablets: stage → controls → extras, stacked.
 * Laptops: stage and extras on the left, controls in a sticky column on the right.
 */
export function GameFrame({ title, subtitle, stage, controls, extra }: { title: string; subtitle?: string; stage: ReactNode; controls: ReactNode; extra?: ReactNode }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} action={<SoundToggle />} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">{stage}</div>
        <aside className="space-y-4 lg:sticky lg:top-0 lg:row-span-2">{controls}</aside>
        {extra && <div className="min-w-0 space-y-4">{extra}</div>}
      </div>
    </>
  );
}

/** Mute switch shared by every game (stored per browser). */
function SoundToggle() {
  const muted = useSyncExternalStore(soundPref.subscribe, soundPref.muted, soundPref.server);
  return (
    <button onClick={soundPref.toggle} className="btn-ghost h-9 w-9 px-0" aria-label={muted ? 'Ton an' : 'Ton aus'} title={muted ? 'Ton an' : 'Ton aus'}>
      {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
    </button>
  );
}
