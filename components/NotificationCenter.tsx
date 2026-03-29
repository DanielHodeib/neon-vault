'use client';

import { Bell, CheckCheck, Coins, LifeBuoy, Sparkles, Star, Megaphone, Trash2 } from 'lucide-react';

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string | number;
};

function iconForType(type: string) {
  const normalized = String(type || '').toUpperCase();
  if (normalized === 'MONEY_RECEIVED') return Coins;
  if (normalized === 'SUPPORT_REPLY') return LifeBuoy;
  if (normalized === 'QUEST_COMPLETED') return Sparkles;
  if (normalized === 'VIP_UPGRADE') return Star;
  return Megaphone;
}

function formatWhen(value: string | number) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return date.toLocaleString();
}

export default function NotificationCenter({
  open,
  unreadCount,
  notifications,
  loading,
  onToggle,
  onMarkAllRead,
  onMarkReadNotification,
  onDeleteNotification,
  onClearAll,
  onOpenNotification,
}: {
  open: boolean;
  unreadCount: number;
  notifications: NotificationItem[];
  loading: boolean;
  onToggle: () => void;
  onMarkAllRead: () => void;
  onMarkReadNotification: (notificationId: string) => void;
  onDeleteNotification: (notificationId: string) => void;
  onClearAll: () => void;
  onOpenNotification: (notification: NotificationItem) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="relative h-10 w-10 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 inline-flex items-center justify-center"
        aria-label="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 bg-vault-neon-pink text-white text-[9px] rounded-full px-1 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 mt-2 w-[92vw] max-w-sm rounded-xl backdrop-blur-xl bg-vault-black-darker/90 border border-vault-gray-dark shadow-neon z-[80]">
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-200">Benachrichtigungen</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onMarkAllRead}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"
              >
                <CheckCheck size={12} /> Mark all
              </button>
              <button
                type="button"
                onClick={onClearAll}
                className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 px-2 py-1 text-[10px] font-semibold uppercase text-rose-200 hover:bg-rose-500/10"
              >
                <Trash2 size={12} /> Clear all
              </button>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {loading ? <p className="px-2 py-3 text-xs text-slate-500">Loading notifications...</p> : null}
            {!loading && notifications.length === 0 ? <p className="px-2 py-3 text-xs text-slate-500">No notifications yet.</p> : null}

            {!loading
              ? notifications.map((notification) => {
                  const Icon = iconForType(notification.type);
                  return (
                    <div
                      key={notification.id}
                      className={`w-full rounded-lg border p-2 text-left transition mb-1 ${
                        notification.isRead
                          ? 'border-slate-800 bg-slate-950/40 opacity-70'
                          : 'border-cyan-700/35 bg-vault-gray-dark/50'
                      }`}
                    >
                      <button type="button" onClick={() => onOpenNotification(notification)} className="w-full text-left">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-900 text-cyan-300">
                            <Icon size={13} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-xs font-semibold text-slate-100">{notification.title}</p>
                              {!notification.isRead ? <span className="h-2 w-2 rounded-full bg-emerald-400" /> : null}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-300 break-words">{notification.message}</p>
                            <p className="mt-1 text-[10px] text-slate-500">{formatWhen(notification.createdAt)}</p>
                          </div>
                        </div>
                      </button>

                      <div className="mt-2 flex items-center justify-end gap-1">
                        {!notification.isRead ? (
                          <button
                            type="button"
                            onClick={() => onMarkReadNotification(notification.id)}
                            className="rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold uppercase text-slate-300 hover:border-cyan-500/40 hover:text-cyan-200"
                          >
                            Mark read
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onDeleteNotification(notification.id)}
                          className="rounded-md border border-rose-500/40 px-2 py-1 text-[10px] font-semibold uppercase text-rose-200 hover:bg-rose-500/10"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
