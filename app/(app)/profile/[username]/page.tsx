import { Lock } from 'lucide-react';
import { notFound } from 'next/navigation';

import { sendFriendRequest } from '@/app/actions/social';
import { ActionForm, Avatar, Coins, RankTag, RoleBadge, Section, Stat, SubmitButton } from '@/components/ui';
import { ZoomImage } from '@/components/ZoomImage';
import { achievements } from '@/lib/achievements';
import { requireUser } from '@/lib/auth';
import { shopItem } from '@/lib/shop';
import { playerStats } from '@/lib/stats';
import { coins, GAME_NAMES, timeAgo } from '@/lib/format';
import { db, hub } from '@/lib/hub';
import { displayRank, levelOf } from '@/lib/ranks';

export async function generateMetadata({ params }: PageProps<'/profile/[username]'>) {
  return { title: decodeURIComponent((await params).username) };
}

export default async function ProfilePage({ params }: PageProps<'/profile/[username]'>) {
  const me = await requireUser();
  const user = await db.user.findUnique({ where: { username: decodeURIComponent((await params).username) } });
  if (!user) notFound();
  const isMe = user.id === me.id;

  if (!user.publicProfile && !isMe) {
    return (
      <div className="card mx-auto mt-10 max-w-sm text-center">
        <Lock className="mx-auto text-faint" />
        <p className="mt-3 text-sm text-muted">{user.username} hat ein privates Profil.</p>
      </div>
    );
  }

  const [favorite, history, friends, ownerFriend] = await Promise.all([
    db.ledgerEntry.groupBy({ by: ['game'], where: { userId: user.id, kind: 'BET' }, _count: true, orderBy: { _count: { game: 'desc' } }, take: 1 }),
    user.showHistory || isMe ? db.ledgerEntry.findMany({ where: { userId: user.id, kind: { in: ['BET', 'WIN'] } }, orderBy: { createdAt: 'desc' }, take: 15 }) : [],
    db.friendship.count({ where: { accepted: true, OR: [{ fromId: user.id }, { toId: user.id }] } }),
    db.friendship.count({ where: { accepted: true, OR: [{ fromId: user.id, to: { role: 'OWNER' } }, { toId: user.id, from: { role: 'OWNER' } }] } }),
  ]);
  const badges = achievements((await playerStats(user.id)).stats).filter((a) => a.done);
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
              {shopItem(user.title) && <span className="rounded bg-raised px-2 py-0.5 text-xs font-semibold text-gold">{shopItem(user.title)!.name}</span>}
              <RoleBadge role={user.role} />
              <RankTag rank={rank} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-win' : 'bg-line-strong'}`} />
              {online ? online.activity : 'offline'} · {friends} Freunde · seit {user.createdAt.toLocaleDateString('de-DE')}
            </p>
          </div>
          {!isMe && (
            <ActionForm action={sendFriendRequest}>
              <input type="hidden" name="username" value={user.username} />
              <SubmitButton className="btn-secondary w-full sm:w-auto">Freund hinzufügen</SubmitButton>
            </ActionForm>
          )}
        </div>
        {user.bio && <p className="border-t border-line px-4 py-4 text-sm whitespace-pre-wrap text-fg/90 sm:px-6">{user.bio}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Level"><span className="num">{levelOf(user.xp)}</span></Stat>
        <Stat label="XP"><span className="num">{coins(user.xp)}</span></Stat>
        <Stat label="Lieblingsspiel">{GAME_NAMES[favorite[0]?.game ?? ''] ?? '–'}</Stat>
        <Stat label="Guthaben">{user.showBalance || isMe ? <Coins value={Number(user.balance)} /> : <span className="text-faint">privat</span>}</Stat>
      </div>

      {badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((a) => (
            <span key={a.key} title={a.description} className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold">
              {a.title}
            </span>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <Section title="Letzte Spiele">
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between px-4 py-2.5 text-sm">
                <span>
                  {GAME_NAMES[h.game ?? ''] ?? h.game} <span className="text-xs text-faint">· {timeAgo(h.createdAt)}</span>
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
