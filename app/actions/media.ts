'use server';

import { refresh } from 'next/cache';

import { rateLimit } from '@/lib/action';
import { requireUser } from '@/lib/auth';
import { db, UserError } from '@/lib/hub';
import { sniffImage } from '@/lib/media';

const MAX_BYTES = 900_000; // the client resizes first; this is a hard cap

/** Stores an uploaded avatar or banner and points the profile at it right away. */
export async function uploadImage(kind: 'avatar' | 'banner', form: FormData) {
  try {
    const user = await requireUser();
    if (kind !== 'avatar' && kind !== 'banner') throw new UserError('Unbekannter Bildtyp.');
    await rateLimit('upload', 20, 60 * 60_000);
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) throw new UserError('Keine Datei.');
    if (file.size > MAX_BYTES) throw new UserError('Bild ist zu groß (max. 900 KB).');
    const data = new Uint8Array(await file.arrayBuffer());
    const mime = sniffImage(data); // trust the bytes, not the browser's file type
    if (!mime) throw new UserError('Nur JPG, PNG, WebP oder GIF.');

    // Replace the old image with a fresh id so cached copies of the old URL don't stick around.
    const media = await db.$transaction(async (tx) => {
      await tx.media.deleteMany({ where: { userId: user.id, kind } });
      return tx.media.create({ data: { userId: user.id, kind, mime, data } });
    });
    const url = `/media/${media.id}`;
    await db.user.update({ where: { id: user.id }, data: kind === 'avatar' ? { avatarUrl: url } : { bannerUrl: url } });
    refresh();
    return { ok: true as const, url };
  } catch (err) {
    if (err instanceof UserError) return { ok: false as const, error: err.message };
    throw err;
  }
}
