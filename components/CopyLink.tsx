'use client';

import { Copy } from 'lucide-react';
import toast from 'react-hot-toast';

export function CopyLink({ url }: { url: string }) {
  const copy = async () => {
    // navigator.share opens the phone's share sheet (WhatsApp etc.); fall back to the clipboard.
    if (navigator.share) return void navigator.share({ title: 'Neon Vault', url }).catch(() => {});
    await navigator.clipboard.writeText(url);
    toast.success('Link kopiert.');
  };
  return (
    <div className="flex gap-2">
      <input className="input num text-xs" value={url} readOnly onFocus={(e) => e.target.select()} />
      <button type="button" className="btn-secondary" onClick={copy}>
        <Copy size={15} /> Teilen
      </button>
    </div>
  );
}
