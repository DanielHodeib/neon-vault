'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { translator, type Lang, type T } from '@/lib/i18n';

const Ctx = createContext<{ lang: Lang; t: T }>({ lang: 'de', t: translator('de') });

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t: translator(lang) }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** `const t = useT()` → `t('Drehen')`; `useLang()` for the current language. */
export const useT = () => useContext(Ctx).t;
export const useLang = () => useContext(Ctx).lang;
