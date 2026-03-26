'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Menu, Settings, Shield, Trophy } from 'lucide-react';

type SidebarItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
};

const SIDEBAR_ITEMS: SidebarItem[] = [
  { label: 'Home', href: '/', icon: <House size={20} /> },
  { label: 'Leaderboard', href: '/leaderboard', icon: <Trophy size={20} /> },
  { label: 'Settings', href: '/settings', icon: <Settings size={20} /> },
  { label: 'Admin', href: '/admin', icon: <Shield size={20} />, adminOnly: true },
];

export default function Sidebar({
  collapsed,
  onToggle,
  isAdmin,
  dailyFaucetClaimed,
  onClaimFaucet,
}: {
  collapsed: boolean;
  onToggle: () => void;
  isAdmin: boolean;
  dailyFaucetClaimed: boolean;
  onClaimFaucet: () => void;
}) {
  const pathname = usePathname();

  const visibleItems = SIDEBAR_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <aside className={`hub-sidebar ${collapsed ? 'w-20' : 'w-64'} bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 z-20 transition-all duration-300`}>
      <div className={`h-16 flex items-center ${collapsed ? 'px-3 justify-between' : 'px-5'} border-b border-slate-800`}>
        {!collapsed ? (
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-black tracking-wide text-white hover:text-cyan-200 transition-colors">
            <span className="text-cyan-300">NEON</span>
            <span>VAULT</span>
          </Link>
        ) : (
          <Link href="/" className="w-8 h-8 rounded bg-cyan-600/20 border border-cyan-400/40 text-cyan-200 text-xs font-black inline-flex items-center justify-center">
            NV
          </Link>
        )}

        <button
          onClick={onToggle}
          className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center hover:bg-blue-500 transition-colors"
          aria-label="Toggle sidebar"
          type="button"
        >
          <Menu size={18} className="text-white" />
        </button>
      </div>

      <nav className={`flex-1 ${collapsed ? 'p-2' : 'p-4'} space-y-2 overflow-y-auto custom-scrollbar`}>
        {visibleItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`w-full h-11 rounded-xl transition-all flex items-center ${
                collapsed ? 'justify-center' : 'px-3 gap-3'
              } ${
                active
                  ? 'bg-cyan-500/18 text-cyan-200 border border-cyan-500/30 shadow-[0_0_18px_rgba(34,211,238,0.18)]'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800 border border-transparent'
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span>{item.icon}</span>
              {!collapsed ? <span className="text-base font-medium">{item.label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className={`${collapsed ? 'p-2' : 'p-4'} border-t border-slate-800`}>
        <button
          onClick={onClaimFaucet}
          disabled={dailyFaucetClaimed}
          className={`w-full py-3 rounded text-sm font-medium transition-colors text-slate-300 active:scale-95 ${
            dailyFaucetClaimed ? 'bg-slate-800/60 cursor-not-allowed opacity-70' : 'bg-slate-800 hover:bg-slate-700'
          } ${collapsed ? 'px-0 text-xs' : ''}`}
          type="button"
          title={collapsed ? 'Claim Daily Faucet' : undefined}
        >
          {collapsed ? 'F' : dailyFaucetClaimed ? 'Faucet Claimed' : 'Claim Daily Faucet (+5000)'}
        </button>
      </div>
    </aside>
  );
}
