import { db } from '@/lib/hub';

/** Uploaded fun-effect sounds and images (admin → Spaß). Logged-in pages only play them. */
export async function GET(_req: Request, ctx: RouteContext<'/fx/[id]'>) {
  const asset = await db.fxAsset.findUnique({ where: { id: (await ctx.params).id }, select: { mime: true, data: true } });
  if (!asset) return new Response('Not found', { status: 404 });
  return new Response(asset.data, {
    headers: {
      'Content-Type': asset.mime,
      'Cache-Control': 'public, max-age=31536000, immutable', // assets are never edited, only deleted
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}
