import Link from 'next/link';

export default function AGBPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-gray-300 py-16 px-4 sm:px-6 lg:px-8 relative overflow-hidden flex justify-center">
      {/* Ambient Cyberpunk Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[500px] bg-cyan-900/20 blur-[120px] rounded-full pointer-events-none" />
      
      <div className="relative w-full max-w-4xl rounded-3xl border border-white/5 bg-black/40 backdrop-blur-xl p-8 md:p-12 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-12 border-b border-white/10 pb-8">
          <h1 className="text-3xl md:text-4xl font-black tracking-tighter text-white uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
            Allgemeine Geschäftsbedingungen
          </h1>
          <Link 
            href="/" 
            className="shrink-0 text-xs font-bold text-cyan-400 hover:text-cyan-300 transition-all uppercase tracking-[0.2em] px-6 py-3 rounded-lg border border-cyan-400/20 hover:border-cyan-400 hover:bg-cyan-400/10 hover:shadow-[0_0_15px_rgba(34,211,238,0.2)]"
          >
            Zurück zum Vault
          </Link>
        </div>

        <div className="space-y-10 text-base md:text-lg leading-relaxed text-gray-400">
          <section>
            <h2 className="text-xl font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-3">
              <span className="w-8 h-[2px] bg-cyan-400/50 inline-block"></span>
              1. Geltungsbereich
            </h2>
            <p className="pl-11">Diese AGB regeln die Nutzung der Neon Vault Plattform und aller zugehörigen Dienste.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-3">
              <span className="w-8 h-[2px] bg-cyan-400/50 inline-block"></span>
              2. Simulationscharakter
            </h2>
            <p className="pl-11">Neon Vault verwendet ausschließlich virtuelle Ingame-Währung ohne Echtgeld-Auszahlung.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-3">
              <span className="w-8 h-[2px] bg-cyan-400/50 inline-block"></span>
              3. Nutzerkonto
            </h2>
            <p className="pl-11">Nutzer sind für die Sicherheit ihrer Zugangsdaten verantwortlich. Missbrauch kann zur Sperrung führen.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-3">
              <span className="w-8 h-[2px] bg-cyan-400/50 inline-block"></span>
              4. Verhaltensregeln
            </h2>
            <p className="pl-11">Belästigende, beleidigende oder betrügerische Inhalte sind untersagt und können sanktioniert werden.</p>
          </section>
          <section>
            <h2 className="text-xl font-bold text-cyan-400 uppercase tracking-widest mb-4 flex items-center gap-3">
              <span className="w-8 h-[2px] bg-cyan-400/50 inline-block"></span>
              5. Änderungen und Verfügbarkeit
            </h2>
            <p className="pl-11">Funktionen können angepasst, erweitert oder eingestellt werden. Es besteht kein Anspruch auf dauerhafte Verfügbarkeit.</p>
          </section>
        </div>
      </div>
    </main>
  );
}
