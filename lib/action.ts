import 'server-only';

import { headers } from 'next/headers';
import { unstable_rethrow } from 'next/navigation';
import { z } from 'zod';

import { UserError } from './hub';
import { createLimiter } from './limiter';

export type ActionState = { error?: string; success?: string } | undefined;

/** Runs a server action body and turns UserErrors into form state. */
export async function run(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const success = await fn();
    return success ? { success } : {};
  } catch (err) {
    unstable_rethrow(err); // let redirect() and notFound() through
    if (err instanceof UserError) return { error: err.message };
    console.error(err);
    return { error: 'Serverfehler – bitte später nochmal versuchen.' };
  }
}

export function parse<S extends z.ZodTypeAny>(schema: S, data: FormData | Record<string, unknown>): z.infer<S> {
  const result = schema.safeParse(data instanceof FormData ? Object.fromEntries(data) : data);
  if (!result.success) throw new UserError(result.error.issues[0]?.message ?? 'Ungültige Eingabe.');
  return result.data;
}

// One limiter per rule name, on globalThis because Next may load this module more than once.
const g = globalThis as typeof globalThis & { __limiters?: Map<string, ReturnType<typeof createLimiter>> };
const limiters = (g.__limiters ??= new Map());

// shortcut: in-memory, per process; fine for one server, use Redis when scaling out.
/** Limits a rule per client address, or per `key` (user id, username) when given. */
export async function rateLimit(name: string, max: number, windowMs: number, key?: string) {
  if (process.env.RATE_LIMIT_OFF) return; // click tests register many accounts from one address
  const who = key ?? (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  const id = `${name}:${max}:${windowMs}`;
  let limiter = limiters.get(id);
  if (!limiter) limiters.set(id, (limiter = createLimiter(max, windowMs)));
  if (!limiter.hit(who)) throw new UserError('Zu viele Versuche – bitte kurz warten.');
}

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[a-zA-Z0-9_]{3,20}$/, 'Benutzername: 3–20 Zeichen, nur Buchstaben, Zahlen und _.');
export const passwordSchema = z.string().min(8, 'Passwort: mindestens 8 Zeichen.').max(100);
