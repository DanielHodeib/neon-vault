// Two languages. German text is the key; English comes from lib/i18n-en.ts and falls back to
// German when a string has no translation yet. `{name}` placeholders are filled from `vars`.
import { EN, EN_LAST_PATTERNS, EN_PATTERNS } from './i18n-en';

export type Lang = 'de' | 'en';
export const LANGS: Lang[] = ['de', 'en'];
export const LANG_COOKIE = 'nv_lang';
export const LANG_NAMES: Record<Lang, string> = { de: 'Deutsch', en: 'English' };

export const isLang = (v: unknown): v is Lang => v === 'de' || v === 'en';

export type Vars = Record<string, string | number>;
export type T = (text: string, vars?: Vars) => string;

// English entries with {placeholders} also match finished German text ("Tag 5" → "Day 5").
let templates: [RegExp, string, string[]][] | null = null;
const compiled = () =>
  (templates ??= Object.entries(EN)
    .filter(([de]) => /\{\w+\}/.test(de))
    .map(([de, en]) => {
      const keys = [...de.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      const re = new RegExp('^' + de.split(/\{\w+\}/).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)') + '$');
      return [re, en, keys, de.replace(/\{\w+\}/g, '').length] as const;
    })
    .sort((a, b) => b[3] - a[3]) // the most specific template (most fixed text) wins
    .map(([re, en, keys]) => [re, en, keys]));

const fill = (text: string, vars?: Vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text);

export function translate(lang: Lang, text: string, vars?: Vars): string {
  if (lang === 'en') {
    const hit = EN[text];
    if (hit !== undefined) return fill(hit, vars);
    // Messages built on the server with numbers or names inside (e.g. errors) match by pattern.
    for (const [re, en] of EN_PATTERNS) {
      const m = re.exec(text);
      if (m) return typeof en === 'string' ? text.replace(re, en) : en(m.slice(1), (s) => translate('en', s));
    }
    for (const [re, en, keys] of compiled()) {
      const m = re.exec(text);
      if (m) return fill(en, Object.fromEntries(keys.map((k, i) => [k, m[i + 1]])));
    }
    for (const [re, en] of EN_LAST_PATTERNS) {
      const m = re.exec(text);
      if (m) return typeof en === 'string' ? text.replace(re, en) : en(m.slice(1), (s) => translate('en', s));
    }
  }
  return fill(text, vars);
}

export const translator = (lang: Lang): T => (text, vars) => translate(lang, text, vars);

/** Browser-side language from <html lang>, for messages shown outside React (toasts). */
export const pageLang = (): Lang => (typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'de');
export const tPage: T = (text, vars) => translate(pageLang(), text, vars);
