import Link from 'next/link';

export default function ImpressumPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/70 p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-black tracking-tight">Impressum</h1>
          <Link href="/" className="text-sm text-cyan-300 hover:text-cyan-200">
            Back
          </Link>
        </div>

        <div className="mt-6 space-y-4 text-sm leading-relaxed text-slate-300">
          <p>Angaben gemaess geltenden gesetzlichen Informationspflichten.</p>
          <p>
            Betreiber: Neon Vault Platform
            <br />
            Adresse: Musterstrasse 1, 12345 Musterstadt
            <br />
            E-Mail: legal@neonvault.example
          </p>
          <p>
            Verantwortlich fur Inhalte:
            <br />
            Neon Vault Team
          </p>
          <p>
            Haftungshinweis:
            <br />
            Trotz sorgfaltiger inhaltlicher Kontrolle ubernehmen wir keine Haftung fur externe Inhalte verlinkter Seiten.
          </p>
        </div>
      </div>
    </main>
  );
}
