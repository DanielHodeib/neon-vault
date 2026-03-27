import Link from 'next/link';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/70 p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-black tracking-tight">Datenschutzerklarung</h1>
          <Link href="/" className="text-sm text-cyan-300 hover:text-cyan-200">
            Back
          </Link>
        </div>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-slate-300">
          <section>
            <h2 className="text-lg font-bold text-slate-100">1. Erhobene Daten</h2>
            <p>Wir verarbeiten Konto-, Nutzungs- und Supportdaten, soweit dies fur den Betrieb der Plattform erforderlich ist.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-100">2. Zweck der Verarbeitung</h2>
            <p>Die Datenverarbeitung dient Authentifizierung, Sicherheit, Stabilitat, Kundenservice und Produktverbesserung.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-100">3. Speicherung und Loschung</h2>
            <p>Daten werden nur so lange gespeichert, wie dies fur den jeweiligen Zweck oder rechtliche Pflichten notwendig ist.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-100">4. Rechte betroffener Personen</h2>
            <p>Sie konnen Auskunft, Berichtigung, Loschung sowie weitere Datenschutzrechte nach geltendem Recht geltend machen.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
