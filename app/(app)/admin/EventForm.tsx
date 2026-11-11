'use client';

import { useState } from 'react';

import { eventAction, stopEventAction, toggleAutoEvents } from '@/app/actions/admin';
import { FormButton } from '@/components/FormButton';
import { ActionForm, SubmitButton } from '@/components/ui';
import { describeEvent, EVENT_INFO, EVENT_KEYS, type EventType } from '@/lib/eventTypes';

const CHAT_RAIN = 'CHAT_RAIN';
type Field = { key: string; label: string; def: number; min?: number; max?: number; step?: number; unit?: string };
const RAIN_FIELDS: Field[] = [
  { key: 'amount', label: 'NVC gesamt', def: 10_000, min: 1 },
  { key: 'seconds', label: 'Sekunden', def: 60, min: 5, max: 600 },
  { key: 'players', label: 'Gewinner', def: 10, min: 1, max: 100 },
];

type Props = {
  running: { label: string; description: string; endsAt: number } | null;
  auto: { on: boolean; nextAt: number | null };
};

/** Start an event with its own settings, or a one-off chat rain; also stop events and switch auto events. */
export function EventForm({ running, auto }: Props) {
  const [type, setType] = useState<EventType | typeof CHAT_RAIN>(EVENT_KEYS[0]);
  const [values, setValues] = useState<Record<string, number>>({});
  const info = type === CHAT_RAIN ? null : EVENT_INFO[type];
  const value = (key: string, def: number) => values[key] ?? def;
  const preview = info ? describeEvent(type as EventType, Object.fromEntries(info.params.map((p) => [p.key, value(p.key, p.def)]))) : null;

  const choose = (next: string) => {
    setType(next as EventType);
    setValues({});
  };

  return (
    <div className="space-y-4">
      {running && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 text-sm">
          <span>
            <span className="font-semibold text-accent">{running.label}</span> läuft bis {new Date(running.endsAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
            <span className="block text-xs text-muted">{running.description}</span>
          </span>
          <FormButton action={stopEventAction} className="btn-secondary h-8 text-xs">Stoppen</FormButton>
        </div>
      )}

      <ActionForm action={eventAction} className="space-y-3">
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <div>
            <label className="label" htmlFor="event-type">Event</label>
            <select id="event-type" className="input" name="type" value={type} onChange={(e) => choose(e.target.value)}>
              {EVENT_KEYS.map((k) => (
                <option key={k} value={k}>{EVENT_INFO[k].label}</option>
              ))}
              <option value={CHAT_RAIN}>Chat-Rain (einmalig)</option>
            </select>
          </div>
          {info && (
            <div>
              <label className="label" htmlFor="event-minutes">Minuten</label>
              <input key={type} id="event-minutes" className="input num" name="minutes" type="number" min={1} max={180} defaultValue={info.minutes} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {(info ? (info.params as Field[]) : RAIN_FIELDS).map((p) => (
            <div key={`${type}-${p.key}`}>
              <label className="label" htmlFor={`p-${p.key}`}>
                {p.label}
                {p.unit ? ` (${p.unit})` : ''}
              </label>
              <input
                id={`p-${p.key}`}
                className="input num"
                name={`p_${p.key}`}
                type="number"
                step={p.step ?? 1}
                min={p.min ?? 1}
                max={p.max}
                defaultValue={p.def}
                onChange={(e) => setValues((v) => ({ ...v, [p.key]: Number(e.target.value) }))}
              />
            </div>
          ))}
        </div>

        <p className="rounded-lg bg-bg px-3 py-2 text-xs text-muted">
          {preview ?? 'Der Betrag wird unter den Spielern verteilt, die in den letzten 10 Minuten im Chat geschrieben haben.'}
        </p>
        <SubmitButton className="btn-primary">{info ? 'Event starten' : 'Regnen lassen'}</SubmitButton>
      </ActionForm>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm">
        <span>
          <span className="font-medium">Automatische Events</span>
          <span className="block text-xs text-muted">
            {auto.on
              ? `An – alle 60–120 Min. ein zufälliges Event${auto.nextAt ? `, nächstes ca. ${new Date(auto.nextAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : ''}.`
              : 'Aus – Events startest nur du.'}
          </span>
        </span>
        <FormButton action={toggleAutoEvents} className={auto.on ? 'btn-secondary h-8 text-xs' : 'btn-primary h-8 text-xs'}>
          {auto.on ? 'Ausschalten' : 'Einschalten'}
        </FormButton>
      </div>
    </div>
  );
}
