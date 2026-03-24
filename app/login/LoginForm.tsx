'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { FormEvent, useState } from 'react';

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!username.trim() || !password) {
      setError('Please enter username and password.');
      return;
    }

    setLoading(true);
    setError('');

    const result = await signIn('credentials', {
      username: username.trim(),
      password,
      redirect: false,
    });

    setLoading(false);

    if (!result || result.error) {
      setError('Invalid credentials.');
      return;
    }

    router.push('/');
    router.refresh();
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(56,189,248,0.2),transparent_38%),radial-gradient(circle_at_85%_10%,rgba(148,163,184,0.12),transparent_34%),radial-gradient(circle_at_50%_85%,rgba(15,23,42,0.65),transparent_56%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />

      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-6xl items-center px-6 py-10">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-800/80 bg-slate-900/65 p-8 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <p className="mb-5 inline-flex items-center rounded-full border border-cyan-500/35 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">
              Neon Vault Access
            </p>
            <h1 className="text-4xl font-black uppercase tracking-tight text-slate-50 md:text-5xl">
              Enter The Table
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-300 md:text-base">
              Log in to your persistent wallet, real-time casino feed, and upcoming multiplayer rooms.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              <Stat label="Latency" value="24ms" />
              <Stat label="Connected" value="1.2k" />
              <Stat label="Tables" value="42" />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800/90 bg-slate-900/80 p-7 shadow-2xl shadow-black/40 backdrop-blur-xl md:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-50">Login</h2>
            <p className="mt-1 text-sm text-slate-400">Use your username and password.</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="username" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/85 px-4 text-slate-100 outline-none transition focus:border-cyan-500"
                  placeholder="player_one"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 w-full rounded-xl border border-slate-700 bg-slate-950/85 px-4 text-slate-100 outline-none transition focus:border-cyan-500"
                  placeholder="••••••••"
                />
              </div>

              {error ? <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p> : null}

              <button
                type="submit"
                disabled={loading}
                className="h-12 w-full rounded-xl bg-cyan-500 font-bold uppercase tracking-wide text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>

            <p className="mt-5 text-sm text-slate-400">
              New to Neon Vault?{' '}
              <Link href="/register" className="font-semibold text-cyan-300 hover:text-cyan-200">
                Create account
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/55 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-xl font-bold text-slate-100">{value}</p>
    </div>
  );
}
