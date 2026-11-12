'use server';

import { refresh } from 'next/cache';
import { z } from 'zod';

import { parse, run, type ActionState } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { broadcast, db, notify, UserError } from '@/lib/hub';
import { MARKET_MAX_DAYS, MARKET_MAX_OPEN, MARKET_MIN_BET, MARKET_MIN_MINUTES, marketPayouts, type MarketOption } from '@/lib/markets';
import { atLeast } from '@/lib/roles';
import { cancelBet, payout, placeBet } from '@/lib/wallet';

/** Every open arena page reloads its list. */
const changed = () => {
  broadcast('markets', null);
  refresh();
};

export async function createMarket(_: ActionState, form: FormData) {
  return run(async () => {
    const me = await requireUser();
    const { question, optionA, optionB, minutes } = parse(
      z.object({
        question: z.string().trim().min(5, 'Frage: mindestens 5 Zeichen.').max(120),
        optionA: z.string().trim().min(1).max(30).default('Ja'),
        optionB: z.string().trim().min(1).max(30).default('Nein'),
        minutes: z.coerce.number().int().min(MARKET_MIN_MINUTES).max(MARKET_MAX_DAYS * 24 * 60),
      }),
      form,
    );
    if (optionA.toLowerCase() === optionB.toLowerCase()) throw new UserError('Die zwei Antworten müssen sich unterscheiden.');
    if ((await db.market.count({ where: { creatorId: me.id, status: 'open' } })) >= MARKET_MAX_OPEN) throw new UserError(`Maximal ${MARKET_MAX_OPEN} offene Wetten.`);
    await db.market.create({ data: { creatorId: me.id, question, optionA, optionB, closesAt: new Date(Date.now() + minutes * 60_000) } });
    changed();
    return 'Wette erstellt.';
  });
}

export async function placeMarketBet(marketId: string, option: MarketOption, amount: number) {
  return run(async () => {
    const me = await requireUser();
    if (option !== 'A' && option !== 'B') throw new UserError('Ungültige Antwort.');
    if (!Number.isSafeInteger(amount) || amount < MARKET_MIN_BET) throw new UserError(`Mindesteinsatz: ${MARKET_MIN_BET} NVC.`);
    const market = await db.market.findUnique({ where: { id: marketId } });
    if (!market || market.status !== 'open' || market.closesAt.getTime() <= Date.now()) throw new UserError('Diese Wette nimmt keine Einsätze mehr an.');
    if (market.creatorId === me.id) throw new UserError('Auf deine eigene Wette kannst du nicht setzen.');
    await placeBet(me.id, amount, 'market');
    // Store the bet only while the market is provably still open (one transaction); settle reads the
    // bets after claiming the market, so every stored bet is paid and none slips in afterwards.
    const stored = await db.$transaction(async (tx) => {
      const still = await tx.market.findUnique({ where: { id: marketId }, select: { status: true, closesAt: true } });
      if (still?.status !== 'open' || still.closesAt.getTime() <= Date.now()) return false;
      await tx.marketBet.create({ data: { marketId, userId: me.id, option, amount: BigInt(amount) } });
      return true;
    });
    if (!stored) {
      await cancelBet(me.id, amount, 'market');
      throw new UserError('Diese Wette nimmt keine Einsätze mehr an.');
    }
    changed();
    return `${amount.toLocaleString('de-DE')} NVC auf „${option === 'A' ? market.optionA : market.optionB}“.`;
  });
}

/** Creator (or a moderator) decides the answer; the pot is split right away. */
export async function settleMarket(marketId: string, outcome: MarketOption) {
  return run(async () => {
    const me = await requireUser();
    if (outcome !== 'A' && outcome !== 'B') throw new UserError('Ungültige Antwort.');
    const market = await db.market.findUnique({ where: { id: marketId } });
    if (!market || market.status !== 'open') throw new UserError('Wette nicht gefunden.');
    if (market.creatorId !== me.id && !atLeast(me.role, 'MODERATOR')) throw new UserError('Nur wer die Wette erstellt hat, entscheidet sie.');
    // Claim it first: a second click (or a moderator at the same time) can't pay twice.
    const { count } = await db.market.updateMany({ where: { id: marketId, status: 'open' }, data: { status: 'settled', outcome } });
    if (!count) throw new UserError('Wette ist schon entschieden.');
    const bets = await db.marketBet.findMany({ where: { marketId } });
    const pays = marketPayouts(
      bets.map((b) => ({ id: b.id, option: b.option as MarketOption, amount: Number(b.amount) })),
      outcome,
    );
    const answer = outcome === 'A' ? market.optionA : market.optionB;
    for (const b of bets) {
      const p = pays.get(b.id)!;
      if (p.refund) await cancelBet(b.userId, p.amount, 'market');
      else await payout(b.userId, p.amount, 'market');
      await notify(b.userId, 'Wette entschieden', `„${market.question}“: ${answer}${p.amount && !p.refund ? ` – du bekommst ${p.amount.toLocaleString('de-DE')} NVC` : ''}.`, { link: '/arena?tab=bets' }).catch(console.error);
    }
    changed();
    return `Entschieden: ${answer}.`;
  });
}

/** Called off: everybody gets their stake back. */
export async function cancelMarket(marketId: string) {
  return run(async () => {
    const me = await requireUser();
    const market = await db.market.findUnique({ where: { id: marketId } });
    if (!market || market.status !== 'open') throw new UserError('Wette nicht gefunden.');
    if (market.creatorId !== me.id && !atLeast(me.role, 'MODERATOR')) throw new UserError('Nur wer die Wette erstellt hat, kann sie absagen.');
    const { count } = await db.market.updateMany({ where: { id: marketId, status: 'open' }, data: { status: 'cancelled' } });
    if (!count) throw new UserError('Wette ist schon entschieden.');
    for (const b of await db.marketBet.findMany({ where: { marketId } })) await cancelBet(b.userId, Number(b.amount), 'market');
    changed();
    return 'Wette abgesagt – alle Einsätze sind zurück.';
  });
}
