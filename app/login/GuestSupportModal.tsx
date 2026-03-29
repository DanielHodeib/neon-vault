'use client';

import { FormEvent, useState } from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  initialReason?: 'password' | 'support';
};

const CATEGORY_OPTIONS = ['Password Reset', 'Account Access', 'Security', 'Bug Report', 'Billing', 'Other'];

export default function GuestSupportModal({ open, onClose, initialReason = 'support' }: Props) {
  const [username, setUsername] = useState('');
  const [guestContact, setGuestContact] = useState('');
  const [category, setCategory] = useState(initialReason === 'password' ? 'Password Reset' : CATEGORY_OPTIONS[0]);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState('');

  if (!open) {
    return null;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice('');

    if (!guestContact.trim() || !category.trim() || !message.trim()) {
      setNotice('Contact, category and message are required.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/support/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestUsername: username.trim(),
          guestContact: guestContact.trim(),
          category: category.trim(),
          message: message.trim(),
        }),
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setNotice(payload.error ?? 'Could not submit support request.');
        return;
      }

      setNotice('Request submitted. Staff will contact you shortly.');
      setTimeout(() => {
        setUsername('');
        setGuestContact('');
        setCategory(initialReason === 'password' ? 'Password Reset' : CATEGORY_OPTIONS[0]);
        setMessage('');
        onClose();
      }, 800);
    } catch {
      setNotice('Support service unavailable.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-[95vw] max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-slate-100">Guest Support</h3>
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-lg border border-slate-700 px-2 text-xs font-bold uppercase text-slate-300"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Username (optional)</label>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value.slice(0, 40))}
              className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-500"
              placeholder="player_one"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Discord / Email for reply</label>
            <input
              value={guestContact}
              onChange={(event) => setGuestContact(event.target.value.slice(0, 160))}
              className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-500"
              placeholder="discord#1234 or your@email.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Category</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100 outline-none focus:border-cyan-500"
            >
              {CATEGORY_OPTIONS.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Message</label>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value.slice(0, 4000))}
              className="h-28 w-full resize-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
              placeholder="Describe your issue"
            />
          </div>

          {notice ? <p className="text-xs text-cyan-300">{notice}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="h-10 w-full rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-xs font-bold uppercase text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-60"
          >
            {submitting ? 'Sending...' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  );
}
