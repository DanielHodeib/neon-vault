import { db, notify, UserError } from './hub';
import { MARKET_MAX_OPEN, MARKET_MIN_BET, marketPayouts, type MarketOption } from './markets';
import { atLeast } from './roles';
import { cancelBet, payout, placeBet } from './wallet';

// Betting-market rules without Next.js: the server actions call these, the tests call them directly.
type Me = { id: string; role: Parameters<typeof atLeast>[0] };

export async function createMarket(meId: string, data: { question: string; optionA: string; optionB: string; minutes: number }) {
  if (data.optionA.toLowerCase() === data.optionB.toLowerCase()) throw new UserError('Die zwei Antworten müssen sich unterscheiden.');
  if ((await db.market.count({ where: { creatorId: meId, status: 'open' } })) >= MARKET_MAX_OPEN) throw new UserError('err.maxMarkets', { max: MARKET_MAX_OPEN });
  const { minutes, ...rest } = data;
  await db.market.create({ data: { creatorId: meId, ...rest, closesAt: new Date(Date.now() + minutes * 60_000) } });
  return 'Wette erstellt.';
}

export async function placeMarketBet(meId: string, marketId: string, option: MarketOption, amount: number) {
  if (option !== 'A' && option !== 'B') throw new UserError('Ungültige Antwort.');
  if (!Number.isSafeInteger(amount) || amount < MARKET_MIN_BET) throw new UserError('err.minBet', { min: MARKET_MIN_BET });
  const market = await db.market.findUnique({ where: { id: marketId } });
  if (!market || market.status !== 'open' || market.closesAt.getTime() <= Date.now()) throw new UserError('Diese Wette nimmt keine Einsätze mehr an.');
  if (market.creatorId === meId) throw new UserError('Auf deine eigene Wette kannst du nicht setzen.');
  await placeBet(meId, amount, 'market');
  // Store the bet only while the market is provably still open (one transaction); settle reads the
  // bets after claiming the market, so every stored bet is paid and none slips in afterwards.
  const stored = await db.$transaction(async (tx) => {
    const still = await tx.market.findUnique({ where: { id: marketId }, select: { status: true, closesAt: true } });
    if (still?.status !== 'open' || still.closesAt.getTime() <= Date.now()) return false;
    await tx.marketBet.create({ data: { marketId, userId: meId, option, amount: BigInt(amount) } });
    return true;
  });
  if (!stored) {
    await cancelBet(meId, amount, 'market');
    throw new UserError('Diese Wette nimmt keine Einsätze mehr an.');
  }
  return `${amount.toLocaleString('de-DE')} NVC auf „${option === 'A' ? market.optionA : market.optionB}“.`;
}

/** Creator (or a moderator) decides the answer; the pot is split right away. */
export async function settleMarket(me: Me, marketId: string, outcome: MarketOption) {
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
  return `Entschieden: ${answer}.`;
}

/** Called off: everybody gets their stake back. */
export async function cancelMarket(me: Me, marketId: string) {
  const market = await db.market.findUnique({ where: { id: marketId } });
  if (!market || market.status !== 'open') throw new UserError('Wette nicht gefunden.');
  if (market.creatorId !== me.id && !atLeast(me.role, 'MODERATOR')) throw new UserError('Nur wer die Wette erstellt hat, kann sie absagen.');
  const { count } = await db.market.updateMany({ where: { id: marketId, status: 'open' }, data: { status: 'cancelled' } });
  if (!count) throw new UserError('Wette ist schon entschieden.');
  for (const b of await db.marketBet.findMany({ where: { marketId } })) await cancelBet(b.userId, Number(b.amount), 'market');
  return 'Wette abgesagt – alle Einsätze sind zurück.';
}
