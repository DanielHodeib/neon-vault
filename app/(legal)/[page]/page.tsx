import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

const PAGES: Record<string, { title: string; sections: [string, string][] }> = {
  agb: {
    title: 'Allgemeine Geschäftsbedingungen',
    sections: [
      ['Geltungsbereich', 'Diese AGB regeln die Nutzung der Neon Vault Plattform und aller zugehörigen Dienste.'],
      ['Virtuelle Währung', 'Neon Vault verwendet ausschließlich virtuelle Ingame-Währung (NVC). Es gibt keine Ein- oder Auszahlung von Echtgeld.'],
      ['Konto', 'Nutzer sind für die Sicherheit ihrer Zugangsdaten verantwortlich. Missbrauch kann zur Sperrung führen.'],
      ['Verhalten', 'Belästigende, beleidigende oder betrügerische Inhalte sind untersagt und können sanktioniert werden.'],
      ['Änderungen', 'Funktionen können angepasst, erweitert oder eingestellt werden. Es besteht kein Anspruch auf dauerhafte Verfügbarkeit.'],
    ],
  },
  datenschutz: {
    title: 'Datenschutz',
    sections: [
      ['Welche Daten', 'Wir verarbeiten Konto-, Nutzungs- und Supportdaten, soweit dies für den Betrieb der Plattform erforderlich ist.'],
      ['Zweck', 'Die Datenverarbeitung dient Authentifizierung, Sicherheit, Stabilität, Kundenservice und Produktverbesserung.'],
      ['Cookies', 'Wir setzen nur ein technisch notwendiges Session-Cookie für den Login.'],
      ['Speicherdauer', 'Daten werden nur so lange gespeichert, wie es für den Zweck oder rechtliche Pflichten nötig ist. Beim Löschen des Kontos werden alle zugehörigen Daten entfernt.'],
      ['Deine Rechte', 'Du kannst Auskunft, Berichtigung, Löschung sowie weitere Datenschutzrechte nach geltendem Recht geltend machen.'],
    ],
  },
  impressum: {
    title: 'Impressum',
    sections: [
      ['Betreiber', 'Neon Vault Platform, Musterstraße 1, 12345 Musterstadt – E-Mail: legal@neonvault.example'],
      ['Verantwortlich für Inhalte', 'Neon Vault Team'],
      ['Haftungshinweis', 'Trotz sorgfältiger Kontrolle übernehmen wir keine Haftung für Inhalte externer Links.'],
    ],
  },
};

export const generateStaticParams = () => Object.keys(PAGES).map((page) => ({ page }));

export default async function LegalPage({ params }: PageProps<'/[page]'>) {
  const page = PAGES[(await params).page];
  if (!page) notFound();
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg"><ChevronLeft size={16} /> Zurück</Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">{page.title}</h1>
      <div className="mt-8 divide-y divide-line border-y border-line">
        {page.sections.map(([heading, text]) => (
          <section key={heading} className="py-5">
            <h2 className="text-sm font-semibold">{heading}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{text}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
