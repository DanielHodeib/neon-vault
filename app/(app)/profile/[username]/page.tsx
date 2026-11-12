import { Lock } from 'lucide-react';
import { notFound } from 'next/navigation';

import { sendFriendRequest } from '@/app/actions/social';
import { ActionForm, Avatar, Coins, RankTag, RoleBadge, Section, Stat, SubmitButton } from '@/components/ui';
import { ZoomImage } from '@/components/ZoomImage';
import { LikeButton, ShowcaseEditor } from '@/components/Showcase';
import { GAME_BY_SLUG } from '@/components/gameCatalog';
import { achievements, ALL_GAMES } from '@/lib/achievements';
import { requireUser } from '@/lib/auth';
import { shopItem } from '@/lib/shop';
import { playerStats } from '@/lib/stats';
import { coins, GAME_NAMES, timeAgo } from '@/lib/format';
import { db, hub } from '@/lib/hub';
import { displayRank, levelOf } from '@/lib/ranks';
import { getT } from '@/lib/i18nServer';

export async function generateMetadata({ params }: PageProps<'/profile/[username]'>) {
  return { title: decodeURIComponent((await params).username) };
}

export default async function ProfilePage({ params }: PageProps<'/profile/[username]'>) {
  const t = await getT();
  const me = await requireUser();
  const user = await db.user.findUnique({ where: { username: decodeURIComponent((await params).username) } });
  if (!user) notFound();
  const isMe = user.id === me.id;

  if (!user.publicProfile && !isMe) {
    return (
      <div className="card mx-auto mt-10 max-w-sm text-center">
        <Lock className="mx-auto text-faint" />
        <p className="mt-3 text-sm text-muted">{t('{name} hat ein privates Profil.', { name: user.username })}</p>
      </div>
    );
  }

  const [favorite, history, friends, ownerFriend, likes, likedByMe, biggest, ps] = await Promise.all([
    db.ledgerEntry.groupBy({ by: ['game'], where: { userId: user.id, kind: 'BET' }, _count: true, orderBy: { _count: { game: 'desc' } }, take: 1 }),
    user.showHistory || isMe ? db.ledgerEntry.findMany({ where: { userId: user.id, kind: { in: ['BET', 'WIN'] } }, orderBy: { createdAt: 'desc' }, take: 15 }) : [],
    db.friendship.count({ where: { accepted: true, OR: [{ fromId: user.id }, { toId: user.id }] } }),
    db.friendship.count({ where: { accepted: true, OR: [{ fromId: user.id, to: { role: 'OWNER' } }, { toId: user.id, from: { role: 'OWNER' } }] } }),
    db.profileLike.count({ where: { toId: user.id } }),
    isMe ? false : db.profileLike.count({ where: { fromId: me.id, toId: user.id } }).then(Boolean),
    db.ledgerEntry.findFirst({ where: { userId: user.id, kind: 'WIN', game: { not: null } }, orderBy: { amount: 'desc' }, select: { amount: true, game: true, createdAt: true } }),
    playerStats(user.id),
  ]);
  const allBadges = achievements(ps.stats);
  const badges = allBadges.filter((a) => a.done);
  // Showcase: the pinned badges, or the first three earned ones.
  const pinnedKeys = (user.showcase ?? '').split(',').filter((k) => badges.some((b) => b.key === k));
  const showcase = pinnedKeys.length ? pinnedKeys.map((k) => badges.find((b) => b.key === k)!) : badges.slice(0, 3);
  const played = [...ps.games.entries()].filter(([, g]) => g.rounds > 0).sort((a, b) => b[1].rounds - a[1].rounds).slice(0, 6);
  const maxRounds = played[0]?.[1].rounds ?? 1;
  const rank = displayRank(user.rankTag, user.xp, Number(user.balance), ownerFriend > 0);
  const online = hub.online.get(user.id);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="panel overflow-hidden">
        <ZoomImage src={user.bannerUrl} label="Banner" className="block w-full">
          <div
            className="h-28 bg-raised bg-cover bg-center sm:h-40"
            style={user.bannerUrl ? { backgroundImage: `url(${JSON.stringify(user.bannerUrl)})` } : { backgroundImage: `linear-gradient(120deg, ${rank.color}33, transparent 70%)` }}
          />
        </ZoomImage>
        <div className="flex flex-col gap-4 px-4 pb-5 sm:flex-row sm:items-end sm:px-6">
          <ZoomImage src={user.avatarUrl} label="Avatar" className="relative -mt-10 block w-fit rounded-full border-4 border-surface sm:-mt-12">
            <Avatar url={user.avatarUrl} name={user.username} size={84} frame={user.frame} />
          </ZoomImage>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                {user.clanTag && <span className="text-faint">[{user.clanTag}] </span>}
                <span className={shopItem(user.nameEffect)?.className}>{user.username}</span>
              </h1>
              {shopItem(user.title) && <span className="rounded bg-raised px-2 py-0.5 text-xs font-semibold text-gold">{t(shopItem(user.title)!.name)}</span>}
              <RoleBadge role={user.role} />
              <RankTag rank={rank} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-win' : 'bg-line-strong'}`} />
              {online ? t(online.activity) : 'offline'} · {t('{n} Freunde', { n: friends })} · {t('seit {date}', { date: user.createdAt.toLocaleDateString('de-DE') })}
            </p>
          </div>
          <div className="flex gap-2">
            <LikeButton userId={user.id} liked={likedByMe} count={likes} self={isMe} />
            {!isMe && (
              <ActionForm action={sendFriendRequest}>
                <input type="hidden" name="username" value={user.username} />
                <SubmitButton className="btn-secondary w-full sm:w-auto">{t('Freund hinzufügen')}</SubmitButton>
              </ActionForm>
            )}
          </div>
        </div>
        {user.bio && <p className="border-t border-line px-4 py-4 text-sm whitespace-pre-wrap text-fg/90 sm:px-6">{user.bio}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Level"><span className="num">{levelOf(user.xp)}</span></Stat>
        <Stat label="XP"><span className="num">{coins(user.xp)}</span></Stat>
        <Stat label={t('Lieblingsspiel')}>{t(GAME_NAMES[favorite[0]?.game ?? ''] ?? '–')}</Stat>
        <Stat label="Guthaben">{user.showBalance || isMe ? <Coins value={Number(user.balance)} /> : <span className="text-faint">{t('privat')}</span>}</Stat>
      </div>

      <Section title={t('Vitrine')} action={<span className="text-xs text-faint">{t('{n} von {max} Abzeichen', { n: badges.length, max: allBadges.length })}</span>} pad>
        {showcase.length ? (
          <div className="grid grid-cols-3 gap-3">
            {showcase.map((a) => (
              <div key={a.key} className="showcase-badge relative overflow-hidden rounded-xl border border-gold/30 bg-gradient-to-b from-gold/15 to-transparent p-3 text-center">
                <span className="block text-3xl sm:text-4xl">{a.icon}</span>
                <span className="mt-1 block truncate text-xs font-semibold text-gold sm:text-sm">{t(a.title)}</span>
                <span className="hidden text-[11px] text-muted sm:block">{t(a.description, { n: ALL_GAMES })}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-faint">{t('Noch keine Abzeichen – die ersten kommen mit dem ersten Einsatz.')}</p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {allBadges.map((a) => (
            <span key={a.key} title={t(a.description, { n: ALL_GAMES })} className={`rounded-full border px-2.5 py-0.5 text-xs ${a.done ? 'border-gold/30 text-gold' : 'border-line text-faint opacity-60 grayscale'}`}>
              {a.icon} {t(a.title)}
            </span>
          ))}
        </div>
        {isMe && (
          <div className="mt-3">
            <ShowcaseEditor earned={badges.map(({ key, title, icon }) => ({ key, title, icon }))} pinned={showcase.map((a) => a.key)} />
          </div>
        )}
      </Section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title={t('Größter Gewinn')} pad>
          {biggest ? (
            <>
              <p className="num text-3xl font-bold text-gold">+{coins(biggest.amount)}</p>
              <p className="mt-1 text-sm text-muted">
                {t(GAME_NAMES[biggest.game ?? ''] ?? biggest.game ?? '')} · {t(timeAgo(biggest.createdAt))}
              </p>
            </>
          ) : (
            <p className="text-sm text-faint">{t('Noch kein Gewinn.')}</p>
          )}
        </Section>
        <Section title={t('Was {name} spielt', { name: user.username })} pad>
          {played.length ? (
            <ul className="space-y-2">
              {played.map(([game, g]) => {
                const entry = GAME_BY_SLUG.get(game);
                return (
                  <li key={game} className="text-xs">
                    <span className="mb-1 flex justify-between">
                      <span>{t(GAME_NAMES[game] ?? game)}</span>
                      <span className="num text-muted">{t('{n} Runden', { n: g.rounds })}</span>
                    </span>
                    <span className="block h-2 overflow-hidden rounded-full bg-raised">
                      <span className="grow-bar block h-full rounded-full" style={{ width: `${Math.max(4, (g.rounds / maxRounds) * 100)}%`, background: entry?.tint ?? 'var(--color-accent)' }} />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-faint">{t('Noch nichts gespielt.')}</p>
          )}
        </Section>
      </div>

      {history.length > 0 && (
        <Section title={t('Letzte Spiele')}>
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between px-4 py-2.5 text-sm">
                <span>
                  {t(GAME_NAMES[h.game ?? ''] ?? h.game ?? '')} <span className="text-xs text-faint">· {t(timeAgo(h.createdAt))}</span>
                </span>
                <span className={`num ${h.amount > 0 ? 'text-win' : 'text-muted'}`}>{h.amount > 0 ? '+' : ''}{coins(h.amount)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
