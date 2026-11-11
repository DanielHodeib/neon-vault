import { buyItem, equipItem } from '@/app/actions/shop';
import { FormButton } from '@/components/FormButton';
import { Avatar, PageHeader, Section } from '@/components/ui';
import { requireUser } from '@/lib/auth';
import { coins } from '@/lib/format';
import { db } from '@/lib/hub';
import { SHOP_ITEMS, SLOT_LABEL, type ShopSlot } from '@/lib/shop';
import { getT } from '@/lib/i18nServer';

export async function generateMetadata() {
  return { title: (await getT())('Shop') };
}

const SLOTS: ShopSlot[] = ['frame', 'title', 'nameEffect'];

export default async function ShopPage() {
  const t = await getT();
  const user = await requireUser();
  const owned = new Set((await db.shopPurchase.findMany({ where: { userId: user.id }, select: { item: true } })).map((p) => p.item));
  const balance = Number(user.balance);

  return (
    <>
      <PageHeader title="Shop" subtitle="Gib deine NVC für Rahmen, Titel und Namenseffekte aus. Alles bleibt dir für immer." />
      <div className="space-y-4">
        {SLOTS.map((slot) => (
          <Section key={slot} title={t(SLOT_LABEL[slot])} action={user[slot] && <FormButton action={equipItem.bind(null, slot, null)} className="btn-ghost h-8 text-xs">Ablegen</FormButton>}>
            <ul className="grid gap-px bg-line sm:grid-cols-2">
              {SHOP_ITEMS.filter((i) => i.slot === slot).map((item) => {
                const has = owned.has(item.id);
                const worn = user[slot] === item.id;
                return (
                  <li key={item.id} className="flex items-center gap-4 bg-surface px-4 py-4">
                    <div className="grid w-20 shrink-0 place-items-center">
                      {slot === 'frame' && <Avatar url={user.avatarUrl} name={user.username} size={48} frame={item.id} />}
                      {slot === 'title' && <span className="rounded bg-raised px-2 py-1 text-xs font-semibold text-gold">{t(item.name)}</span>}
                      {slot === 'nameEffect' && <span className={`text-sm font-semibold ${item.className}`}>{user.username}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{t(item.name)}</p>
                      <p className="text-xs text-muted">{t(item.description)}</p>
                    </div>
                    {worn ? (
                      <span className="chip-active">Angelegt</span>
                    ) : has ? (
                      <FormButton action={equipItem.bind(null, slot, item.id)} className="btn-secondary h-9 text-xs">Anlegen</FormButton>
                    ) : (
                      <FormButton
                        action={buyItem.bind(null, item.id)}
                        confirm={t('{item} für {n} NVC kaufen?', { item: t(item.name), n: coins(item.price) })}
                        disabled={balance < item.price}
                        className="btn-primary h-9 text-xs"
                      >
                        <span className="num">{coins(item.price)}</span>
                      </FormButton>
                    )}
                  </li>
                );
              })}
            </ul>
          </Section>
        ))}
      </div>
    </>
  );
}
