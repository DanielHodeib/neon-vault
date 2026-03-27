'use client';

import Link from 'next/link';

export default function CorporateFooter() {
  const currentYear = new Date().getFullYear();
  const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME || 'Vault AG';
  const copyrightYear = process.env.NEXT_PUBLIC_COPYRIGHT_YEAR || currentYear;

  return (
    <footer className="fixed bottom-0 left-0 w-full bg-slate-950 border-t border-slate-800/60 py-6 md:py-8 px-4 md:px-12 z-30">
      <div className="mx-auto max-w-full">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-8 text-[11px] md:text-xs text-slate-500 leading-relaxed">
          {/* Section 1: Corporate & Address */}
          <div className="space-y-2 md:col-span-2">
            <p className="font-semibold text-slate-300">© {copyrightYear} {companyName}. All rights reserved.</p>
            <p className="text-[10px] md:text-xs leading-snug">
              {companyName} Casino is operated by {companyName}, a company registered under the laws of Curaçao, company number 165432/REG, with its registered address at Heerenstraat 23, Willemstad, Curaçao.
            </p>
            <p className="text-[10px] md:text-xs leading-snug">
              {companyName} Casino operates under eGaming License Number 8048/JAZ2026-001 issued on January 1st, 2026, authorized and regulated by the Curaçao Gaming Control Commission (CGCC). Rigorous verification has been conducted to ensure the integrity and security of all gambling activities.
            </p>
          </div>

          {/* Section 2 & 3: Licensing & Responsible Gambling */}
          <div className="space-y-2 md:col-span-1">
            <div className="space-y-1">
              <p className="font-semibold text-slate-300 text-[10px] md:text-xs">Licensed & Certified</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href="#curacao-license"
                  className="inline-block px-2 py-1 rounded border border-slate-700 bg-slate-900/40 hover:bg-slate-800/60 hover:text-cyan-300 transition-colors"
                  title="Curaçao eGaming License 8048/JAZ2026-001"
                >
                  CGCC Licensed
                </a>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800/40">
              <p className="font-semibold text-red-400/80 text-[10px] md:text-xs mb-1 flex items-center gap-1">
                ⚠️ 18+ Only
              </p>
              <p className="text-[10px] leading-tight text-slate-600">
                Warning: Our service is strictly for <strong>entertainment</strong> and is only accessible to persons <strong>18+ years of age</strong>.
              </p>
            </div>
          </div>

          {/* Section 4: Responsible Gambling & Legal Links */}
          <div className="space-y-2 md:col-span-1">
            <div className="space-y-1">
              <p className="font-semibold text-slate-300 text-[10px] md:text-xs">Responsible Gaming</p>
              <p className="text-[10px] leading-tight text-slate-600">
                Gambling can be <strong>addictive</strong>. Know your limits. For help: <a href="https://www.begambleaware.org" target="_blank" rel="noopener" className="text-cyan-300/70 hover:text-cyan-300">BeGambleAware</a>, <a href="https://www.gamblersanonymous.org" target="_blank" rel="noopener" className="text-cyan-300/70 hover:text-cyan-300">GA</a>.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] md:text-xs pt-1 border-t border-slate-800/40">
              <Link href="/agb" className="text-slate-400 hover:text-cyan-300 transition-colors">
                AGB
              </Link>
              <span className="text-slate-700">|</span>
              <Link href="/impressum" className="text-slate-400 hover:text-cyan-300 transition-colors">
                Impressum
              </Link>
              <span className="text-slate-700">|</span>
              <Link href="/privacy" className="text-slate-400 hover:text-cyan-300 transition-colors">
                Privacy
              </Link>
              <span className="text-slate-700">|</span>
              <a href="#cookies" className="text-slate-400 hover:text-cyan-300 transition-colors">
                Cookies
              </a>
            </div>
          </div>
        </div>

        {/* Bottom divider line */}
        <div className="mt-4 md:mt-5 pt-3 md:pt-4 border-t border-slate-800/40 text-center text-[9px] text-slate-600">
          <p>Vault Casino operates in Curaçao. All transactions are processed in virtual currency (NVC) for simulation purposes only. No real money is wagered or won.</p>
        </div>
      </div>
    </footer>
  );
}
