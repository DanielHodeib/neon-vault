'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Props {
  initialAvatarUrl: string;
  initialBannerUrl: string;
  initialBio: string;
}

export default function ProfileEditClient({ initialAvatarUrl, initialBannerUrl, initialBio }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [bannerUrl, setBannerUrl] = useState(initialBannerUrl);
  const [bio, setBio] = useState(initialBio);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setNotice('');
    try {
      const res = await fetch('/api/profile/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarUrl, bannerUrl, bio }),
      });
      const payload = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setNotice(payload.error ?? 'Save failed.'); return; }
      setNotice('Saved!');
      setOpen(false);
      router.refresh();
    } catch {
      setNotice('Network error.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-colors"
      >
        <Pencil size={13} /> Edit Profile
      </button>

      <AnimatePresence>
        {open ? (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-md rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-6 shadow-2xl"
              style={{ boxShadow: '0 0 60px rgba(34,211,238,0.12), 0 25px 50px rgba(0,0,0,0.6)' }}
            >
              <button
                onClick={() => setOpen(false)}
                className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>

              <h2 className="text-xl font-bold text-slate-100 mb-5">Edit Profile</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1.5">Avatar URL</label>
                  <input
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-slate-100 text-sm outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition placeholder-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1.5">Banner URL</label>
                  <input
                    value={bannerUrl}
                    onChange={(e) => setBannerUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full h-10 rounded-lg border border-white/10 bg-white/5 px-3 text-slate-100 text-sm outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition placeholder-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1.5">Bio <span className="text-slate-600 normal-case">({bio.length}/160)</span></label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value.slice(0, 160))}
                    rows={3}
                    placeholder="Tell the casino who you are..."
                    className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-slate-100 text-sm outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition resize-none placeholder-slate-600"
                  />
                </div>
              </div>

              {notice ? <p className="mt-3 text-sm text-cyan-300">{notice}</p> : null}

              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setOpen(false)}
                  className="flex-1 h-10 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 h-10 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-bold transition-colors shadow-lg shadow-cyan-500/20"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
