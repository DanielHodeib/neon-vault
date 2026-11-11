import 'server-only';

import { cookies } from 'next/headers';

import { isLang, LANG_COOKIE, translator, type Lang } from './i18n';

/** Language of the current request (cookie), German by default. */
export async function getLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(v) ? v : 'de';
}

export const getT = async () => translator(await getLang());
