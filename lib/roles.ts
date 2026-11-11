import type { Role } from '@prisma/client';

export const ROLES: Role[] = ['USER', 'SUPPORT', 'MODERATOR', 'ADMIN', 'OWNER'];

export const atLeast = (role: Role, min: Role) => ROLES.indexOf(role) >= ROLES.indexOf(min);

/** Staff can only act on people strictly below them. */
export const canManage = (actor: Role, target: Role) => ROLES.indexOf(actor) > ROLES.indexOf(target);

export const ROLE_STYLE: Record<Role, string> = {
  OWNER: 'border-amber-400/60 text-amber-200 bg-amber-500/15',
  ADMIN: 'border-red-500/50 text-red-300 bg-red-500/10',
  MODERATOR: 'border-blue-500/50 text-blue-300 bg-blue-500/10',
  SUPPORT: 'border-emerald-500/50 text-emerald-300 bg-emerald-500/10',
  USER: '',
};
