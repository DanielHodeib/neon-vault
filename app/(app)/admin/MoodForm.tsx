'use client';

import { useState } from 'react';

import { moodAction, stopMoodAction } from '@/app/actions/admin';
import { FormButton } from '@/components/FormButton';
import { ActionForm, SubmitButton } from '@/components/ui';
import { MOOD_LEVELS, MOODS, type Mood, type MoodName } from '@/lib/fx';

type Props = { to: string | null; toName?: string; current: Mood | null };

/** Pick an atmosphere preset, its strength and how long it stays. */
export function MoodForm({ to, toName, current }: Props) {
  const [name, setName] = useState<MoodName>('dramatic');
  const [level, setLevel] = useState(2);

  return (
    <div className="space-y-4">
      {current && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 text-sm">
          <span>
            <span className="font-semibold text-accent">
              {MOODS[current.name].emoji} {MOODS[current.name].label}
            </span>{' '}
            für alle bis {new Date(current.endsAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} · {MOOD_LEVELS[current.level - 1]}
          </span>
          <FormButton action={stopMoodAction.bind(null, null)} className="btn-secondary h-8 text-xs">Beenden</FormButton>
        </div>
      )}

      <ActionForm action={moodAction} className="space-y-3">
        <input type="hidden" name="name" value={name} />
        <input type="hidden" name="level" value={level} />
        {to && <input type="hidden" name="user" value={to} />}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(MOODS) as MoodName[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={name === k}
              onClick={() => setName(k)}
              className={`btn-secondary h-auto flex-col gap-1 py-3 ${name === k ? 'border-accent ring-2 ring-accent/60' : ''}`}
            >
              <span className="text-2xl">{MOODS[k].emoji}</span>
              <span className="text-xs">{MOODS[k].label}</span>
            </button>
          ))}
        </div>
        <p className="rounded-lg bg-bg px-3 py-2 text-xs text-muted">{MOODS[name].hint}</p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <span className="label">Stärke</span>
            <div className="flex gap-1">
              {MOOD_LEVELS.map((label, i) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={level === i + 1}
                  onClick={() => setLevel(i + 1)}
                  className={`h-9 text-xs ${level === i + 1 ? 'btn-primary' : 'btn-secondary'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="mood-minutes">Minuten</label>
            <input id="mood-minutes" className="input num w-24" name="minutes" type="number" min={1} max={120} defaultValue={5} />
          </div>
          <SubmitButton className="btn-primary">{to ? `Bei ${toName} starten` : 'Für alle starten'}</SubmitButton>
          {to && (
            <FormButton action={stopMoodAction.bind(null, to)} className="btn-ghost h-9 text-xs">Bei {toName} beenden</FormButton>
          )}
        </div>
      </ActionForm>
    </div>
  );
}
