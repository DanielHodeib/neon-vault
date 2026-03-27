import Link from 'next/link';

export default function LegalFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 ${className}`.trim()}>
      <span className="text-slate-500">Legal</span>
      <Link href="/agb" className="hover:text-cyan-300 transition-colors">
        AGB
      </Link>
      <span className="text-slate-600">|</span>
      <Link href="/impressum" className="hover:text-cyan-300 transition-colors">
        Impressum
      </Link>
      <span className="text-slate-600">|</span>
      <Link href="/privacy" className="hover:text-cyan-300 transition-colors">
        Privacy
      </Link>
    </footer>
  );
}
