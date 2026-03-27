export type UserRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'SUPPORT' | 'USER' | string;

export function getRoleBadge(role?: UserRole | null) {
  const normalized = String(role ?? '')
    .trim()
    .toUpperCase();

  if (normalized === 'OWNER') {
    return {
      label: 'OWNER',
      className:
        'inline-flex items-center h-5 px-2 rounded-full border text-[10px] font-bold uppercase tracking-wide border-amber-400/60 bg-gradient-to-r from-red-500/20 to-amber-500/20 text-amber-200',
    };
  }

  if (normalized === 'ADMIN') {
    return {
      label: 'ADMIN',
      className:
        'inline-flex items-center h-5 px-2 rounded-full border text-[10px] font-bold uppercase tracking-wide border-red-500/50 bg-red-500/10 text-red-300',
    };
  }

  if (normalized === 'MODERATOR') {
    return {
      label: 'MODERATOR',
      className:
        'inline-flex items-center h-5 px-2 rounded-full border text-[10px] font-bold uppercase tracking-wide border-blue-500/50 bg-blue-500/10 text-blue-300',
    };
  }

  if (normalized === 'SUPPORT') {
    return {
      label: 'SUPPORT',
      className:
        'inline-flex items-center h-5 px-2 rounded-full border text-[10px] font-bold uppercase tracking-wide border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
    };
  }

  return null;
}