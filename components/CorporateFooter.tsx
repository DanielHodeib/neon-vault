'use client';

import Link from 'next/link';

export default function CorporateFooter({ className = '' }: { className?: string }) {
  const currentYear = new Date().getFullYear();
  const companyName = process.env.NEXT_PUBLIC_COMPANY_NAME || 'Vault AG';
  const copyrightYear = process.env.NEXT_PUBLIC_COPYRIGHT_YEAR || currentYear;

  return (
    <footer className={`w-full bg-slate-950 border-t border-slate-800/40 py-2 px-4 ${className}`.trim()}>
      <div className="mx-auto max-w-full">
        <div className="flex flex-col gap-1 text-[10px] leading-tight text-slate-600 md:flex-row md:items-center md:justify-between md:gap-3">
          <div className="min-w-0 md:flex-1">
            <p className="truncate text-[10px] font-semibold text-slate-400">© {copyrightYear} {companyName}</p>
            <p className="truncate text-[10px] text-slate-700">
              Operated by {companyName}, Curaçao. eGaming License #8048/JAZ2026-001. CGCC regulated.
            </p>
          </div>

          <div className="flex items-center gap-1 text-[10px] md:justify-center md:px-2">
            <span className="text-[10px] font-semibold text-slate-400">Licensed</span>
            <a href="#curacao-license" className="rounded border border-slate-700/60 bg-slate-900/30 px-1.5 py-0.5 text-[10px] text-slate-600 transition-colors hover:bg-slate-800/50 hover:text-cyan-300" title="Curaçao eGaming License 8048/JAZ2026-001">
              CGCC
            </a>
          </div>

          <div className="flex items-center gap-1 text-[10px] md:flex-1 md:justify-end">
            <span className="font-semibold text-red-500/70">⚠ 18+</span>
            <span className="text-slate-700">Responsible Gaming</span>
            <span className="text-slate-800">|</span>
            <Link href="/agb" className="text-slate-600 transition-colors hover:text-cyan-400">AGB</Link>
            <span className="text-slate-800">|</span>
            <Link href="/impressum" className="text-slate-600 transition-colors hover:text-cyan-400">Impressum</Link>
            <span className="text-slate-800">|</span>
            <Link href="/privacy" className="text-slate-600 transition-colors hover:text-cyan-400">Privacy</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
