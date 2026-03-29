'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

type AdminRole = 'OWNER' | 'ADMIN' | 'MODERATOR' | 'SUPPORT' | 'USER';
type AdminTab = 'dashboard' | 'users' | 'logs' | 'roles' | 'system' | 'helpdesk';

interface AdminPermissions {
  systemFinance: boolean;
  userManagement: boolean;
  moderationLogs: boolean;
  canManageRoles: boolean;
  helpDesk: boolean;
}
type RankTag =
  | 'BALLER'
  | 'BRONZE'
  | 'IRON'
  | 'COPPER'
  | 'STEEL'
  | 'SILVER'
  | 'EMERALD'
  | 'GOLD'
  | 'PLATINUM'
  | 'DIAMOND'
  | 'RUBY'
  | 'MASTER'
  | 'ELITE'
  | 'HIGH_ROLLER'
  | 'TYCOON'
  | 'CASINO_LORD'
  | 'MILLIONAIRE'
  | 'MULTI_MILLIONAIRE'
  | 'BILLIONAIRE'
  | 'CASINO_EMPEROR'
  | 'NEON_OVERLORD';

const RANK_TAG_OPTIONS: RankTag[] = [
  'BALLER',
  'BRONZE',
  'IRON',
  'COPPER',
  'STEEL',
  'SILVER',
  'EMERALD',
  'GOLD',
  'PLATINUM',
  'DIAMOND',
  'RUBY',
  'MASTER',
  'ELITE',
  'HIGH_ROLLER',
  'TYCOON',
  'CASINO_LORD',
  'MILLIONAIRE',
  'MULTI_MILLIONAIRE',
  'BILLIONAIRE',
  'CASINO_EMPEROR',
  'NEON_OVERLORD',
];

interface AdminUser {
  id: string;
  username: string;
  role: AdminRole | string;
  balance: string;
  xp: number;
  clanTag: string | null;
  isBanned: boolean;
  banExpiresAt?: string | null;
  banReason?: string | null;
  selectedRankTag: RankTag | string;
}

type BanDurationOption = '1h' | '24h' | '1w' | 'permanent';

type BanReasonOption = 'Spam' | 'Toxicity' | 'Cheating' | 'Custom Reason';

interface DashboardMetrics {
  totalUsers: number;
  usersOnline: number;
  totalEconomy: number;
  activeTickets: number;
}

interface DashboardActivity {
  id: string;
  type: string;
  label: string;
  createdAt: string;
}

interface HelpDeskTicket {
  id: string;
  subject: string;
  category: string;
  status: string;
  guestContact?: string | null;
  guestUsername?: string | null;
  user?: { username?: string };
  content?: string | null;
  updatedAt: string;
}

interface MaintenanceSettings {
  isMaintenanceMode: boolean;
  maintenanceEndTime: string | null;
}

interface GlobalEventStatus {
  type?: string;
  endTime?: number;
  label?: string;
}

type MaintenanceModeType = 'indefinite' | 'scheduled';

const VALID_ADMIN_ROLES: AdminRole[] = ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'USER'];
const FOUNDER_USERNAME = 'Daniel';

function formatNvc(value: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.max(0, Math.floor(value)));
}

function formatDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '--';
  }
  return parsed.toLocaleString();
}

function toDateTimeLocalInput(value: string | null) {
  if (!value) {
    return '';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  const pad = (num: number) => String(num).padStart(2, '0');
  const year = parsed.getFullYear();
  const month = pad(parsed.getMonth() + 1);
  const day = pad(parsed.getDate());
  const hours = pad(parsed.getHours());
  const minutes = pad(parsed.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function getBanDurationLabel(endTime: string | null | undefined) {
  if (!endTime) {
    return 'Permanent';
  }

  const end = new Date(endTime);
  if (Number.isNaN(end.getTime())) {
    return 'Temporary';
  }

  const diffMs = end.getTime() - Date.now();
  if (diffMs <= 0) {
    return 'Expired';
  }

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days >= 1) {
    return `Expires in ${days}d`;
  }
  if (hours >= 1) {
    return `Expires in ${hours}h`;
  }

  const minutes = Math.max(1, Math.floor(diffMs / (1000 * 60)));
  return `Expires in ${minutes}m`;
}

export default function AdminPanel() {
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [currentRole, setCurrentRole] = useState<AdminRole>('USER');
  const [currentUsername, setCurrentUsername] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');
  const [permissions, setPermissions] = useState<AdminPermissions>({
    systemFinance: false,
    userManagement: false,
    moderationLogs: false,
    canManageRoles: false,
    helpDesk: false,
  });
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [rainAmount, setRainAmount] = useState('50000');
  const [rainDuration, setRainDuration] = useState('30');
  const [rainParticipants, setRainParticipants] = useState('5');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, AdminRole>>({});
  const [balanceDrafts, setBalanceDrafts] = useState<Record<string, string>>({});
  const [usernameDrafts, setUsernameDrafts] = useState<Record<string, string>>({});
  const [xpDrafts, setXpDrafts] = useState<Record<string, string>>({});
  const [levelDrafts, setLevelDrafts] = useState<Record<string, string>>({});
  const [clanTagDrafts, setClanTagDrafts] = useState<Record<string, string>>({});
  const [selectedRankTagDrafts, setSelectedRankTagDrafts] = useState<Record<string, RankTag>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>({});
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics>({
    totalUsers: 0,
    usersOnline: 0,
    totalEconomy: 0,
    activeTickets: 0,
  });
  const [recentActivity, setRecentActivity] = useState<DashboardActivity[]>([]);
  const [maintenanceSettings, setMaintenanceSettings] = useState<MaintenanceSettings>({
    isMaintenanceMode: false,
    maintenanceEndTime: null,
  });
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [maintenanceEnabledDraft, setMaintenanceEnabledDraft] = useState(false);
  const [maintenanceModeType, setMaintenanceModeType] = useState<MaintenanceModeType>('indefinite');
  const [maintenanceEndDraft, setMaintenanceEndDraft] = useState('');
  const [maintenanceSubmitting, setMaintenanceSubmitting] = useState(false);
  const [showBannedOnly, setShowBannedOnly] = useState(false);
  const [banModalTarget, setBanModalTarget] = useState<AdminUser | null>(null);
  const [banDurationDraft, setBanDurationDraft] = useState<BanDurationOption>('24h');
  const [banReasonPreset, setBanReasonPreset] = useState<BanReasonOption>('Spam');
  const [banReasonDraft, setBanReasonDraft] = useState('');
  const [helpDeskTickets, setHelpDeskTickets] = useState<HelpDeskTicket[]>([]);
  const [eventTypeDraft, setEventTypeDraft] = useState('CASHBACK-MANIA');
  const [eventDurationDraft, setEventDurationDraft] = useState('10');
  const [eventSubmitting, setEventSubmitting] = useState(false);
  const [activeGlobalEvent, setActiveGlobalEvent] = useState<GlobalEventStatus | null>(null);


  useEffect(() => {
    let isActive = true;
    void (async () => {
      try {
        const response = await fetch('/api/admin/me', { cache: 'no-store' });
        if (!isActive) {
          return;
        }
        if (!response.ok) {
          setHasAdminAccess(false);
          setAccessChecked(true);
          return;
        }

        const payload = (await response.json()) as {
          isAdmin?: boolean;
          userId?: string;
          username?: string;
          role?: string;
          canAccessAdminPanel?: boolean;
          permissions?: Partial<AdminPermissions>;
        };

        const normalizedRole = VALID_ADMIN_ROLES.includes((payload.role ?? 'USER') as AdminRole)
          ? (payload.role as AdminRole)
          : 'USER';

        const nextPermissions: AdminPermissions = {
          systemFinance: Boolean(payload.permissions?.systemFinance),
          userManagement: Boolean(payload.permissions?.userManagement),
          moderationLogs: Boolean(payload.permissions?.moderationLogs),
          canManageRoles: Boolean(payload.permissions?.canManageRoles),
          helpDesk: Boolean(payload.permissions?.helpDesk),
        };

        setCurrentUserId(payload.userId ?? '');
        setCurrentUsername(String(payload.username ?? '').trim());
        setCurrentRole(normalizedRole);
        setPermissions(nextPermissions);
        setHasAdminAccess(Boolean(payload.canAccessAdminPanel ?? payload.isAdmin));
        setAccessChecked(true);
      } catch {
        if (!isActive) {
          return;
        }
        setHasAdminAccess(false);
        setAccessChecked(true);
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const visibleTabs = useMemo(() => {
    const tabs: Array<{ key: AdminTab; label: string }> = [];
    tabs.push({ key: 'dashboard', label: 'Dashboard' });
    if (permissions.userManagement) {
      tabs.push({ key: 'users', label: 'User Management' });
    }
    if (permissions.moderationLogs) {
      tabs.push({ key: 'logs', label: 'Game Logs' });
    }
    if (permissions.canManageRoles) {
      tabs.push({ key: 'roles', label: 'Roles' });
    }
    if (permissions.systemFinance) {
      tabs.push({ key: 'system', label: 'System' });
    }
    if (permissions.helpDesk) {
      tabs.push({ key: 'helpdesk', label: 'Help Desk' });
    }
    return tabs;
  }, [permissions]);

  useEffect(() => {
    if (visibleTabs.length === 0) {
      return;
    }

    if (!visibleTabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [activeTab, visibleTabs]);

  const loadUsers = useCallback(async () => {
    if (!hasAdminAccess) {
      return;
    }
    setLoading(true);
    setNotice('');

    try {
      const query = new URLSearchParams();
      if (search.trim()) {
        query.set('q', search.trim());
      }
      if (showBannedOnly) {
        query.set('bannedOnly', 'true');
      }

      const response = await fetch(`/api/admin/update?${query.toString()}`, { cache: 'no-store' });
      const payload = (await response.json()) as { error?: string; users?: AdminUser[] };

      if (!response.ok) {
        setNotice(payload.error ?? 'Failed to load users.');
        setLoading(false);
        return;
      }

      const nextUsers = payload.users ?? [];
      setUsers(nextUsers);

      setRoleDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          const role = VALID_ADMIN_ROLES.includes(user.role as AdminRole) ? (user.role as AdminRole) : 'USER';
          if (!merged[user.id]) {
            merged[user.id] = role;
          }
        }
        return merged;
      });

      setBalanceDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          if (!(user.id in merged)) {
            merged[user.id] = user.balance;
          }
        }
        return merged;
      });

      setUsernameDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          if (!(user.id in merged)) {
            merged[user.id] = user.username;
          }
        }
        return merged;
      });

      setXpDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          if (!(user.id in merged)) {
            merged[user.id] = String(user.xp);
          }
        }
        return merged;
      });

      setLevelDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          if (!(user.id in merged)) {
            merged[user.id] = String(Math.floor(user.xp / 1000) + 1);
          }
        }
        return merged;
      });

      setClanTagDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          if (!(user.id in merged)) {
            merged[user.id] = user.clanTag ?? '';
          }
        }
        return merged;
      });

      setSelectedRankTagDrafts((prev) => {
        const merged = { ...prev };
        for (const user of nextUsers) {
          const rankTag = RANK_TAG_OPTIONS.includes(user.selectedRankTag as RankTag)
            ? (user.selectedRankTag as RankTag)
            : 'BRONZE';
          if (!merged[user.id]) {
            merged[user.id] = rankTag;
          }
        }
        return merged;
      });
    } catch {
      setNotice('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, [hasAdminAccess, search, showBannedOnly]);

  const loadDashboard = useCallback(async () => {
    if (!hasAdminAccess) {
      return;
    }

    setDashboardLoading(true);
    try {
      const response = await fetch('/api/admin/dashboard', { cache: 'no-store' });
      const payload = (await response.json()) as {
        error?: string;
        metrics?: DashboardMetrics;
        recentActivity?: DashboardActivity[];
      };

      if (!response.ok) {
        setNotice(payload.error ?? 'Failed to load dashboard metrics.');
        return;
      }

      setDashboardMetrics(payload.metrics ?? {
        totalUsers: 0,
        usersOnline: 0,
        totalEconomy: 0,
        activeTickets: 0,
      });
      setRecentActivity(payload.recentActivity ?? []);
    } catch {
      setNotice('Failed to load dashboard metrics.');
    } finally {
      setDashboardLoading(false);
    }
  }, [hasAdminAccess]);

  const loadHelpDeskTickets = useCallback(async () => {
    if (!permissions.helpDesk) {
      return;
    }

    try {
      const response = await fetch('/api/support/admin/tickets', { cache: 'no-store' });
      const payload = (await response.json()) as { error?: string; tickets?: HelpDeskTicket[] };
      if (!response.ok) {
        setNotice(payload.error ?? 'Failed to load help desk tickets.');
        return;
      }

      setHelpDeskTickets(payload.tickets ?? []);
    } catch {
      setNotice('Failed to load help desk tickets.');
    }
  }, [permissions.helpDesk]);

  const loadMaintenanceStatus = useCallback(async () => {
    if (!hasAdminAccess) {
      return;
    }

    try {
      const response = await fetch('/api/admin/system', { cache: 'no-store' });
      const payload = (await response.json()) as {
        error?: string;
        settings?: MaintenanceSettings;
      };

      if (!response.ok || !payload.settings) {
        if (payload.error) {
          setNotice(payload.error);
        }
        return;
      }

      setMaintenanceSettings(payload.settings);
    } catch {
      setNotice('Failed to load maintenance settings.');
    }
  }, [hasAdminAccess]);

  const loadGlobalEventStatus = useCallback(async () => {
    if (!permissions.systemFinance) {
      return;
    }

    try {
      const response = await fetch('/api/admin/global-event', { cache: 'no-store' });
      const payload = (await response.json()) as { error?: string; event?: GlobalEventStatus | null };
      if (!response.ok) {
        if (payload.error) {
          setNotice(payload.error);
        }
        return;
      }

      setActiveGlobalEvent(payload.event ?? null);
    } catch {
      setNotice('Failed to load global event status.');
    }
  }, [permissions.systemFinance]);

  const openMaintenanceModal = useCallback(() => {
    const hasEnd = Boolean(maintenanceSettings.maintenanceEndTime);
    setMaintenanceEnabledDraft(Boolean(maintenanceSettings.isMaintenanceMode));
    setMaintenanceModeType(hasEnd ? 'scheduled' : 'indefinite');
    setMaintenanceEndDraft(toDateTimeLocalInput(maintenanceSettings.maintenanceEndTime));
    setMaintenanceModalOpen(true);
  }, [maintenanceSettings]);

  const submitMaintenanceSettings = useCallback(async () => {
    setMaintenanceSubmitting(true);
    setNotice('');

    try {
      let maintenanceEndTime: string | null = null;

      if (maintenanceEnabledDraft && maintenanceModeType === 'scheduled') {
        if (!maintenanceEndDraft) {
          setNotice('Bitte ein geplantes Enddatum setzen.');
          setMaintenanceSubmitting(false);
          return;
        }

        const parsed = new Date(maintenanceEndDraft);
        if (Number.isNaN(parsed.getTime())) {
          setNotice('Ungueltiges Datum/Uhrzeit fuer Wartungsende.');
          setMaintenanceSubmitting(false);
          return;
        }

        maintenanceEndTime = parsed.toISOString();
      }

      const response = await fetch('/api/admin/system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isMaintenanceMode: maintenanceEnabledDraft,
          maintenanceEndTime,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        settings?: MaintenanceSettings;
      };

      if (!response.ok || !payload.settings) {
        console.error('System status update failed', payload.error);
        setNotice(payload.error ?? 'System status update failed.');
        setMaintenanceSubmitting(false);
        return;
      }

      setMaintenanceSettings(payload.settings);
      setMaintenanceModalOpen(false);
      setNotice('System-Status aktualisiert.');
    } catch (error) {
      console.error('System status update failed', error);
      setNotice('System status update failed.');
    } finally {
      setMaintenanceSubmitting(false);
    }
  }, [maintenanceEnabledDraft, maintenanceEndDraft, maintenanceModeType]);

  useEffect(() => {
    if (hasAdminAccess) {
      void loadUsers();
      void loadDashboard();
      void loadMaintenanceStatus();
      void loadGlobalEventStatus();
    }
  }, [hasAdminAccess, loadUsers, loadDashboard, loadMaintenanceStatus, loadGlobalEventStatus]);

  useEffect(() => {
    if (activeTab === 'helpdesk' && permissions.helpDesk) {
      void loadHelpDeskTickets();
    }
  }, [activeTab, permissions.helpDesk, loadHelpDeskTickets]);

  useEffect(() => {
    if (!hasAdminAccess || activeTab !== 'dashboard') {
      return;
    }

    const timer = window.setInterval(() => {
      void loadDashboard();
    }, 15000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeTab, hasAdminAccess, loadDashboard]);

  useEffect(() => {
    if (!permissions.systemFinance || activeTab !== 'system') {
      return;
    }

    void loadGlobalEventStatus();
    const timer = window.setInterval(() => {
      void loadGlobalEventStatus();
    }, 10000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeTab, permissions.systemFinance, loadGlobalEventStatus]);

  const visibleUsers = useMemo(() => users, [users]);

  if (!accessChecked || !hasAdminAccess) {
    return null;
  }

  async function runAction(payload: object) {
    const response = await fetch('/api/admin/update', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as { error?: string; ok?: boolean };
    if (!response.ok) {
      throw new Error(result.error ?? 'Action failed.');
    }
  }

  const openBanModal = (user: AdminUser) => {
    setBanModalTarget(user);
    setBanDurationDraft('24h');
    setBanReasonPreset('Spam');
    setBanReasonDraft('');
  };

  const closeBanModal = () => {
    setBanModalTarget(null);
    setBanDurationDraft('24h');
    setBanReasonPreset('Spam');
    setBanReasonDraft('');
  };

  const handleToggleBan = async (
    userId: string,
    isBanned: boolean,
    options?: { duration?: BanDurationOption; reason?: string }
  ) => {
    setBusyUserId(userId);
    setNotice('');

    try {
      const nextIsBanned = !isBanned;
      const response = await fetch('/api/admin/toggle-ban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetId: userId,
          banStatus: nextIsBanned,
          duration: nextIsBanned ? options?.duration ?? 'permanent' : undefined,
          reason: nextIsBanned ? options?.reason ?? '' : undefined,
        }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        error?: string;
        banExpiresAt?: string | null;
        banReason?: string | null;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Ban action failed.');
      }
      setUsers((current) =>
        current
          .map((entry) =>
            entry.id === userId
              ? {
                  ...entry,
                  isBanned: nextIsBanned,
                  banExpiresAt: nextIsBanned ? payload.banExpiresAt ?? null : null,
                  banReason: nextIsBanned ? payload.banReason ?? null : null,
                }
              : entry
          )
          .filter((entry) => !(showBannedOnly && !entry.isBanned))
      );
      setNotice(isBanned ? 'User unbanned.' : 'User banned.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Ban action failed.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleSaveProfile = async (userId: string, currentIsBanned: boolean) => {
    setBusyUserId(userId);
    setNotice('');

    try {
      await runAction({
        action: 'update-user',
        userId,
        username: (usernameDrafts[userId] ?? '').trim(),
        role: roleDrafts[userId] ?? 'USER',
        balance: Number(balanceDrafts[userId] ?? 0),
        xp: Number(xpDrafts[userId] ?? 0),
        level: Number(levelDrafts[userId] ?? 1),
        clanTag: (clanTagDrafts[userId] ?? '').trim(),
        selectedRankTag: selectedRankTagDrafts[userId] ?? 'BRONZE',
        isBanned: currentIsBanned,
      });
      setNotice('User profile updated.');
      await loadUsers();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Profile update failed.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleAnnouncement = async () => {
    const message = announcement.trim();
    if (!message) {
      setNotice('Announcement message is required.');
      return;
    }

    setNotice('');
    try {
      const response = await fetch('/api/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });

      const payload = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok) {
        setNotice(payload.error ?? 'Broadcast failed.');
        return;
      }

      setAnnouncement('');
      setNotice('Global announcement sent.');
    } catch {
      setNotice('Broadcast failed.');
    }
  };

  const handleStartRain = async () => {
    const amount = Math.floor(Number(rainAmount));
    const duration = Math.floor(Number(rainDuration));
    const participantsCount = Math.floor(Number(rainParticipants));

    if (!Number.isFinite(amount) || amount <= 0) {
      setNotice('Rain amount must be greater than 0.');
      return;
    }

    if (!Number.isFinite(duration) || duration < 5 || duration > 600) {
      setNotice('Rain duration must be between 5 and 600 seconds.');
      return;
    }

    if (!Number.isFinite(participantsCount) || participantsCount < 1 || participantsCount > 200) {
      setNotice('Rain participants must be between 1 and 200.');
      return;
    }

    setNotice('');
    try {
      const response = await fetch('/api/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rain: {
            amount,
            duration,
            participantsCount,
          },
        }),
      });

      const payload = (await response.json()) as { error?: string; ok?: boolean };
      if (!response.ok) {
        setNotice(payload.error ?? 'Failed to start rain.');
        return;
      }

      setNotice(`Rain started: ${amount} NVC / ${duration}s / ${participantsCount} users.`);
    } catch {
      setNotice('Failed to start rain.');
    }
  };

  const handleStartGlobalEvent = async () => {
    const durationMinutes = Math.max(1, Math.min(180, Math.floor(Number(eventDurationDraft || 10))));
    const eventType = String(eventTypeDraft || '').trim().toUpperCase();

    if (!eventType) {
      setNotice('Event type is required.');
      return;
    }

    setEventSubmitting(true);
    setNotice('');
    try {
      const response = await fetch('/api/admin/global-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          eventType,
          durationMinutes,
        }),
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string; event?: GlobalEventStatus | null };
      if (!response.ok || !payload.ok) {
        setNotice(payload.error ?? 'Failed to start global event.');
        return;
      }

      setActiveGlobalEvent(payload.event ?? null);
      setNotice(`Global event started: ${eventType}`);
    } catch {
      setNotice('Failed to start global event.');
    } finally {
      setEventSubmitting(false);
    }
  };

  const handleStopGlobalEvents = async () => {
    setEventSubmitting(true);
    setNotice('');
    try {
      const response = await fetch('/api/admin/global-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string; stopped?: boolean };
      if (!response.ok || !payload.ok) {
        setNotice(payload.error ?? 'Failed to stop global events.');
        return;
      }

      setActiveGlobalEvent(null);
      setNotice(payload.stopped ? 'Global event stopped.' : 'No active event to stop.');
    } catch {
      setNotice('Failed to stop global events.');
    } finally {
      setEventSubmitting(false);
    }
  };

  const handleSetPassword = async (userId: string) => {
    const password = (passwordDrafts[userId] ?? '').trim();
    if (password.length < 8) {
      setNotice('Password must be at least 8 characters.');
      return;
    }

    setBusyUserId(userId);
    setNotice('');
    try {
      const response = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: userId, newPassword: password }),
      });
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? 'Password update failed.');
      }
      setPasswordDrafts((prev) => ({ ...prev, [userId]: '' }));
      setNotice('Password updated.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Password update failed.');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleQuickAction = async (userId: string, quickAction: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) {
      return;
    }

    setBusyUserId(userId);
    setNotice('');
    try {
      await runAction({ action: 'quick-action', userId, quickAction });
      setNotice('Quick action completed.');
      await loadUsers();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Quick action failed.');
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <h2 className="text-2xl font-bold text-slate-100">Staff Panel</h2>
      <p className="text-sm text-slate-400 mt-1">Role: {currentRole}</p>

      {activeTab === 'dashboard' ? (
        <div className="mt-5 space-y-4 rounded-xl border border-vault-gray-dark bg-vault-black-darker p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Control Center</p>
            <button
              type="button"
              onClick={() => void loadDashboard()}
              className="h-8 rounded-lg border border-vault-gray-dark bg-slate-900 px-3 text-[11px] font-bold uppercase text-slate-300 hover:border-cyan-500/50 hover:text-cyan-200"
            >
              Refresh Metrics
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total Users', value: dashboardMetrics.totalUsers.toLocaleString() },
              { label: 'Users Online', value: dashboardMetrics.usersOnline.toLocaleString() },
              { label: 'Total NVC in Economy', value: `${formatNvc(dashboardMetrics.totalEconomy)} NVC` },
              { label: 'Active Tickets', value: dashboardMetrics.activeTickets.toLocaleString() },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-xl border border-vault-gray-dark bg-slate-900/70 p-4 shadow-[0_0_20px_rgba(0,0,0,0.35)] transition hover:border-cyan-500/45 hover:shadow-[0_0_24px_rgba(34,211,238,0.18)]"
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{metric.label}</p>
                <p className="mt-2 text-xl font-black text-slate-100">{dashboardLoading ? '...' : metric.value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
            <div className="rounded-xl border border-vault-gray-dark bg-slate-900/55 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Recent Activity</p>
              <div className="mt-3 space-y-2">
                {recentActivity.length === 0 ? (
                  <p className="text-sm text-slate-500">No recent activity.</p>
                ) : (
                  recentActivity.map((activity) => (
                    <div key={activity.id} className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                      <p className="text-sm text-slate-200">{activity.label}</p>
                      <p className="text-[11px] text-slate-500">{formatDate(activity.createdAt)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-vault-gray-dark bg-slate-900/55 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Quick Actions</p>
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('system')}
                  className="h-10 w-full rounded-lg border border-cyan-500/40 bg-cyan-500/15 text-xs font-bold uppercase text-cyan-200 hover:bg-cyan-500/25"
                >
                  Globale Chat-Nachricht senden
                </button>
                <button
                  type="button"
                  onClick={openMaintenanceModal}
                  className={`h-10 w-full rounded-lg border text-xs font-bold uppercase ${maintenanceSettings.isMaintenanceMode ? 'border-amber-500/40 bg-amber-500/15 text-amber-200' : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'}`}
                >
                  {maintenanceSettings.isMaintenanceMode ? 'Wartungsmodus aktiv' : 'Wartungsmodus deaktiviert'}
                </button>
                <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] text-slate-500">
                  Access: Users {permissions.userManagement ? 'on' : 'off'} · Logs {permissions.moderationLogs ? 'on' : 'off'} · HelpDesk {permissions.helpDesk ? 'on' : 'off'}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`h-9 px-3 rounded-lg border text-xs font-semibold uppercase ${
              activeTab === tab.key
                ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'system' && permissions.systemFinance ? (
      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Global Announcement</p>
        <div className="flex gap-2">
          <input
            value={announcement}
            onChange={(event) => setAnnouncement(event.target.value.slice(0, 240))}
            placeholder="Message for all online users"
            className="h-10 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
          />
          <button
            onClick={handleAnnouncement}
            className="h-10 px-4 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
          >
            Broadcast
          </button>
        </div>
      </div>
      ) : null}

      {activeTab === 'system' && permissions.systemFinance ? (
      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">GLOBAL EVENT CONTROL</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <select
            value={eventTypeDraft}
            onChange={(event) => setEventTypeDraft(event.target.value)}
            className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
          >
            <option value="CASHBACK-MANIA">CASHBACK-MANIA</option>
            <option value="MULTIPLIER-BOOST">MULTIPLIER-BOOST</option>
            <option value="RAIN-EVENT">RAIN-EVENT</option>
          </select>
          <input
            type="number"
            min={1}
            max={180}
            value={eventDurationDraft}
            onChange={(event) => setEventDurationDraft(event.target.value)}
            placeholder="Duration (minutes)"
            className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
          />
          <button
            onClick={() => void handleStartGlobalEvent()}
            disabled={eventSubmitting}
            className="h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold"
          >
            START EVENT
          </button>
          <button
            onClick={() => void handleStopGlobalEvents()}
            disabled={eventSubmitting}
            className="h-10 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white font-semibold"
          >
            FORCE STOP ALL EVENTS
          </button>
        </div>
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
          {activeGlobalEvent
            ? `Active: ${activeGlobalEvent.type ?? 'UNKNOWN'} · Ends: ${activeGlobalEvent.endTime ? new Date(activeGlobalEvent.endTime).toLocaleString() : 'Unknown'}`
            : 'No active global event.'}
        </div>
      </div>
      ) : null}

      {activeTab === 'system' && permissions.systemFinance ? (
      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Rain Control</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input
            type="number"
            min={1}
            value={rainAmount}
            onChange={(event) => setRainAmount(event.target.value)}
            placeholder="Amount (NVC)"
            className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
          />
          <input
            type="number"
            min={5}
            max={600}
            value={rainDuration}
            onChange={(event) => setRainDuration(event.target.value)}
            placeholder="Duration (seconds)"
            className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
          />
          <input
            type="number"
            min={1}
            max={200}
            value={rainParticipants}
            onChange={(event) => setRainParticipants(event.target.value)}
            placeholder="Participants"
            className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
          />
          <button
            onClick={handleStartRain}
            className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold"
          >
            Start Rain
          </button>
        </div>
      </div>
      ) : null}

      {activeTab === 'users' && permissions.userManagement ? (
      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search user by username"
            className="h-10 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
          />
          <button
            onClick={() => void loadUsers()}
            className="h-10 px-4 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowBannedOnly((current) => !current)}
            className={`h-10 px-4 rounded-lg border text-xs font-bold uppercase ${showBannedOnly ? 'border-red-500/40 bg-red-500/15 text-red-200' : 'border-slate-700 bg-slate-900 text-slate-300'}`}
          >
            {showBannedOnly ? 'Showing Banned Only' : 'Show Banned Users Only'}
          </button>
        </div>

        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800">
          {loading ? <p className="px-3 py-4 text-sm text-slate-500">Loading users...</p> : null}
          {!loading && visibleUsers.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">No users found.</p> : null}
          {!loading
            ? visibleUsers.map((user) => {
                const isBusy = busyUserId === user.id;
                const isExpanded = expandedUserId === user.id;
                const roleLabel = roleDrafts[user.id] ?? (VALID_ADMIN_ROLES.includes(user.role as AdminRole) ? (user.role as AdminRole) : 'USER');
                const userRole = VALID_ADMIN_ROLES.includes(user.role as AdminRole) ? (user.role as AdminRole) : 'USER';
                const isFounderViewer = currentUsername === FOUNDER_USERNAME;
                const isFounderTarget = user.username === FOUNDER_USERNAME;
                const isOwnerTarget = userRole === 'OWNER';
                const canEditRole =
                  permissions.canManageRoles &&
                  user.id !== currentUserId &&
                  !(!isFounderViewer && isFounderTarget) &&
                  !(!isFounderViewer && isOwnerTarget) &&
                  !(currentRole === 'ADMIN' && roleLabel === 'OWNER');
                return (
                  <div key={user.id} className="px-3 py-3 grid gap-3">
                    <button
                      type="button"
                      onClick={() => setExpandedUserId((current) => (current === user.id ? null : user.id))}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-left hover:border-slate-700"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="font-semibold text-slate-200 truncate">{user.username}</p>
                          {user.isBanned ? (
                            <span className="ml-1 px-2 py-0.5 bg-red-600/20 border border-red-500 text-red-500 text-[10px] font-bold rounded uppercase tracking-wider">BANNED</span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-500">Role: {roleLabel}</p>
                      </div>
                      <div className="shrink-0 text-slate-500">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </div>
                    </button>

                    {isExpanded ? (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-slate-500">
                            XP {user.xp} · Level {Math.floor(user.xp / 1000) + 1} · Balance {user.balance} · {user.isBanned ? 'BANNED' : 'ACTIVE'}
                          </p>
                          <button
                            onClick={() => {
                              if (user.isBanned) {
                                void handleToggleBan(user.id, true);
                                return;
                              }
                              openBanModal(user);
                            }}
                            disabled={isBusy}
                            className={`h-10 px-4 rounded-lg text-xs font-semibold uppercase ${
                              user.isBanned
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'bg-red-600 hover:bg-red-500 text-white'
                            } disabled:opacity-60`}
                          >
                            {user.isBanned ? 'UNBAN USER' : 'BAN USER'}
                          </button>
                        </div>
                        {user.isBanned ? (
                          <p className="text-xs text-red-300">
                            {getBanDurationLabel(user.banExpiresAt)}{user.banReason ? ` · Reason: ${user.banReason}` : ''}
                          </p>
                        ) : null}

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <input
                            value={usernameDrafts[user.id] ?? ''}
                            onChange={(event) =>
                              setUsernameDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value,
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                            placeholder="Username"
                          />

                          {canEditRole ? (
                            <select
                              value={roleDrafts[user.id] ?? 'USER'}
                              onChange={(event) =>
                                setRoleDrafts((prev) => ({
                                  ...prev,
                                  [user.id]: event.target.value as AdminRole,
                                }))
                              }
                              className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                              disabled={!isFounderViewer && isFounderTarget}
                            >
                              <option value="USER">USER</option>
                              <option value="SUPPORT">SUPPORT</option>
                              <option value="MODERATOR">MODERATOR</option>
                              <option value="ADMIN">ADMIN</option>
                              {isFounderViewer ? <option value="OWNER">OWNER</option> : null}
                            </select>
                          ) : (
                            <div className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-400 text-xs uppercase flex items-center">
                              Role: {roleLabel}
                            </div>
                          )}

                          <input
                            type="number"
                            value={balanceDrafts[user.id] ?? ''}
                            onChange={(event) =>
                              setBalanceDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value,
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                            placeholder="Balance"
                          />

                          <input
                            type="number"
                            value={xpDrafts[user.id] ?? ''}
                            onChange={(event) =>
                              setXpDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value,
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                            placeholder="XP"
                          />

                          <input
                            type="number"
                            min={1}
                            value={levelDrafts[user.id] ?? ''}
                            onChange={(event) =>
                              setLevelDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value,
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                            placeholder="Level"
                          />

                          <input
                            value={clanTagDrafts[user.id] ?? ''}
                            onChange={(event) =>
                              setClanTagDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase(),
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                            placeholder="ClanTag"
                          />

                          <select
                            value={selectedRankTagDrafts[user.id] ?? 'BRONZE'}
                            onChange={(event) =>
                              setSelectedRankTagDrafts((prev) => ({
                                ...prev,
                                [user.id]: event.target.value as RankTag,
                              }))
                            }
                            className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                          >
                            {RANK_TAG_OPTIONS.map((tag) => (
                              <option key={tag} value={tag}>
                                {tag}
                              </option>
                            ))}
                          </select>

                          <button
                            onClick={() => void handleSaveProfile(user.id, user.isBanned)}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            Save Profile
                          </button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                          <button
                            onClick={() => void handleQuickAction(user.id, 'add-balance-1000')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            +1K Balance
                          </button>
                          <button
                            onClick={() => void handleQuickAction(user.id, 'add-balance-10000')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            +10K Balance
                          </button>
                          <button
                            onClick={() => void handleQuickAction(user.id, 'add-xp-1000')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-indigo-700 hover:bg-indigo-600 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            +1K XP
                          </button>
                          <button
                            onClick={() => void handleQuickAction(user.id, 'add-xp-10000')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            +10K XP
                          </button>
                          <button
                            onClick={() => void handleQuickAction(user.id, 'reset-daily')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            Reset Daily
                          </button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                          <button
                            onClick={() => void handleQuickAction(user.id, 'reset-quests')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            Reset Quests
                          </button>
                          <button
                            onClick={() => void handleQuickAction(user.id, 'reset-social')}
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            Reset Social
                          </button>
                          <button
                            onClick={() =>
                              void handleQuickAction(
                                user.id,
                                'delete-user',
                                `Delete user ${user.username} permanently?`
                              )
                            }
                            disabled={isBusy}
                            className="h-9 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-60 text-white text-xs font-semibold"
                          >
                            Delete User
                          </button>
                          <div className="flex items-center gap-2">
                            <input
                              type="password"
                              value={passwordDrafts[user.id] ?? ''}
                              onChange={(event) =>
                                setPasswordDrafts((prev) => ({
                                  ...prev,
                                  [user.id]: event.target.value,
                                }))
                              }
                              className="h-9 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 text-slate-100"
                              placeholder="New password (min 8)"
                            />
                            <button
                              onClick={() => void handleSetPassword(user.id)}
                              disabled={isBusy}
                              className="h-9 px-3 rounded-lg bg-fuchsia-700 hover:bg-fuchsia-600 disabled:opacity-60 text-white text-xs font-semibold"
                            >
                              Set PW
                            </button>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </div>
                );
              })
            : null}
        </div>
      </div>
      ) : null}

      {activeTab === 'roles' && permissions.canManageRoles ? (
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Roles</p>
          <p className="text-sm text-slate-400">Use User Management to assign roles. OWNER can assign all roles, ADMIN can assign up to ADMIN.</p>
        </div>
      ) : null}

      {activeTab === 'logs' && permissions.moderationLogs ? (
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Moderation / Ban Tools</p>
          <div className="rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800">
            {loading ? <p className="px-3 py-4 text-sm text-slate-500">Loading users...</p> : null}
            {!loading && visibleUsers.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">No users found.</p> : null}
            {!loading
              ? visibleUsers.map((user) => {
                  const isBusy = busyUserId === user.id;
                  const roleLabel = VALID_ADMIN_ROLES.includes(user.role as AdminRole) ? (user.role as AdminRole) : 'USER';
                  const isProtectedTarget =
                    roleLabel === 'OWNER' ||
                    (currentRole === 'MODERATOR' && roleLabel === 'ADMIN') ||
                    (currentRole === 'SUPPORT' && roleLabel !== 'USER');

                  return (
                    <div key={`mod-${user.id}`} className="px-3 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-200 truncate">{user.username}</p>
                        <p className="text-xs text-slate-500">Role: {roleLabel} · {user.isBanned ? 'BANNED' : 'ACTIVE'}</p>
                      </div>
                      <button
                        onClick={() => {
                          if (user.isBanned) {
                            void handleToggleBan(user.id, true);
                            return;
                          }
                          openBanModal(user);
                        }}
                        disabled={isBusy || isProtectedTarget || user.id === currentUserId}
                        className={`h-9 px-3 rounded-lg text-xs font-semibold ${
                          user.isBanned ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {user.isBanned ? 'UNBAN USER' : 'BAN USER'}
                      </button>
                    </div>
                  );
                })
              : null}
          </div>
        </div>
      ) : null}

      {activeTab === 'helpdesk' && permissions.helpDesk ? (
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Help Desk</p>
          <p className="text-sm text-slate-400">Guest and user tickets are listed here. Use Support tab for full threaded replies.</p>
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800">
            {helpDeskTickets.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">No tickets found.</p> : null}
            {helpDeskTickets.slice(0, 20).map((ticket) => (
              <div key={ticket.id} className="px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-100">{ticket.subject}</p>
                  <span className="text-[11px] uppercase text-cyan-300">{ticket.status.replace('_', ' ')}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {ticket.category} · {ticket.user?.username ? `User: ${ticket.user.username}` : `Guest: ${ticket.guestUsername || 'Anonymous'}`} · {ticket.guestContact ? `Contact: ${ticket.guestContact}` : 'No contact'}
                </p>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">{ticket.content || 'No message content available.'}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <MaintenanceConfigModal
        open={maintenanceModalOpen}
        isMaintenanceMode={maintenanceEnabledDraft}
        modeType={maintenanceModeType}
        endAt={maintenanceEndDraft}
        submitting={maintenanceSubmitting}
        onClose={() => setMaintenanceModalOpen(false)}
        onToggleMaintenance={(next) => setMaintenanceEnabledDraft(next)}
        onChangeMode={(next) => setMaintenanceModeType(next)}
        onChangeEndAt={(next) => setMaintenanceEndDraft(next)}
        onSubmit={() => {
          void submitMaintenanceSettings();
        }}
      />

      <BanConfigModal
        target={banModalTarget}
        duration={banDurationDraft}
        reasonPreset={banReasonPreset}
        customReason={banReasonDraft}
        busy={Boolean(busyUserId)}
        onClose={closeBanModal}
        onChangeDuration={setBanDurationDraft}
        onChangeReasonPreset={setBanReasonPreset}
        onChangeCustomReason={setBanReasonDraft}
        onSubmit={() => {
          if (!banModalTarget) {
            return;
          }

          const reason = banReasonPreset === 'Custom Reason' ? banReasonDraft.trim() : banReasonPreset;
          void handleToggleBan(banModalTarget.id, false, {
            duration: banDurationDraft,
            reason,
          });
          closeBanModal();
        }}
      />

      {notice ? <p className="mt-4 text-sm text-slate-400">{notice}</p> : null}
    </div>
  );
}

function MaintenanceConfigModal({
  open,
  isMaintenanceMode,
  modeType,
  endAt,
  submitting,
  onClose,
  onToggleMaintenance,
  onChangeMode,
  onChangeEndAt,
  onSubmit,
}: {
  open: boolean;
  isMaintenanceMode: boolean;
  modeType: MaintenanceModeType;
  endAt: string;
  submitting: boolean;
  onClose: () => void;
  onToggleMaintenance: (next: boolean) => void;
  onChangeMode: (next: MaintenanceModeType) => void;
  onChangeEndAt: (next: string) => void;
  onSubmit: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4">
      <div className="w-[95vw] max-w-xl rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <h3 className="text-lg font-bold text-white">Maintenance Configuration</h3>
        <p className="mt-1 text-sm text-slate-400">Setze den globalen Systemstatus mit optionalem Endzeitpunkt.</p>

        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/70 px-3 py-2">
            <span className="text-sm text-slate-200">Wartungsmodus aktivieren</span>
            <input
              type="checkbox"
              checked={isMaintenanceMode}
              onChange={(event) => onToggleMaintenance(event.target.checked)}
              className="h-4 w-4"
            />
          </label>

          <fieldset className="space-y-2 rounded-lg border border-slate-700 bg-slate-950/70 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Dauer</legend>

            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="radio"
                name="maintenance-duration"
                value="indefinite"
                checked={modeType === 'indefinite'}
                onChange={() => onChangeMode('indefinite')}
                disabled={!isMaintenanceMode}
              />
              Unbestimmte Zeit
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-200">
              <input
                type="radio"
                name="maintenance-duration"
                value="scheduled"
                checked={modeType === 'scheduled'}
                onChange={() => onChangeMode('scheduled')}
                disabled={!isMaintenanceMode}
              />
              Geplantes Ende (Datum & Uhrzeit)
            </label>

            {isMaintenanceMode && modeType === 'scheduled' ? (
              <input
                type="datetime-local"
                value={endAt}
                onChange={(event) => onChangeEndAt(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-cyan-500"
              />
            ) : null}
          </fieldset>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-slate-700 px-3 text-xs font-bold uppercase text-slate-300"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting}
            className="h-10 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-3 text-xs font-bold uppercase text-cyan-200 disabled:opacity-60"
          >
            {submitting ? 'Aktualisiere...' : 'System-Status aktualisieren'}
          </button>
        </div>
      </div>
    </div>
  );
}

function BanConfigModal({
  target,
  duration,
  reasonPreset,
  customReason,
  busy,
  onClose,
  onChangeDuration,
  onChangeReasonPreset,
  onChangeCustomReason,
  onSubmit,
}: {
  target: AdminUser | null;
  duration: BanDurationOption;
  reasonPreset: BanReasonOption;
  customReason: string;
  busy: boolean;
  onClose: () => void;
  onChangeDuration: (next: BanDurationOption) => void;
  onChangeReasonPreset: (next: BanReasonOption) => void;
  onChangeCustomReason: (next: string) => void;
  onSubmit: () => void;
}) {
  if (!target) {
    return null;
  }

  const disableSubmit = busy || (reasonPreset === 'Custom Reason' && customReason.trim().length < 3);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4">
      <div className="w-[95vw] max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <h3 className="text-lg font-bold text-white">Ban User</h3>
        <p className="mt-1 text-sm text-slate-400">{target.username} wird temporär oder permanent gesperrt.</p>

        <div className="mt-4 grid gap-3">
          <label className="text-xs uppercase tracking-wide text-slate-400">Dauer</label>
          <select
            value={duration}
            onChange={(event) => onChangeDuration(event.target.value as BanDurationOption)}
            className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
          >
            <option value="1h">1 Stunde</option>
            <option value="24h">24 Stunden</option>
            <option value="1w">1 Woche</option>
            <option value="permanent">Permanent</option>
          </select>

          <label className="text-xs uppercase tracking-wide text-slate-400">Grund</label>
          <select
            value={reasonPreset}
            onChange={(event) => onChangeReasonPreset(event.target.value as BanReasonOption)}
            className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
          >
            <option value="Spam">Spam</option>
            <option value="Toxicity">Toxicity</option>
            <option value="Cheating">Cheating</option>
            <option value="Custom Reason">Custom Reason</option>
          </select>

          {reasonPreset === 'Custom Reason' ? (
            <input
              value={customReason}
              onChange={(event) => onChangeCustomReason(event.target.value.slice(0, 240))}
              placeholder="Custom reason"
              className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
            />
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-slate-700 px-3 text-xs font-bold uppercase text-slate-300"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={disableSubmit}
            className="h-10 rounded-lg border border-red-500/40 bg-red-500/15 px-3 text-xs font-bold uppercase text-red-200 disabled:opacity-60"
          >
            BAN USER
          </button>
        </div>
      </div>
    </div>
  );
}
