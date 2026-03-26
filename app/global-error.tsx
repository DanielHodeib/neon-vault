'use client';

import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Global error boundary:', error);
  }, [error]);

  return (
    <html>
      <body className="min-h-screen bg-slate-950">
        <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-6 text-center">
          <div className="max-w-xl rounded-2xl border border-slate-800 bg-slate-900/70 p-8 shadow-2xl shadow-black/40">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-300">
              <AlertTriangle size={24} />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-100">🛠️ Casino-Wartung</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              Wir kalibrieren die Server. Bitte lade die Seite in ein paar Minuten neu.
            </p>
            <button
              onClick={() => reset()}
              className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-500"
            >
              <RefreshCcw size={16} />
              Seite neu laden
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
