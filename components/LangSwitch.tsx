'use client';

import { setLang } from '@/app/actions/account';
import { LANGS } from '@/lib/i18n';
import { useLang } from './I18n';

/** DE | EN switch (cookie), usable before logging in. */
export function LangSwitch() {
  const lang = useLang();
  return (
    <div className="flex rounded-md bg-raised p-0.5 text-xs" role="group" aria-label="Sprache / Language">
      {LANGS.map((l) => (
        <button key={l} onClick={() => void setLang(l)} aria-pressed={lang === l} className={`rounded px-2 py-0.5 font-medium ${lang === l ? 'bg-bg text-fg' : 'text-muted hover:text-fg'}`}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
