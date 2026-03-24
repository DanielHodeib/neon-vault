'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { FormEvent, useState } from 'react';

export default function RegisterForm() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedUsername = username.trim();

    if (trimmedUsername.length < 3) {
      setError('Username must be at least 3 characters long.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: trimmedUsername, password }),
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setLoading(false);
      setError(payload.error ?? 'Registration failed.');
      return;
    }

    setSuccess('Account created. Logging you in...');

    const loginResult = await signIn('credentials', {
      username: trimmedUsername,
      password,
      redirect: false,
    });

    setLoading(false);

    if (!loginResult || loginResult.error) {
      router.push('/login');
      return;
    }

    router.push('/');
    router.refresh();
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(56,189,248,0.16),transparent_35%),radial-gradient(circle_at_15%_75%,rgba(71,85,105,0.22),transparent_38%),linear-gradient(120deg,#020617,#0b1222_45%,#111827)]" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background:radial-gradient(rgba(148,163,184,0.35)_1px,transparent_1px)] [background-size:22px_22px]" />

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl items-center px-6 py-10">
        <div className="w-full rounded-3xl border border-slate-800/85 bg-slate-900/75 p-7 shadow-2xl shadow-black/40 backdrop-blur-xl md:p-10">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-300">Create Your Profile</p>
              <h1 className="mt-2 text-3xl font-black uppercase tracking-tight text-slate-50 md:text-4xl">Register</h1>
            </div>
            <Link href="/login" className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-500 hover:text-cyan-200">
              Already have account
            </Link>
          </div>

          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label htmlFor="username" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="neon_player"
                className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/85 px-4 text-slate-100 outline-none transition focus:border-cyan-500"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Min. 8 chars"
                className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/85 px-4 text-slate-100 outline-none transition focus:border-cyan-500"
              />
            </div>

            <div>
              <label htmlFor="confirmPassword" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Repeat password"
                className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/85 px-4 text-slate-100 outline-none transition focus:border-cyan-500"
              />
            </div>

            {error ? <p className="md:col-span-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}
            {success ? <p className="md:col-span-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{success}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="md:col-span-2 h-12 rounded-xl bg-cyan-500 font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
