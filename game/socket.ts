import type { Role } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';

import { hub, UserError } from '@/lib/hub';
import { atLeast } from '@/lib/roles';

export type Player = { id: string; username: string; role: Role };
export type Ack = (res: Record<string, unknown>) => void;
export type GameSocket = Socket & { data: { user: Player; hits: number; windowStart: number } };
export type Register = (io: Server, socket: GameSocket) => void;

const MAX_EVENTS_PER_SECOND = 15;

/** Runs after every successful event (game/watch.ts reports finished rounds to friends watching). */
let afterEvent: ((socket: GameSocket, event: string, data: unknown, result: unknown) => void) | null = null;
export const onAfterEvent = (fn: NonNullable<typeof afterEvent>) => void (afterEvent = fn);

function rateLimited(socket: GameSocket) {
  const now = Date.now();
  if (now - socket.data.windowStart > 1000) Object.assign(socket.data, { windowStart: now, hits: 0 });
  return ++socket.data.hits > MAX_EVENTS_PER_SECOND;
}

/**
 * Validated, rate-limited socket handler. Thrown UserErrors go back to the
 * client as `{ ok: false, error }`; anything else is logged.
 * `play: true` blocks the action during maintenance (staff excepted).
 */
export function handle<S extends z.ZodTypeAny>(
  socket: GameSocket,
  event: string,
  schema: S,
  fn: (data: z.infer<S>) => unknown,
  { play = false } = {},
) {
  socket.on(event, async (raw: unknown, ack?: Ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      if (rateLimited(socket)) throw new UserError('Zu viele Aktionen – kurz warten.');
      if (play && hub.maintenance.on && !atLeast(socket.data.user.role, 'SUPPORT')) throw new UserError('Wartungsmodus aktiv.');
      const parsed = schema.safeParse(raw ?? {});
      if (!parsed.success) throw new UserError('Ungültige Eingabe.');
      const result = await fn(parsed.data);
      reply({ ok: true, ...(result as object) });
      afterEvent?.(socket, event, parsed.data, result);
    } catch (err) {
      if (!(err instanceof UserError)) console.error(`[socket ${event}]`, err);
      reply({ ok: false, error: err instanceof UserError ? err.message : 'Serverfehler.' });
    }
  });
}

export const amount = z.number().int().positive();
export const empty = z.object({}).passthrough();
