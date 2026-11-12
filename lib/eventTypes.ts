// Global event definitions: pure data, shared by the server (lib/events.ts) and the browser.
// Every event has settings the admin can change; descriptions fill them in via {key}.
export type EventType = 'CASHBACK' | 'BOOST' | 'RAIN' | 'HAPPY_HOUR' | 'JACKPOT_RUSH' | 'DUEL' | 'KING' | 'BOUNTY';
export type EventParams = Record<string, number>;

type Param = { key: string; label: string; def: number; min: number; max: number; step?: number; unit?: string };
type EventInfo = { label: string; description: string; minutes: number; params: Param[] };

export const EVENT_INFO: Record<EventType, EventInfo> = {
  CASHBACK: {
    label: 'Cashback-Mania',
    description: '{percent} % Cashback auf verlorene Crash- und Coinflip-Einsätze.',
    minutes: 10,
    params: [{ key: 'percent', label: 'Cashback', def: 10, min: 1, max: 50, unit: '%' }],
  },
  BOOST: {
    label: 'Multiplier-Boost',
    description: '{factor}× Auszahlung auf Crash- und Coinflip-Gewinne.',
    minutes: 10,
    params: [{ key: 'factor', label: 'Faktor', def: 1.2, min: 1.05, max: 3, step: 0.05, unit: '×' }],
  },
  RAIN: {
    label: 'Rain-Event',
    description: 'Alle Online-Spieler bekommen alle {every} Sekunden {min}–{max} NVC.',
    minutes: 10,
    params: [
      { key: 'min', label: 'Drop min.', def: 20, min: 1, max: 1_000_000, unit: 'NVC' },
      { key: 'max', label: 'Drop max.', def: 100, min: 1, max: 1_000_000, unit: 'NVC' },
      { key: 'every', label: 'Alle', def: 45, min: 10, max: 600, unit: 's' },
    ],
  },
  HAPPY_HOUR: {
    label: 'Happy Hour',
    description: '+{xp} Extra-XP für jeden Gewinn (höchstens 1 XP je 10 NVC Gewinn).',
    minutes: 60,
    params: [{ key: 'xp', label: 'XP pro Gewinn', def: 10, min: 1, max: 1000 }],
  },
  JACKPOT_RUSH: {
    label: 'Jackpot-Rush',
    description: 'Das beste Symbol jedes Slot-Automaten zahlt {factor}×.',
    minutes: 10,
    params: [{ key: 'factor', label: 'Faktor', def: 3, min: 1.5, max: 10, step: 0.5, unit: '×' }],
  },
  DUEL: {
    label: 'Duell-Woche',
    description: 'Coinflip-Duelle mit nur {fee} % Gebühr statt 5 %.',
    minutes: 30,
    params: [{ key: 'fee', label: 'Gebühr', def: 0, min: 0, max: 5, step: 0.5, unit: '%' }],
  },
  KING: {
    label: 'King of the Hill',
    description: 'Wer während des Events den höchsten Netto-Gewinn macht, bekommt {bonus} NVC Bonus.',
    minutes: 30,
    params: [{ key: 'bonus', label: 'Bonus', def: 25_000, min: 100, max: 100_000_000, unit: 'NVC' }],
  },
  BOUNTY: {
    label: 'Bounty',
    description: 'Wer den King of Today im Coinflip schlägt, bekommt {bonus} NVC.',
    minutes: 30,
    params: [{ key: 'bonus', label: 'Bonus', def: 10_000, min: 100, max: 100_000_000, unit: 'NVC' }],
  },
};

export const EVENT_KEYS = Object.keys(EVENT_INFO) as EventType[];

export const defaultParams = (type: EventType): EventParams => Object.fromEntries(EVENT_INFO[type].params.map((p) => [p.key, p.def]));

/** Clamps given values to each setting's range; missing ones get the default. */
export function cleanParams(type: EventType, raw: Partial<EventParams>): EventParams {
  return Object.fromEntries(
    EVENT_INFO[type].params.map((p) => {
      const v = raw[p.key];
      if (typeof v !== 'number' || !Number.isFinite(v)) return [p.key, p.def];
      const stepped = p.step ? Math.round(v / p.step) * p.step : Math.round(v); // whole coins unless a step is given
      return [p.key, Math.min(p.max, Math.max(p.min, Number(stepped.toFixed(4))))];
    }),
  );
}

/** Values formatted for a description: thousands separators, decimal comma. */
export const descriptionVars = (params: EventParams) =>
  Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.toLocaleString('de-DE', { maximumFractionDigits: 2 })]));

/** German description with the values filled in. */
export const describeEvent = (type: EventType, params: EventParams) =>
  EVENT_INFO[type].description.replace(/\{(\w+)\}/g, (m, k: string) => descriptionVars(params)[k] ?? m);
