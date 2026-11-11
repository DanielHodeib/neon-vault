import { db } from '@/lib/hub';

export async function GET(_req: Request, ctx: RouteContext<'/media/[id]'>) {
  const media = await db.media.findUnique({ where: { id: (await ctx.params).id }, select: { mime: true, data: true } });
  if (!media) return new Response('Not found', { status: 404 });
  return new Response(media.data, {
    headers: {
      'Content-Type': media.mime,
      // A new upload gets a new id, so this URL never changes content.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
