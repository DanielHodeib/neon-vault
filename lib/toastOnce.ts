import toast from 'react-hot-toast';

const last = new Map<string, number>();
const ON_SCREEN_MS = 4000; // react-hot-toast keeps an error for about 4 s

/** Error toast that shows each message once: while it is still on screen, repeats are dropped (no spam). */
export function errorToast(message: string) {
  const now = Date.now();
  if (now - (last.get(message) ?? 0) < ON_SCREEN_MS) return;
  last.set(message, now);
  toast.error(message);
}
