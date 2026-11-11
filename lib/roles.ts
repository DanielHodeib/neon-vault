import type { Role } from '@prisma/client';

export const ROLES: Role[] = ['USER', 'SUPPORT', 'MODERATOR', 'ADMIN', 'OWNER'];

export const atLeast = (role: Role, min: Role) => ROLES.indexOf(role) >= ROLES.indexOf(min);

/** Staff can only act on people strictly below them. */
export const canManage = (actor: Role, target: Role) => ROLES.indexOf(actor) > ROLES.indexOf(target);

export const ROLE_STYLE: Record<Role, string> = {
  OWNER: 'border-gold/40 text-gold',
  ADMIN: 'border-loss/40 text-loss',
  MODERATOR: 'border-sky-400/40 text-sky-300',
  SUPPORT: 'border-win/40 text-win',
  USER: '',
};
