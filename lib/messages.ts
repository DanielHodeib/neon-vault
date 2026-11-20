// Messages with a stable ID: both languages live side by side, so one can't be forgotten or drift.
// `t('err.minBet', { min: 50 })` / `new UserError('err.minBet', { min: 50 })`. Texts that are not an ID here
// still work as before (German sentence = key, English from i18n-en.ts).
export const MESSAGES = {
  'err.amountMin': { de: 'Ungültiger Betrag (min. {min}).', en: 'Invalid amount (min. {min}).' },
  'err.minBet': { de: 'Mindesteinsatz: {min} NVC.', en: 'Minimum bet: {min} NVC.' },
  'err.dailyLimit': { de: 'Dein Tageslimit ist erreicht – heute noch {left} NVC möglich.', en: 'Your daily limit is reached – {left} NVC left today.' },
  'err.maxMarkets': { de: 'Maximal {max} offene Wetten.', en: 'At most {max} open bets.' },
  'err.maxDuels': { de: 'Maximal {max} offene Duelle.', en: 'At most {max} open duels.' },
  'err.maxLobbies': { de: 'Maximal {max} offene Lobbys.', en: 'At most {max} open lobbies.' },
  'err.raiseMin': { de: 'Raise mindestens auf {to}.', en: 'Raise to at least {to}.' },
  'err.banPermanent': { de: 'Gesperrt dauerhaft.', en: 'Banned permanently.' },
  'err.banPermanentWhy': { de: 'Gesperrt dauerhaft – Grund: {reason}.', en: 'Banned permanently – reason: {reason}.' },
  'err.banUntil': { de: 'Gesperrt bis {date}.', en: 'Banned until {date}.' },
  'err.banUntilWhy': { de: 'Gesperrt bis {date} – Grund: {reason}.', en: 'Banned until {date} – reason: {reason}.' },
  'err.mutedUntil': { de: 'Du bist im Chat stummgeschaltet bis {time} Uhr.', en: 'You are muted in the chat until {time}.' },
} as const satisfies Record<string, { de: string; en: string }>;

export type MessageId = keyof typeof MESSAGES;

export const isMessageId = (text: string): text is MessageId => Object.hasOwn(MESSAGES, text);
