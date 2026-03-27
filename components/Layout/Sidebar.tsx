'use client';

import Link from 'next/link';
import { Menu, Settings, Shield, Trophy, TrendingUp, Coins, Hand, CircleDashed, Spade, Plane, Users } from 'lucide-react';

type SidebarItem = {
  label: string;
  icon: React.ReactNode;
  href?: string;
  tabKey?: string;
  onClick?: () => void;
  adminOnly?: boolean;
};

export default function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onCloseMobile,
  activeTab,
  onSelectTab,
  canAccessAdmin,
  dailyFaucetClaimed,
  onClaimFaucet,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  canAccessAdmin: boolean;
  dailyFaucetClaimed: boolean;
  onClaimFaucet: () => void;
}) {
  const sidebarItems: SidebarItem[] = [
    { label: 'Neon Rocket', icon: <TrendingUp size={20} />, tabKey: 'crash', onClick: () => onSelectTab('crash') },
    { label: 'Cyber Aviator', icon: <Plane size={20} />, tabKey: 'crash-aviator', onClick: () => onSelectTab('crash-aviator') },
    { label: 'Slots', icon: <Coins size={20} />, tabKey: 'slots', onClick: () => onSelectTab('slots') },
    { label: 'Blackjack', icon: <Hand size={20} />, tabKey: 'blackjack', onClick: () => onSelectTab('blackjack') },
    { label: 'Roulette', icon: <CircleDashed size={20} />, tabKey: 'roulette', onClick: () => onSelectTab('roulette') },
    { label: 'Poker', icon: <Spade size={20} />, tabKey: 'poker', onClick: () => onSelectTab('poker') },
    { label: 'Coinflip', icon: <Coins size={20} />, tabKey: 'coinflip', onClick: () => onSelectTab('coinflip') },
    { label: 'Friends', icon: <Users size={20} />, tabKey: 'friends', onClick: () => onSelectTab('friends') },
    { label: 'Leaderboard', icon: <Trophy size={20} />, tabKey: 'leaderboard', onClick: () => onSelectTab('leaderboard') },
    { label: 'Settings', icon: <Settings size={20} />, tabKey: 'settings', onClick: () => onSelectTab('settings') },
    { label: 'Admin', icon: <Shield size={20} />, tabKey: 'admin', onClick: () => onSelectTab('admin'), adminOnly: true },
  ];

  const visibleItems = sidebarItems.filter((item) => !item.adminOnly || canAccessAdmin);

  return (
    <aside
      className={`hub-sidebar fixed inset-y-0 left-0 w-64 md:relative md:inset-auto ${collapsed ? 'md:w-20' : 'md:w-64'} bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 z-40 transition-transform md:transition-[width] duration-300 ease-out ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}
    >
      <div className={`h-16 flex items-center ${collapsed ? 'px-3 justify-between' : 'px-5'} border-b border-slate-800 transition-[padding] duration-300`}>
        {!collapsed ? (
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-black tracking-wide text-white hover:text-cyan-200 transition-all duration-300">
            <span className="text-cyan-300">NEON</span>
            <span>VAULT</span>
          </Link>
        ) : (
          <Link href="/" className="w-8 h-8 rounded bg-cyan-600/20 border border-cyan-400/40 text-cyan-200 text-xs font-black inline-flex items-center justify-center transition-all duration-300">
            NV
          </Link>
        )}

        <button
          onClick={onToggle}
          className={`hidden md:flex w-8 h-8 bg-blue-600 rounded items-center justify-center hover:bg-blue-500 transition-all duration-300 ${collapsed ? 'rotate-180' : 'rotate-0'}`}
          aria-label="Toggle sidebar"
          type="button"
        >
          <Menu size={18} className="text-white" />
        </button>
      </div>

      <nav className={`flex-1 ${collapsed ? 'p-2' : 'p-4'} space-y-2 overflow-y-auto custom-scrollbar`}>
        {visibleItems.map((item) => {
          const active = item.tabKey ? activeTab === item.tabKey : false;
          const sharedClassName = `group w-full h-11 rounded-xl transition-all flex items-center ${
            collapsed ? 'justify-center' : 'px-3 gap-3'
          } ${
            active
              ? 'bg-cyan-500/18 text-cyan-200 border border-cyan-500/30 shadow-[0_0_18px_rgba(34,211,238,0.18)]'
              : 'text-slate-300 hover:text-white hover:bg-slate-800 border border-transparent'
          }`;

          return (
            <button
              key={item.label}
              type="button"
              onClick={() => {
                item.onClick?.();
                onCloseMobile();
              }}
              className={sharedClassName}
              title={collapsed ? item.label : undefined}
            >
              <span className="transition-transform duration-300 group-hover:scale-110">{item.icon}</span>
              {!collapsed ? <span className="text-base font-medium transition-all duration-200 opacity-100 translate-x-0">{item.label}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className={`${collapsed ? 'p-2' : 'p-4'} border-t border-slate-800`}>
        <button
          onClick={() => {
            onClaimFaucet();
            onCloseMobile();
          }}
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
