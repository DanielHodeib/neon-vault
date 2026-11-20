'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';

import { parse, run, type ActionState } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { broadcast } from '@/lib/hub';
import * as markets from '@/lib/marketService';
import { MARKET_MAX_DAYS, MARKET_MIN_MINUTES, type MarketOption } from '@/lib/markets';

/** Every open arena page reloads its list. */
const changed = () => {
  broadcast('markets', null);
  refresh();
};

// Thin wrappers: who is asking (cookie), form parsing and the page refresh live here, the rules in lib/marketService.ts.

export async function createMarket(_: ActionState, form: FormData) {
  return run(async () => {
    const me = await requireUser();
    const data = parse(
      z.object({
        question: z.string().trim().min(5, 'Frage: mindestens 5 Zeichen.').max(120),
        optionA: z.string().trim().min(1).max(30).default('Ja'),
        optionB: z.string().trim().min(1).max(30).default('Nein'),
        minutes: z.coerce.number().int().min(MARKET_MIN_MINUTES).max(MARKET_MAX_DAYS * 24 * 60),
      }),
      form,
    );
    const msg = await markets.createMarket(me.id, data);
    changed();
    return msg;
  });
}

export async function placeMarketBet(marketId: string, option: MarketOption, amount: number) {
  return run(async () => {
    const msg = await markets.placeMarketBet((await requireUser()).id, marketId, option, amount);
    changed();
    return msg;
  });
}

export async function settleMarket(marketId: string, outcome: MarketOption) {
  return run(async () => {
    const msg = await markets.settleMarket(await requireUser(), marketId, outcome);
    changed();
    return msg;
  });
}

export async function cancelMarket(marketId: string) {
  return run(async () => {
    const msg = await markets.cancelMarket(await requireUser(), marketId);
    changed();
    return msg;
  });
}
