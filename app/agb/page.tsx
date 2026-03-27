import Link from 'next/link';

export default function AGBPage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-6 py-12">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/70 p-6 md:p-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-3xl font-black tracking-tight">Allgemeine Geschaftsbedingungen (AGB)</h1>
          <Link href="/" className="text-sm text-cyan-300 hover:text-cyan-200">
            Back
          </Link>
        </div>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-slate-300">
          <section>
            <h2 className="text-lg font-bold text-slate-100">1. Geltungsbereich</h2>
            <p>Diese AGB regeln die Nutzung der Neon Vault Plattform und aller zugehorigen Dienste.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-100">2. Simulationscharakter</h2>
            <p>Neon Vault verwendet ausschliesslich virtuelle Ingame-Wahrung ohne Echtgeld-Auszahlung.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-100">3. Nutzerkonto</h2>
            <p>Nutzer sind fur die Sicherheit ihrer Zugangsdaten verantwortlich. Missbrauch kann zur Sperrung fuhren.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-100">4. Verhaltensregeln</h2>
            <p>Belastigende, beleidigende oder betrugerische Inhalte sind untersagt und konnen sanktioniert werden.</p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-slate-100">5. Anderungen und Verfugbarkeit</h2>
            <p>Funktionen konnen angepasst, erweitert oder eingestellt werden. Es besteht kein Anspruch auf dauerhafte Verfugbarkeit.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
