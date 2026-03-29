'use client';

import { Cog } from 'lucide-react';

function formatEndTime(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString();
}

export default function MaintenanceScreen({ maintenanceEndTime }: { maintenanceEndTime: string | null }) {
  const endLabel = formatEndTime(maintenanceEndTime);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-950 px-6 py-10 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(6,182,212,0.2),transparent_42%),radial-gradient(circle_at_80%_10%,rgba(30,64,175,0.2),transparent_35%),radial-gradient(circle_at_50%_90%,rgba(15,23,42,0.8),transparent_55%)]" />
      <div className="relative z-10 w-full max-w-2xl rounded-3xl border border-cyan-500/30 bg-slate-900/70 p-8 text-center shadow-[0_0_55px_rgba(6,182,212,0.22)] backdrop-blur-xl md:p-10">
        <div className="mx-auto mb-5 inline-flex h-20 w-20 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/10">
          <Cog size={38} className="animate-spin text-cyan-300" />
        </div>

        <h1 className="text-3xl font-black uppercase tracking-tight text-cyan-200 md:text-4xl">
          Wartungsarbeiten / System Update
        </h1>

        <p className="mt-4 text-sm text-slate-300 md:text-base">
          Das Casino ist aktuell im Wartungsmodus. Wir optimieren das System und sind gleich wieder da.
        </p>

        <div className="mt-6 rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-3">
          {endLabel ? (
            <p className="text-sm font-semibold text-amber-300">Voraussichtliches Ende: {endLabel}</p>
          ) : (
            <p className="text-sm font-semibold text-slate-300">Dauer: Unbekannt. Wir sind bald zuruck!</p>
          )}
        </div>
      </div>
    </div>
  );
}
