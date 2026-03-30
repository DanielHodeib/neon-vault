'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  House,
  Wallet,
  TrendingUp,
  Coins,
  Menu,
  ShieldCheck,
  Activity,
  Spade,
  CircleDashed,
  Hand,
  Users,
  Settings,
  Send,
  MessageSquare,
  LogOut,
  X,
  Eye,
  Trash2,
  Ban,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import dynamic from 'next/dynamic';
import toast from 'react-hot-toast';

import BlackjackGame from '@/components/games/BlackjackGame';
import CrashGame from '@/components/games/CrashGame';
import RouletteGame from '@/components/games/RouletteGame';
import SlotsGame from '@/components/games/SlotsGame';
import PokerGame from '@/components/games/PokerGame';
import PokerFriendsGame from '@/components/games/PokerFriendsGame';
import CoinflipGame from '@/components/games/CoinflipGame';
import CyberAviator from '@/components/games/CyberAviator';
import Friends from '@/components/Friends';
import SupportPanel from '@/components/SupportPanel';
import SendMoneyModal from '@/components/SendMoneyModal';
import MaintenanceScreen from '@/components/MaintenanceScreen';
import ProfilePopup from '@/components/ProfilePopup';
import Sidebar from '@/components/Layout/Sidebar';
import LeaderboardPanel from '@/components/LeaderboardPanel';
import QuestsPanel from '@/components/QuestsPanel';
import AnnouncementOverlay from '@/components/AnnouncementOverlay';
import GlobalEventBanner from '@/components/GlobalEventBanner';
import CorporateFooter from '@/components/CorporateFooter';
import NotificationCenter from '@/components/NotificationCenter';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { formatCompactNumber, formatMoney, formatUserBalance } from '@/lib/formatMoney';
import { getRoleBadge } from '@/lib/roleBadge';
import { canUseRankTag, getRankColor, RANKS, type RankTag } from '@/lib/ranks';
import { useCasinoStore } from '../../store/useCasinoStore';

const AdminPanel = dynamic(() => import('@/components/AdminPanel'));

type Tab = 'crash' | 'crash-aviator' | 'slots' | 'blackjack' | 'roulette' | 'poker' | 'coinflip' | 'friends' | 'leaderboard' | 'quests' | 'support' | 'settings' | 'admin';
type PokerMode = 'solo' | 'friends';
type SettingsSection = 'overview' | 'profile' | 'appearance' | 'gameplay' | 'privacy' | 'security';

interface ChatMessage {
  id: string;
  username: string;
  userId?: string | null;
  isBanned?: boolean;
  user?: {
    id?: string | null;
    isBanned?: boolean;
  };
  text: string;
  createdAt: number;
  role?: string;
  isKing?: boolean;
  clanTag?: string | null;
  rankTag?: string;
  rankColor?: string;
  system?: boolean;
}

interface GlobalEventState {
  type: string;
  label: string;
  description: string;
  multiplier: number;
  color: string;
  endTime: number;
}

interface RainBannerState {
  active: boolean;
  amount: number;
  remainingSeconds: number;
  endsAt: number;
}

interface MaintenanceState {
  isMaintenanceMode: boolean;
  maintenanceEndTime: string | null;
}

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string | number;
}

interface CrashPlayer {
  username: string;
  amount: number;
  cashedOut: boolean;
  cashedAt: number | null;
}

interface CrashState {
  phase: 'waiting' | 'running' | 'crashed';
  multiplier: number;
  crashPoint: number | null;
  history: number[];
  players: CrashPlayer[];
  roundStartAt: number;
}

interface FriendSummary {
  friendshipId: string;
  userId: string;
  username: string;
  role?: string;
}

interface OnlinePlayerSummary {
  userId?: string | null;
  username: string;
  role?: string | null;
  online?: boolean;
  activity?: string;
}

interface BlockSummary {
  blockId: string;
  userId: string;
  username: string;
  role?: string;
}

interface SettingsPayload {
  soundEnabled: boolean;
  theme: ThemeOption;
  selectedRankTag: RankTag;
  publicProfile: boolean;
  bio: string;
  favoriteGame?: string;
  privacyShowBalance?: boolean;
  publicGameHistory?: boolean;
  clanTag?: string | null;
}

type ThemeOption = 'slate' | 'steel' | 'sunset' | 'ocean' | 'matrix';
type SuggestionType = 'mention' | 'emoji';

interface PublicProfileData {
  userId: string;
  username: string;
  role?: string;
  level: number;
  rank: string;
  avatarUrl?: string | null;
  bannerUrl?: string | null;
  balance: number | null;
  xp: number;
  favoriteGame: string;
  bio: string;
  theme: string;
  publicProfile: boolean;
  privacyShowBalance?: boolean;
  publicGameHistory?: boolean;
  isFriend: boolean;
  isSelf?: boolean;
  canShowBalance: boolean;
  createdAt: string;
  joinDate?: string;
  friendsCount: number;
}

type ProfileActionPayload = {
  userId: string;
  username: string;
  role?: string;
  isFriend?: boolean;
};

const EMOJI_MAP: Record<string, string> = {
  ':cry:': '😢',
  ':smile:': '😊',
  ':fire:': '🔥',
  ':nvc:': '💎',
  ':rocket:': '🚀',
  ':skull:': '💀',
};

const ENABLE_RENDER_PROFILING = process.env.NODE_ENV === 'development';

function replaceEmojiShortcodes(text: string) {
  return text.replace(/:[a-z0-9_+-]+:/gi, (match) => EMOJI_MAP[match.toLowerCase()] ?? match);
}

function RenderChatMessage({ text, onMentionClick }: { text: string; onMentionClick: (username: string) => void }) {
  const parts = text.split(/(@\w+|:\w+:)/g);

  return (
    <>
      {parts.map((part, index) => {
        if (/^:\w+:$/.test(part)) {
          const emoji = EMOJI_MAP[part.toLowerCase()];
          if (emoji) {
            return <React.Fragment key={`emoji-${index}-${part}`}>{emoji}</React.Fragment>;
          }
        }

        if (/^@\w+$/.test(part)) {
          const mentionedUsername = part.substring(1);
          return (
            <button
              key={`mention-${index}-${part}`}
              type="button"
              onClick={() => onMentionClick(mentionedUsername)}
              className="cursor-pointer text-cyan-400 font-bold hover:underline bg-cyan-500/10 px-1 rounded transition-all"
            >
              {part}
            </button>
          );
        }

        return <React.Fragment key={`text-${index}`}>{replaceEmojiShortcodes(part)}</React.Fragment>;
      })}
    </>
  );
}

function getSocketUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SOCKET_URL ?? process.env.NEXT_PUBLIC_GAME_SERVER_URL;
  const fallbackUrl = 'http://63.179.106.186:5000';

  if (typeof window === 'undefined') {
    return fromEnv ?? fallbackUrl;
  }

  if (fromEnv === 'same-origin') {
    return window.location.origin;
  }

  if (!fromEnv) {
    return fallbackUrl;
  }

  try {
    const parsed = new URL(fromEnv);
    const appHost = window.location.hostname;

    if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && appHost !== 'localhost' && appHost !== '127.0.0.1') {
      parsed.hostname = appHost;
      return parsed.toString().replace(/\/$/, '');
    }

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return fallbackUrl;
  }
}

function shouldForcePolling(socketUrl: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const parsed = new URL(socketUrl);
    return window.location.protocol === 'https:' && parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

export default function MainHubRealtime({
  initialUsername,
  initialTab = 'crash',
}: {
  initialUsername?: string;
  initialTab?: Tab;
}) {
  const router = useRouter();
  const {
    balance,
    username,
    xp,
    useCompactBalance,
    daily,
    toggleCompactBalance,
    fetchInitialBalance,
    hydrateFromSession,
    syncBalanceFromServer,
    addWin,
    persistWalletAction,
    announcement,
    setAnnouncement,
  } = useCasinoStore();

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [isChatVisible, setIsChatVisible] = useState(true);
    const [notificationOpen, setNotificationOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [hadSocketConnection, setHadSocketConnection] = useState(false);
  const [socketReconnecting, setSocketReconnecting] = useState(false);

  const [crashState, setCrashState] = useState<CrashState>({
    phase: 'waiting',
    multiplier: 1,
    crashPoint: null,
    history: [],
    players: [],
    roundStartAt: 0,
  });

  const [betInput, setBetInput] = useState('100');
  const [autoCashOutEnabled, setAutoCashOutEnabled] = useState(false);
  const [autoCashOutInput, setAutoCashOutInput] = useState('2');
  const [crashCountdownSeconds, setCrashCountdownSeconds] = useState(0);
  const [hasBet, setHasBet] = useState(false);
  const [isPlacingCrashBet, setIsPlacingCrashBet] = useState(false);
  const [isCrashBetCooldown, setIsCrashBetCooldown] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [payoutToast, setPayoutToast] = useState<{ label: string; text: string; tone: 'auto' | 'manual' } | null>(null);
  const [crashRoomId, setCrashRoomId] = useState('global');
  const [crashRoomInput, setCrashRoomInput] = useState('global');
  const [crashRoomMembers, setCrashRoomMembers] = useState<string[]>([]);
  const [joiningCrashRoom, setJoiningCrashRoom] = useState(false);
  const [pokerMode, setPokerMode] = useState<PokerMode>('friends');

  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [presenceByUsername, setPresenceByUsername] = useState<Record<string, { online: boolean; activity: string; userId?: string | null; role?: string | null }>>({});
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatInputCaret, setChatInputCaret] = useState(0);
  const [suggestionType, setSuggestionType] = useState<SuggestionType | null>(null);
  const [suggestionQuery, setSuggestionQuery] = useState('');
  const [friendSearch, setFriendSearch] = useState('');
  const [friendNotice, setFriendNotice] = useState('');
  const [friendsAccepted, setFriendsAccepted] = useState<FriendSummary[]>([]);
  const [pendingIncoming, setPendingIncoming] = useState<FriendSummary[]>([]);
  const [pendingOutgoing, setPendingOutgoing] = useState<FriendSummary[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockSummary[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsNotice, setSettingsNotice] = useState('');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('overview');
  const [compactSidebar, setCompactSidebar] = useState(false);
  const [showChatTimestamps, setShowChatTimestamps] = useState(true);
  const [showOnlinePresence, setShowOnlinePresence] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [quickBetPreset, setQuickBetPreset] = useState(100);
  const [friendRealtimeNotice, setFriendRealtimeNotice] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [theme, setTheme] = useState<ThemeOption>('slate');
  const [selectedRankTag, setSelectedRankTag] = useState<RankTag>('BRONZE');
  const [publicProfile, setPublicProfile] = useState(true);
  const [bio, setBio] = useState('');
  const [avatarUrlDraft, setAvatarUrlDraft] = useState('');
  const [bannerUrlDraft, setBannerUrlDraft] = useState('');
  const [favoriteGameDraft, setFavoriteGameDraft] = useState('Unknown');
  const [privacyShowBalance, setPrivacyShowBalance] = useState(false);
  const [publicGameHistory, setPublicGameHistory] = useState(false);
  const [clanDraft, setClanDraft] = useState('');
  const [incomingOpen, setIncomingOpen] = useState(true);
  const [outgoingOpen, setOutgoingOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernamePassword, setUsernamePassword] = useState('');
  const [passwordCurrent, setPasswordCurrent] = useState('');
  const [passwordNext, setPasswordNext] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [accountSaving, setAccountSaving] = useState(false);
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [accountNotice, setAccountNotice] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<PublicProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [showSendMoneyModal, setShowSendMoneyModal] = useState(false);
  const [moneyTarget, setMoneyTarget] = useState<{ userId: string; username: string; role?: string; balance: number } | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [currentUserIsBanned, setCurrentUserIsBanned] = useState(false);
  const [chatRole, setChatRole] = useState('USER');
  const [chatClanTag, setChatClanTag] = useState<string | null>(null);
  const [isKing, setIsKing] = useState(false);
  const [serverAdminAccess, setServerAdminAccess] = useState(false);
  const [adminAccessResolved, setAdminAccessResolved] = useState(false);
  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [maintenanceState, setMaintenanceState] = useState<MaintenanceState>({
    isMaintenanceMode: false,
    maintenanceEndTime: null,
  });
  const [rainBanner, setRainBanner] = useState<RainBannerState>({
    active: false,
    amount: 0,
    remainingSeconds: 0,
    endsAt: 0,
  });
  const [globalEvent, setGlobalEvent] = useState<GlobalEventState | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const hubRenderCountRef = useRef(0);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const incomingSeenRef = useRef<Set<string>>(new Set());
  const settingsHydratedRef = useRef(false);
  const hasBetRef = useRef(false);
  const isPlacingCrashBetRef = useRef(false);
  const crashBetAckTimeoutRef = useRef<number | null>(null);
  const crashBetCooldownTimerRef = useRef<number | null>(null);
  const crashBetCommittedRef = useRef(false);
  const committedCrashBetAmountRef = useRef<number>(0);
  const announcementTimeoutRef = useRef<number | null>(null);
  const lastCrashUiTickAtRef = useRef(0);

  hubRenderCountRef.current += 1;

  useEffect(() => {
    if (!ENABLE_RENDER_PROFILING) {
      return;
    }

    if (hubRenderCountRef.current % 25 === 0) {
      console.debug(`[perf] MainHubRealtime renders=${hubRenderCountRef.current}`);
    }
  });

  useEffect(() => {
    setIsMounted(true);
  }, []);
  const pendingCrashBetAmountRef = useRef<number | null>(null);
  const autoCashOutEnabledRef = useRef(false);
  const autoCashOutRef = useRef(2);
  const uniqueOnlineUsers = useMemo(() => {
    const seen = new Set<string>();
    const deduped: string[] = [];

    for (const rawName of onlineUsers) {
      const cleanName = String(rawName ?? '').trim();
      if (!cleanName) {
        continue;
      }

      const key = cleanName.toLowerCase();
      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      deduped.push(cleanName);
    }

    return deduped;
  }, [onlineUsers]);
  const uniqueOnlinePlayers = useMemo<OnlinePlayerSummary[]>(
    () =>
      uniqueOnlineUsers.map((username) => {
        const presence = presenceByUsername[username.toLowerCase()];
        return {
          username,
          userId: presence?.userId ?? null,
          role: presence?.role ?? null,
          online: presence?.online ?? true,
          activity: presence?.activity ?? 'Hub',
        };
      }),
    [presenceByUsername, uniqueOnlineUsers]
  );
  const onlineUsersSet = useMemo(() => new Set(uniqueOnlineUsers.map((name) => name.toLowerCase())), [uniqueOnlineUsers]);
  const hasDanielFriend = useMemo(
    () => friendsAccepted.some((friend) => friend.username.trim().toLowerCase() === 'daniel'),
    [friendsAccepted]
  );
  const effectiveUsername = useMemo(() => {
    const trimmedStore = (username ?? '').trim();
    if (trimmedStore && trimmedStore !== 'Guest') {
      return trimmedStore;
    }

    const trimmedInitial = (initialUsername ?? '').trim();
    return trimmedInitial || 'Guest';
  }, [username, initialUsername]);
  const hasAdminPanelAccess = useMemo(
    () => serverAdminAccess && ['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT'].includes(chatRole),
    [chatRole, serverAdminAccess]
  );
  const normalizedEffectiveUsername = useMemo(() => effectiveUsername.trim().toLowerCase(), [effectiveUsername]);
  const isCurrentCrashPlayer = useCallback(
    (player: CrashPlayer) => String(player.username ?? '').trim().toLowerCase() === normalizedEffectiveUsername,
    [normalizedEffectiveUsername]
  );

  useEffect(() => {
    if (adminAccessResolved && activeTab === 'admin' && !hasAdminPanelAccess) {
      setActiveTab('settings');
    }
  }, [activeTab, hasAdminPanelAccess, adminAccessResolved]);

  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, activeTab]);

  const level = useMemo(() => Math.floor(xp / 1000) + 1, [xp]);
  const levelBaseXp = useMemo(() => (level - 1) * 1000, [level]);
  const nextLevelXp = useMemo(() => level * 1000, [level]);
  const levelProgress = useMemo(() => Math.min(100, Math.round(((xp - levelBaseXp) / 1000) * 100)), [xp, levelBaseXp]);
  const mentionSuggestions = useMemo(() => {
    if (suggestionType !== 'mention') {
      return [];
    }

    const query = suggestionQuery;
    const normalizedSelf = normalizedEffectiveUsername;
    const uniqueUsers = uniqueOnlineUsers;

    return uniqueUsers
      .filter((name) => name.toLowerCase() !== normalizedSelf)
      .filter((name) => {
        if (!query) {
          return true;
        }
        return name.toLowerCase().startsWith(query) || name.toLowerCase().includes(query);
      })
      .slice(0, 6);
  }, [suggestionType, suggestionQuery, uniqueOnlineUsers, normalizedEffectiveUsername]);
  const emojiSuggestions = useMemo(() => {
    if (suggestionType !== 'emoji') {
      return [];
    }

    const query = suggestionQuery.toLowerCase();
    const emojiCodes = Object.keys(EMOJI_MAP);

    return emojiCodes
      .filter((code) => {
        const keyword = code.slice(1, -1).toLowerCase();
        if (!query) {
          return true;
        }

        return keyword.startsWith(query) || keyword.includes(query);
      })
      .slice(0, 8);
  }, [suggestionType, suggestionQuery]);
  const autoCashOutValue = useMemo(() => {
    const parsed = Number(autoCashOutInput);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.max(1, parsed);
  }, [autoCashOutInput]);
  const crashActiveBetAmount = useMemo(() => {
    const active = crashState.players.find((player) => isCurrentCrashPlayer(player) && !player.cashedOut);
    return active?.amount ?? 0;
  }, [crashState.players, isCurrentCrashPlayer]);

  const themeSurfaceClass = useMemo(() => {
    switch (theme) {
      case 'sunset':
        return 'bg-[radial-gradient(circle_at_top,_rgba(251,146,60,0.18),_rgba(15,23,42,1)_50%)]';
      case 'ocean':
        return 'bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_rgba(15,23,42,1)_50%)]';
      case 'matrix':
        return 'bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.2),_rgba(2,6,23,1)_55%)]';
      case 'steel':
        return 'bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.16),_rgba(15,23,42,1)_50%)]';
      case 'slate':
      default:
        return 'bg-slate-950';
    }
  }, [theme]);

  useEffect(() => {
    hasBetRef.current = hasBet;
  }, [hasBet]);

  useEffect(() => {
    autoCashOutEnabledRef.current = autoCashOutEnabled;
  }, [autoCashOutEnabled]);

  useEffect(() => {
    autoCashOutRef.current = autoCashOutValue;
  }, [autoCashOutValue]);

  useEffect(
    () => () => {
      if (crashBetCooldownTimerRef.current !== null) {
        window.clearTimeout(crashBetCooldownTimerRef.current);
      }
    },
    []
  );

  const startCrashBetCooldown = () => {
    if (crashBetCooldownTimerRef.current !== null) {
      window.clearTimeout(crashBetCooldownTimerRef.current);
    }

    setIsCrashBetCooldown(true);
    crashBetCooldownTimerRef.current = window.setTimeout(() => {
      setIsCrashBetCooldown(false);
      crashBetCooldownTimerRef.current = null;
    }, 1500);
  };

  const commitPendingCrashBet = useCallback(async () => {
    const pendingAmount = pendingCrashBetAmountRef.current;
    if (!pendingAmount || pendingAmount <= 0) {
      return true;
    }

    if (crashBetCommittedRef.current) {
      return true;
    }

    crashBetCommittedRef.current = true;
    const result = await persistWalletAction('bet', pendingAmount);
    if (result.ok) {
      committedCrashBetAmountRef.current = pendingAmount;
      pendingCrashBetAmountRef.current = null;
      return true;
    }

    crashBetCommittedRef.current = false;
    pendingCrashBetAmountRef.current = null;
    setHasBet(false);
    setErrorMsg(result.error ?? 'Bet booking failed.');

    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit('crash_cancel_bet', {}, () => {
        void syncBalanceFromServer();
      });
    } else {
      void syncBalanceFromServer();
    }

    return false;
  }, [persistWalletAction, syncBalanceFromServer]);

  const refundCommittedCrashBet = useCallback(async () => {
    const amount = committedCrashBetAmountRef.current;
    if (!amount || amount <= 0) {
      return;
    }

    committedCrashBetAmountRef.current = 0;
    crashBetCommittedRef.current = false;

    const result = await persistWalletAction('refund', amount);
    if (!result.ok) {
      void syncBalanceFromServer();
    }
  }, [persistWalletAction, syncBalanceFromServer]);

  useEffect(() => {
    if (crashState.phase !== 'waiting') {
      setCrashCountdownSeconds(0);
      return;
    }

    const updateCountdown = () => {
      if (!crashState.roundStartAt) {
        setCrashCountdownSeconds(0);
        return;
      }

      const remainingMs = Math.max(0, crashState.roundStartAt - Date.now());
      setCrashCountdownSeconds(Math.ceil(remainingMs / 1000));
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(interval);
  }, [crashState.phase, crashState.roundStartAt]);

  useEffect(() => {
    if (compactSidebar) {
      setSidebarCollapsed(true);
    }
  }, [compactSidebar]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const syncViewport = () => {
      const mobile = mediaQuery.matches;
      setIsMobileViewport(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
        setIsChatVisible(false);
      } else {
        setMobileChatOpen(false);
      }
    };

    syncViewport();

    mediaQuery.addEventListener('change', syncViewport);
    return () => mediaQuery.removeEventListener('change', syncViewport);
  }, []);

  useEffect(() => {
    setBetInput(String(quickBetPreset));
  }, [quickBetPreset]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    return () => {
      document.documentElement.removeAttribute('data-theme');
    };
  }, [theme]);

  const loadFriends = useCallback(async () => {
    setFriendsLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch('/api/friends', { 
          cache: 'no-store',
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!response.ok) {
          console.warn(`Friends API returned ${response.status}`);
          setFriendsAccepted([]);
          setPendingIncoming([]);
          setPendingOutgoing([]);
          setBlockedUsers([]);
          return;
        }

        const payload = (await response.json()) as {
          accepted: FriendSummary[];
          pendingIncoming: FriendSummary[];
          pendingOutgoing: FriendSummary[];
          blocked: BlockSummary[];
        };

        const nextIncoming = payload.pendingIncoming ?? [];
        const seen = incomingSeenRef.current;
        const nextIncomingIds = new Set(nextIncoming.map((request) => request.friendshipId));
        const hasNewIncoming = seen.size > 0 && nextIncoming.some((request) => !seen.has(request.friendshipId));

        if (hasNewIncoming) {
          setFriendRealtimeNotice('New friend request received.');
          toast.success('Neue Freundschaftsanfrage erhalten!', { id: 'friend-request-incoming' });
        }

        incomingSeenRef.current = nextIncomingIds;

        setFriendsAccepted(payload.accepted ?? []);
        setPendingIncoming(nextIncoming);
        setPendingOutgoing(payload.pendingOutgoing ?? []);
        setBlockedUsers(payload.blocked ?? []);
      } catch (fetchError) {
        clearTimeout(timeout);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.warn('Friends API request timed out after 5s');
        } else {
          console.error('Failed to fetch friends:', fetchError);
        }
        // Don't clear data on error, keep cached friends list
      }
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  const loadPresence = useCallback(async () => {
    try {
      const response = await fetch('/api/presence', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as {
        users?: Array<{ username: string; activity?: string; online?: boolean; userId?: string | null; role?: string | null }>;
      };

      const next: Record<string, { online: boolean; activity: string; userId?: string | null; role?: string | null }> = {};
      for (const user of payload.users ?? []) {
        const username = String(user?.username ?? '').trim();
        if (!username) {
          continue;
        }

        next[username.toLowerCase()] = {
          online: Boolean(user?.online),
          activity: String(user?.activity ?? 'Hub').trim() || 'Hub',
          userId: typeof user?.userId === 'string' ? user.userId : null,
          role: typeof user?.role === 'string' ? user.role : null,
        };
      }

      setPresenceByUsername(next);
    } catch {
      // Keep previous presence snapshot on request failures.
    }
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const [settingsResponse, profileResponse] = await Promise.all([
        fetch('/api/settings', { cache: 'no-store' }),
        fetch(`/api/profile/${encodeURIComponent(effectiveUsername)}`, { cache: 'no-store' }),
      ]);

      if (!settingsResponse.ok) {
        console.warn(`Settings API returned ${settingsResponse.status}`);
        return;
      }

      const payload = (await settingsResponse.json()) as { settings?: SettingsPayload };
      if (!payload.settings) {
        return;
      }

      setSoundEnabled(payload.settings.soundEnabled);
      setTheme(payload.settings.theme);
      setSelectedRankTag(payload.settings.selectedRankTag ?? 'BRONZE');
      setPublicProfile(payload.settings.publicProfile);
      setBio(payload.settings.bio ?? '');
      setFavoriteGameDraft(payload.settings.favoriteGame ?? 'Unknown');
      setPrivacyShowBalance(Boolean(payload.settings.privacyShowBalance));
      setPublicGameHistory(Boolean(payload.settings.publicGameHistory));
      setClanDraft(payload.settings.clanTag ?? '');

      if (profileResponse.ok) {
        const profilePayload = (await profileResponse.json()) as { profile?: PublicProfileData };
        if (profilePayload.profile) {
          setAvatarUrlDraft(profilePayload.profile.avatarUrl ?? '');
          setBannerUrlDraft(profilePayload.profile.bannerUrl ?? '');
        }
      }

      settingsHydratedRef.current = true;
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, [effectiveUsername]);

  useEffect(() => {
    setUsernameDraft(effectiveUsername);
  }, [effectiveUsername]);

  useEffect(() => {
    void hydrateFromSession();
    void fetchInitialBalance();
  }, [fetchInitialBalance, hydrateFromSession]);

  useEffect(() => {
    void loadFriends();
    void loadPresence();
    void loadSettings();

    const interval = window.setInterval(() => {
      void loadFriends();
      void loadPresence();
    }, 7000);

    return () => window.clearInterval(interval);
  }, [loadFriends, loadPresence, loadSettings]);

  useEffect(() => {
    if (!friendRealtimeNotice) {
      return;
    }

    const timeout = window.setTimeout(() => setFriendRealtimeNotice(''), 2800);
    return () => window.clearTimeout(timeout);
  }, [friendRealtimeNotice]);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      try {
        const response = await fetch('/api/me', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          user?: {
            id?: string;
            role?: string;
            isBanned?: boolean;
            clanTag?: string | null;
          };
        };

        if (!isActive || !payload.user) {
          return;
        }

        setChatRole((payload.user.role ?? 'USER').toUpperCase());
        setCurrentUserId(String(payload.user.id ?? ''));
        setCurrentUserIsBanned(Boolean(payload.user.isBanned));
        setChatClanTag(payload.user.clanTag ?? null);

        const adminResponse = await fetch('/api/admin/me', { cache: 'no-store' });
        if (adminResponse.ok) {
          const adminPayload = (await adminResponse.json()) as { canAccessAdminPanel?: boolean; isAdmin?: boolean };
          setServerAdminAccess(Boolean(adminPayload.canAccessAdminPanel ?? adminPayload.isAdmin));
        } else {
          setServerAdminAccess(false);
        }
        setAdminAccessResolved(true);
      } catch {
        // Keep defaults if profile fetch fails.
        setServerAdminAccess(false);
        setAdminAccessResolved(true);
      }
    })();

    return () => {
      isActive = false;
    };
  }, []);

  const toggleChat = useCallback(() => {
    if (isMobileViewport) {
      setMobileChatOpen((current) => {
        const next = !current;
        if (next) {
          setUnreadMessagesCount(0);
        }
        return next;
      });
      return;
    }

    setIsChatVisible((current) => {
      const next = !current;
      if (next) {
        setUnreadMessagesCount(0);
      }
      return next;
    });
  }, [isMobileViewport]);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch('/api/system/status', { cache: 'no-store' });
        const payload = (await response.json()) as {
          maintenance?: {
            isMaintenanceMode?: boolean;
            maintenanceEndTime?: string | null;
          };
        };

        if (!active) {
          return;
        }

        if (response.ok && payload.maintenance) {
          setMaintenanceState({
            isMaintenanceMode: Boolean(payload.maintenance.isMaintenanceMode),
            maintenanceEndTime: payload.maintenance.maintenanceEndTime ?? null,
          });
        }
      } finally {
        if (active) {
          setMaintenanceLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    const syncKingStatus = async () => {
      try {
        const response = await fetch('/api/leaderboard/daily', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as {
          dailyLeaderboard?: Array<{ username: string; isKing: boolean }>;
        };

        if (!isActive) {
          return;
        }

        const kingEntry = (payload.dailyLeaderboard ?? []).find((entry) => entry.isKing);
        const kingUsername = kingEntry?.username?.trim().toLowerCase() ?? '';
        setIsKing(kingUsername !== '' && kingUsername === normalizedEffectiveUsername);
      } catch {
        // Keep current king status if refresh fails.
      }
    };

    void syncKingStatus();
    const interval = window.setInterval(() => {
      void syncKingStatus();
    }, 60000);

    return () => {
      isActive = false;
      window.clearInterval(interval);
    };
  }, [normalizedEffectiveUsername]);

  useEffect(() => {
    const socketUrl = getSocketUrl();
    const forcePolling = shouldForcePolling(socketUrl);
    const socket: Socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      withCredentials: true,
      upgrade: !forcePolling,
      query: { 
        userId: currentUserId,
        username: effectiveUsername, 
        role: chatRole,
        isBanned: currentUserIsBanned ? 'true' : 'false',
        isKing: isKing ? 'true' : 'false',
        clanTag: chatClanTag ?? '',
        xp: String(xp),
        balance: String(balance),
        selectedRankTag: selectedRankTag,
        crashRoomId: 'global' 
      },
    });
    socketRef.current = socket;

    const cashoutHandler = async (payload: { ok: boolean; payout: number; multiplier: number; mode: 'auto' | 'manual' }) => {
      if (!payload.ok || payload.payout <= 0) {
        return;
      }

      committedCrashBetAmountRef.current = 0;
      crashBetCommittedRef.current = false;
      pendingCrashBetAmountRef.current = null;
      addWin(payload.payout, {
        source: 'crash',
        multiplier: payload.multiplier,
      });
      setHasBet(false);
      setPayoutToast({
        label: payload.mode === 'auto' ? 'Auto Cashout' : 'Manual Cashout',
        text: `${payload.multiplier.toFixed(2)}x · +${payload.payout.toFixed(2)} NVC`,
        tone: payload.mode,
      });
    };

    const connectHandler = () => {
      setSocketConnected(true);
      setHadSocketConnection(true);
      setSocketReconnecting(false);
    };
    const disconnectStatusHandler = () => {
      setSocketConnected(false);
      setSocketReconnecting(true);
    };
    const disconnectRecoveryHandler = async () => {
      if (crashBetAckTimeoutRef.current !== null) {
        window.clearTimeout(crashBetAckTimeoutRef.current);
        crashBetAckTimeoutRef.current = null;
      }

      if (hasBetRef.current && crashBetCommittedRef.current && committedCrashBetAmountRef.current > 0) {
        await refundCommittedCrashBet();
        setErrorMsg('Connection lost. Active bet refunded.');
      }

      if (pendingCrashBetAmountRef.current && !crashBetCommittedRef.current) {
        setErrorMsg('Connection lost while placing bet.');
      }

      pendingCrashBetAmountRef.current = null;
      crashBetCommittedRef.current = false;
      committedCrashBetAmountRef.current = 0;
      isPlacingCrashBetRef.current = false;
      setIsPlacingCrashBet(false);
      setHasBet(false);
    };

    const onlineUsersHandler = (users: string[]) => {
      setOnlineUsers(users ?? []);
      void loadPresence();
    };
    const chatHistoryHandler = (history: ChatMessage[]) => setChatMessages(history);
    const chatMessageHandler = (message: ChatMessage) => {
      setChatMessages((prev) => [...prev, message].slice(-60));

      const chatVisible = isMobileViewport ? mobileChatOpen : isChatVisible;
      const isOwnMessage = message.username.trim().toLowerCase() === effectiveUsername.trim().toLowerCase();
      if (!chatVisible && !isOwnMessage) {
        setUnreadMessagesCount((current) => current + 1);
      }
    };

    const chatMentionHandler = (payload: { sender?: string; message?: string; mentioned?: string }) => {
      const sender = typeof payload?.sender === 'string' ? payload.sender.trim() : '';
      if (!sender) {
        return;
      }

      toast.success(`@${sender} hat dich im Chat erwähnt!`, { icon: '💬' });

      try {
        const ping = new Audio('/sounds/mention.mp3');
        ping.volume = 0.4;
        void ping.play();
      } catch {
        // Optional audio ping should never break chat UX.
      }
    };

    const notificationHandler = (payload: { message?: string }) => {
      const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
      if (!message) {
        return;
      }
      toast.success(message, { id: `notify-${message}` });
    };

    const newNotificationHandler = (payload: NotificationItem) => {
      if (!payload || !payload.id) {
        return;
      }

      setNotifications((current) => [payload, ...current.filter((item) => item.id !== payload.id)].slice(0, 40));
      toast.success(payload.title || 'New notification', { id: `notif-${payload.id}` });
    };

    const ticketReplyHandler = (payload: { message?: string; ticketId?: string }) => {
      const message = typeof payload?.message === 'string' ? payload.message.trim() : 'Support replied to your ticket.';
      toast.success(message, { id: `support-reply-${payload?.ticketId ?? Date.now()}` });
    };

    const globalNotificationHandler = (payload: { message?: string }) => {
      const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
      if (!message) {
        return;
      }
      toast(message, { id: `global-${message}` });
    };

    const adminBroadcastHandler = (payload: { message?: string }) => {
      const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
      if (!message) {
        return;
      }

      setAnnouncement(message);
      if (announcementTimeoutRef.current !== null) {
        window.clearTimeout(announcementTimeoutRef.current);
      }
      announcementTimeoutRef.current = window.setTimeout(() => {
        setAnnouncement(null);
        announcementTimeoutRef.current = null;
      }, 10000);
    };

    const rainStartedHandler = (payload: { amount?: number; endsAt?: number }) => {
      const amount = Math.max(0, Math.floor(Number(payload?.amount ?? 0)));
      const endsAt = Number(payload?.endsAt ?? 0);
      const remainingSeconds = endsAt > 0 ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0;

      setRainBanner({
        active: true,
        amount,
        remainingSeconds,
        endsAt,
      });
    };

    const rainTickHandler = (payload: { amount?: number; remainingSeconds?: number; endsAt?: number }) => {
      setRainBanner((current) => ({
        active: true,
        amount: Math.max(0, Math.floor(Number(payload?.amount ?? current.amount ?? 0))),
        remainingSeconds: Math.max(0, Math.floor(Number(payload?.remainingSeconds ?? 0))),
        endsAt: Number(payload?.endsAt ?? current.endsAt ?? 0),
      }));
    };

    const rainEndedHandler = () => {
      setRainBanner({
        active: false,
        amount: 0,
        remainingSeconds: 0,
        endsAt: 0,
      });
    };

    const rainRewardHandler = (payload: { amount?: number }) => {
      const amount = Math.max(0, Math.floor(Number(payload?.amount ?? 0)));
      if (amount <= 0) {
        return;
      }

      addWin(amount, {
        source: 'rain',
        tier: 'community',
        multiplier: 0,
      });
      toast.success(`Rain reward: +${amount} NVC`, { id: `rain-${Date.now()}` });
    };

    const globalEventStartedHandler = (payload: GlobalEventState) => {
      setGlobalEvent(payload);
    };
    const globalEventEndedHandler = () => {
      setGlobalEvent(null);
    };

    const userProfileDataHandler = (payload: PublicProfileData) => {
      setSelectedProfile({
        ...payload,
        isSelf: payload.username.trim().toLowerCase() === normalizedEffectiveUsername,
      });
      setProfileLoading(false);
    };

    const cashbackRewardHandler = (payload: { cashback?: number; source?: string }) => {
      const amount = Number(payload?.cashback ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) {
        return;
      }

      toast.success(`Event Cashback +${amount.toFixed(2)} NVC (${payload?.source ?? 'game'})`, {
        id: `cashback-${Date.now()}`,
      });
      void syncBalanceFromServer();
    };

    const walletRefreshRequiredHandler = () => {
      void syncBalanceFromServer();
    };

    const forceLogoutHandler = (payload: { reason?: string; message?: string }) => {
      const reason = typeof payload?.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : typeof payload?.reason === 'string' && payload.reason.trim()
          ? payload.reason.trim()
          : 'You have been banned.';
      toast.error(reason, { duration: 4000 });
      try {
        window.sessionStorage.setItem('login_error', reason);
      } catch {
        // Ignore storage errors.
      }
      void signOut({ redirect: false }).finally(() => {
        window.location.href = '/login';
      });
    };

    const maintenanceUpdateHandler = (payload: { isMaintenanceMode?: boolean; maintenanceEndTime?: string | null }) => {
      setMaintenanceLoading(false);
      setMaintenanceState({
        isMaintenanceMode: Boolean(payload?.isMaintenanceMode),
        maintenanceEndTime: payload?.maintenanceEndTime ?? null,
      });
    };

    const bannedStatusChangedHandler = (payload: { userId?: string | null; username?: string | null; isBanned?: boolean }) => {
      const targetUserId = typeof payload?.userId === 'string' ? payload.userId : '';
      const targetUsername = typeof payload?.username === 'string' ? payload.username : '';
      const isBanned = Boolean(payload?.isBanned);

      if (!targetUserId && !targetUsername) {
        return;
      }

      setChatMessages((previous) =>
        previous.map((message) => {
          const matchById = targetUserId && (message.userId === targetUserId || message.user?.id === targetUserId);
          const matchByUsername = targetUsername && message.username.toLowerCase() === targetUsername.toLowerCase();
          if (!matchById && !matchByUsername) {
            return message;
          }

          const resolvedUserId = message.userId || message.user?.id || targetUserId || null;
          return {
            ...message,
            userId: resolvedUserId,
            isBanned,
            user: {
              ...(message.user ?? {}),
              id: resolvedUserId,
              isBanned,
            },
          };
        })
      );
    };

    const crashRoomJoinedHandler = (payload: { ok: boolean; roomId?: string }) => {
      if (!payload.ok || !payload.roomId) {
        return;
      }

      setCrashRoomId(payload.roomId);
      setCrashRoomInput(payload.roomId);
      setJoiningCrashRoom(false);
    };

    const crashRoomMembersHandler = (payload: { roomId: string; members: string[] }) => {
      setCrashRoomMembers(payload.members ?? []);
    };

    const crashStateHandler = (state: CrashState) => {
      setCrashState(state);
      const activeBet = (state.players ?? []).some((player) => isCurrentCrashPlayer(player) && !player.cashedOut);
      setHasBet(activeBet);

      if (!activeBet && state.phase === 'waiting') {
        committedCrashBetAmountRef.current = 0;
        crashBetCommittedRef.current = false;
      }

      if (activeBet && state.phase === 'running' && !crashBetCommittedRef.current && pendingCrashBetAmountRef.current) {
        void commitPendingCrashBet();
      }

      if (activeBet && isPlacingCrashBetRef.current) {
        if (crashBetAckTimeoutRef.current !== null) {
          window.clearTimeout(crashBetAckTimeoutRef.current);
          crashBetAckTimeoutRef.current = null;
        }
        isPlacingCrashBetRef.current = false;
        setIsPlacingCrashBet(false);
        setErrorMsg('');
      }
    };

    const crashTickHandler = ({ multiplier, players }: { multiplier: number; players: CrashPlayer[] }) => {
      const now = Date.now();
      if (now - lastCrashUiTickAtRef.current < 100) {
        return;
      }
      lastCrashUiTickAtRef.current = now;

      setCrashState((prev) => ({ ...prev, multiplier, players, phase: 'running' }));
      const activeBet = (players ?? []).some((player) => isCurrentCrashPlayer(player) && !player.cashedOut);
      setHasBet(activeBet);

      if (activeBet && !crashBetCommittedRef.current && pendingCrashBetAmountRef.current) {
        void commitPendingCrashBet();
      }

      if (!activeBet && pendingCrashBetAmountRef.current && !crashBetCommittedRef.current) {
        pendingCrashBetAmountRef.current = null;
      }

      if (activeBet && isPlacingCrashBetRef.current) {
        if (crashBetAckTimeoutRef.current !== null) {
          window.clearTimeout(crashBetAckTimeoutRef.current);
          crashBetAckTimeoutRef.current = null;
        }
        isPlacingCrashBetRef.current = false;
        setIsPlacingCrashBet(false);
        setErrorMsg('');
      }

      if (autoCashOutEnabledRef.current && hasBetRef.current && multiplier >= autoCashOutRef.current) {
        socket.emit('crash_cashout', {});
      }
    };

    const crashPlayersHandler = (players: CrashPlayer[]) => {
      setCrashState((prev) => ({ ...prev, players }));
      const activeBet = (players ?? []).some((player) => isCurrentCrashPlayer(player) && !player.cashedOut);
      setHasBet(activeBet);
      if (activeBet && isPlacingCrashBetRef.current) {
        if (crashBetAckTimeoutRef.current !== null) {
          window.clearTimeout(crashBetAckTimeoutRef.current);
          crashBetAckTimeoutRef.current = null;
        }
        isPlacingCrashBetRef.current = false;
        setIsPlacingCrashBet(false);
        setErrorMsg('');
      }
    };

    const crashBetRegisteredHandler = (payload: { ok: boolean; amount?: number }) => {
      if (!payload?.ok || !isPlacingCrashBetRef.current) {
        return;
      }

      if (crashBetAckTimeoutRef.current !== null) {
        window.clearTimeout(crashBetAckTimeoutRef.current);
        crashBetAckTimeoutRef.current = null;
      }

      setHasBet(true);
      isPlacingCrashBetRef.current = false;
      setIsPlacingCrashBet(false);
      setErrorMsg('');
    };

    const crashCrashedHandler = ({ crashPoint, history, players }: { crashPoint: number; history: number[]; players: CrashPlayer[] }) => {
      setCrashState((prev) => ({
        ...prev,
        phase: 'crashed',
        multiplier: crashPoint,
        crashPoint,
        history,
        players,
      }));
      const activeBet = (players ?? []).some((player) => isCurrentCrashPlayer(player) && !player.cashedOut);
      setHasBet(activeBet);
      if (!activeBet) {
        committedCrashBetAmountRef.current = 0;
        crashBetCommittedRef.current = false;
        pendingCrashBetAmountRef.current = null;
      }
    };

    const reconnectAttemptHandler = () => setSocketReconnecting(true);
    const reconnectErrorHandler = () => setSocketReconnecting(true);
    const reconnectFailedHandler = () => {
      setSocketConnected(false);
      setSocketReconnecting(true);
    };
    const reconnectHandler = () => {
      setSocketConnected(true);
      setSocketReconnecting(false);
    };

    socket.on('connect', connectHandler);
    socket.on('disconnect', disconnectStatusHandler);
    socket.on('disconnect', disconnectRecoveryHandler);
    socket.io.on('reconnect_attempt', reconnectAttemptHandler);
    socket.io.on('reconnect_error', reconnectErrorHandler);
    socket.io.on('reconnect_failed', reconnectFailedHandler);
    socket.io.on('reconnect', reconnectHandler);
    socket.on('online_users', onlineUsersHandler);
    socket.on('chat_history', chatHistoryHandler);
    socket.on('chat_message', chatMessageHandler);
    socket.on('chat_mention', chatMentionHandler);
    socket.on('notification', notificationHandler);
    socket.on('new_notification', newNotificationHandler);
    socket.on('ticket_reply_received', ticketReplyHandler);
    socket.on('global_notification', globalNotificationHandler);
    socket.on('admin_broadcast', adminBroadcastHandler);
    socket.on('rain_started', rainStartedHandler);
    socket.on('rain_tick', rainTickHandler);
    socket.on('rain_ended', rainEndedHandler);
    socket.on('rain_reward', rainRewardHandler);
    socket.on('global_event_started', globalEventStartedHandler);
    socket.on('global_event_ended', globalEventEndedHandler);
    socket.on('user_profile_data', userProfileDataHandler);
    socket.on('event_cashback_reward', cashbackRewardHandler);
    socket.on('wallet_refresh_required', walletRefreshRequiredHandler);
    socket.on('force_logout', forceLogoutHandler);
    socket.on('system_maintenance_update', maintenanceUpdateHandler);
    socket.on('user_banned_status_changed', bannedStatusChangedHandler);
    socket.on('crash_room_joined', crashRoomJoinedHandler);
    socket.on('crash_room_members', crashRoomMembersHandler);
    socket.on('crash_state', crashStateHandler);
    socket.on('crash_tick', crashTickHandler);
    socket.on('crash_players', crashPlayersHandler);
    socket.on('crash_bet_registered', crashBetRegisteredHandler);
    socket.on('crash_crashed', crashCrashedHandler);
    socket.on('crash_cashout_result', cashoutHandler);

    return () => {
      socket.off('connect', connectHandler);
      socket.off('disconnect', disconnectStatusHandler);
      socket.off('disconnect', disconnectRecoveryHandler);
      socket.io.off('reconnect_attempt', reconnectAttemptHandler);
      socket.io.off('reconnect_error', reconnectErrorHandler);
      socket.io.off('reconnect_failed', reconnectFailedHandler);
      socket.io.off('reconnect', reconnectHandler);
      socket.off('online_users', onlineUsersHandler);
      socket.off('chat_history', chatHistoryHandler);
      socket.off('chat_message', chatMessageHandler);
      socket.off('chat_mention', chatMentionHandler);
      socket.off('notification', notificationHandler);
      socket.off('new_notification', newNotificationHandler);
      socket.off('ticket_reply_received', ticketReplyHandler);
      socket.off('global_notification', globalNotificationHandler);
      socket.off('admin_broadcast', adminBroadcastHandler);
      socket.off('rain_started', rainStartedHandler);
      socket.off('rain_tick', rainTickHandler);
      socket.off('rain_ended', rainEndedHandler);
      socket.off('rain_reward', rainRewardHandler);
      socket.off('global_event_started', globalEventStartedHandler);
      socket.off('global_event_ended', globalEventEndedHandler);
      socket.off('user_profile_data', userProfileDataHandler);
      socket.off('event_cashback_reward', cashbackRewardHandler);
      socket.off('wallet_refresh_required', walletRefreshRequiredHandler);
      socket.off('force_logout', forceLogoutHandler);
      socket.off('system_maintenance_update', maintenanceUpdateHandler);
      socket.off('user_banned_status_changed', bannedStatusChangedHandler);
      socket.off('crash_room_joined', crashRoomJoinedHandler);
      socket.off('crash_room_members', crashRoomMembersHandler);
      socket.off('crash_state', crashStateHandler);
      socket.off('crash_tick', crashTickHandler);
      socket.off('crash_players', crashPlayersHandler);
      socket.off('crash_bet_registered', crashBetRegisteredHandler);
      socket.off('crash_crashed', crashCrashedHandler);
      socket.off('crash_cashout_result', cashoutHandler);
      socket.disconnect();
      socketRef.current = null;
      if (announcementTimeoutRef.current !== null) {
        window.clearTimeout(announcementTimeoutRef.current);
        announcementTimeoutRef.current = null;
      }
    };
  }, [
    addWin,
    chatClanTag,
    chatRole,
    commitPendingCrashBet,
    currentUserId,
    currentUserIsBanned,
    isCurrentCrashPlayer,
    isChatVisible,
    isMobileViewport,
    loadPresence,
    mobileChatOpen,
    effectiveUsername,
    refundCommittedCrashBet,
    setAnnouncement,
    syncBalanceFromServer,
  ]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      return;
    }

    socket.emit('profile_sync', {
      username: effectiveUsername,
      role: chatRole,
      isKing,
      clanTag: chatClanTag,
      xp,
      balance,
      selectedRankTag,
    });
  }, [xp, balance, chatClanTag, chatRole, effectiveUsername, isKing, selectedRankTag, socketConnected]);

  useEffect(() => {
    if (!payoutToast) {
      return;
    }

    const timeout = window.setTimeout(() => setPayoutToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [payoutToast]);

  const persistSettings = useCallback(
    async (silent: boolean) => {
      setSettingsSaving(true);
      if (!silent) {
        setSettingsNotice('');
      }

      try {
        const response = await fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            soundEnabled,
            theme,
            selectedRankTag,
            publicProfile,
            bio,
            favoriteGame: favoriteGameDraft,
            privacyShowBalance,
            publicGameHistory,
            clanTag: clanDraft,
          }),
        });

        const payload = (await response.json()) as { error?: string; settings?: SettingsPayload };
        setSettingsSaving(false);

        if (!response.ok) {
          setSettingsNotice(payload.error ?? 'Settings save failed.');
          return;
        }

        if (payload.settings) {
          setClanDraft(payload.settings.clanTag ?? '');
          setChatClanTag(payload.settings.clanTag ?? null);
        }

        setSettingsNotice(silent ? 'Settings autosaved.' : 'Settings saved.');
      } catch (error) {
        console.error('Settings save error:', error);
        setSettingsSaving(false);
        setSettingsNotice('Settings save failed.');
      }
    },
    [soundEnabled, theme, selectedRankTag, publicProfile, bio, favoriteGameDraft, privacyShowBalance, publicGameHistory, clanDraft]
  );

  useEffect(() => {
    if (!settingsHydratedRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistSettings(true);
    }, 850);

    return () => window.clearTimeout(timeout);
  }, [soundEnabled, theme, selectedRankTag, publicProfile, bio, favoriteGameDraft, privacyShowBalance, publicGameHistory, clanDraft, persistSettings]);

  const crashLabel =
    crashState.phase === 'crashed'
      ? 'Crashed'
      : crashState.phase === 'running'
        ? crashState.multiplier < 1.6
          ? 'Takeoff Phase'
          : crashState.multiplier < 3
            ? 'Heat Zone'
            : 'Danger Zone'
        : 'Waiting for next round';

  const handleCrashBet = async () => {
    if (isPlacingCrashBetRef.current || hasBetRef.current || isCrashBetCooldown) {
      return;
    }

    const amount = Math.floor(Number(betInput || 0));
    const socket = socketRef.current;

    if (!socket || !socket.connected) {
      setErrorMsg('Socket not connected.');
      return;
    }

    if (amount <= 0) {
      return;
    }

    const currentBalance = Math.max(0, Math.floor(parseFloat(balance)));
    if (amount > currentBalance) {
      setErrorMsg('Not enough funds');
      return;
    }

    if (crashState.phase !== 'waiting') {
      setErrorMsg('Round already started. Wait for next round.');
      return;
    }

    startCrashBetCooldown();
    isPlacingCrashBetRef.current = true;
    crashBetCommittedRef.current = false;
    setIsPlacingCrashBet(true);
    pendingCrashBetAmountRef.current = amount;

    let ackReceived = false;
    crashBetAckTimeoutRef.current = window.setTimeout(() => {
      if (ackReceived) {
        return;
      }

      pendingCrashBetAmountRef.current = null;
      crashBetCommittedRef.current = false;
      committedCrashBetAmountRef.current = 0;
      crashBetAckTimeoutRef.current = null;
      isPlacingCrashBetRef.current = false;
      setIsPlacingCrashBet(false);
      setErrorMsg('Bet request timed out.');
    }, 6000);

    socket.emit('crash_place_bet', { roomId: crashRoomId, amount, autoCashOut: autoCashOutEnabled ? autoCashOutValue : 0 }, (response: { ok: boolean; error?: string }) => {
      ackReceived = true;
      if (crashBetAckTimeoutRef.current !== null) {
        window.clearTimeout(crashBetAckTimeoutRef.current);
        crashBetAckTimeoutRef.current = null;
      }

      if (!response.ok) {
        pendingCrashBetAmountRef.current = null;
        crashBetCommittedRef.current = false;
        committedCrashBetAmountRef.current = 0;
        isPlacingCrashBetRef.current = false;
        setIsPlacingCrashBet(false);
        setErrorMsg(response.error ?? 'Unable to place bet.');
        return;
      }

      setHasBet(true);
      void commitPendingCrashBet();
      isPlacingCrashBetRef.current = false;
      setIsPlacingCrashBet(false);
      setErrorMsg('');
    });
  };

  const handleCashOut = () => {
    const socket = socketRef.current;

    if (!socket || !socket.connected) {
      setErrorMsg('Socket not connected.');
      return;
    }

    if (!hasBet || crashState.phase !== 'running') {
      return;
    }

    socket.emit('crash_cashout', {}, (response: { ok: boolean; error?: string }) => {
      if (!response.ok) {
        setErrorMsg(response.error ?? 'Cashout failed.');
      }
    });
  };

  const handleFaucet = async () => {
    const result = await persistWalletAction('faucet', 5000);
    if (!result.ok) {
      setErrorMsg(result.error ?? 'Daily faucet unavailable.');
      return;
    }

    setErrorMsg('Daily faucet claimed: +5000 NVC');
  };

  const handleJoinCrashRoom = () => {
    const socket = socketRef.current;
    const nextRoom = crashRoomInput.trim().toLowerCase();

    if (!socket) {
      setErrorMsg('Socket not connected.');
      return;
    }

    if (hasBet || crashState.phase === 'running') {
      setErrorMsg('Finish your current crash round before switching room.');
      return;
    }

    if (!nextRoom) {
      setErrorMsg('Enter a room name.');
      return;
    }

    setHasBet(false);
    setJoiningCrashRoom(true);

    let ackReceived = false;
    const ackTimeout = window.setTimeout(() => {
      if (ackReceived) {
        return;
      }

      setJoiningCrashRoom(false);
      setErrorMsg('Join room timed out. Please try again.');
    }, 2200);

    socket.emit('join_crash_room', { roomId: nextRoom }, (response: { ok: boolean; roomId?: string; error?: string }) => {
      ackReceived = true;
      window.clearTimeout(ackTimeout);
      setJoiningCrashRoom(false);
      if (!response.ok) {
        setErrorMsg(response.error ?? 'Could not join room.');
        return;
      }

      if (response.roomId) {
        setCrashRoomId(response.roomId);
        setCrashRoomInput(response.roomId);
      }

      setErrorMsg('');
    });
  };

  const handleCopyCrashInvite = async () => {
    const text = crashRoomId;

    const copied = await copyToClipboard(text);
    if (copied) {
      setErrorMsg('Room code copied.');
    } else {
      setErrorMsg(`Share this room id with your friend: ${crashRoomId}`);
    }
  };

  const handleCreateCrashRoom = () => {
    if (hasBet || crashState.phase === 'running') {
      setErrorMsg('Finish your current crash round before creating a room.');
      return;
    }

    const room = `room-${Math.random().toString(36).slice(2, 7)}`;
    setCrashRoomInput(room);
    setHasBet(false);
    setJoiningCrashRoom(true);

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      setJoiningCrashRoom(false);
      setErrorMsg('Socket not connected.');
      return;
    }

    let ackReceived = false;
    const ackTimeout = window.setTimeout(() => {
      if (ackReceived) {
        return;
      }

      setJoiningCrashRoom(false);
      setErrorMsg('Create room timed out. Please try again.');
    }, 2200);

    socket.emit('join_crash_room', { roomId: room }, (response: { ok: boolean; roomId?: string; error?: string }) => {
      ackReceived = true;
      window.clearTimeout(ackTimeout);
      setJoiningCrashRoom(false);
      if (!response.ok) {
        setErrorMsg(response.error ?? 'Could not create room.');
        return;
      }

      if (response.roomId) {
        setCrashRoomId(response.roomId);
        setCrashRoomInput(response.roomId);
      }

      setErrorMsg('');
    });
  };

  const handleSwitchPokerMode = (mode: PokerMode) => {
    setPokerMode(mode);
    setErrorMsg('');
  };

  const handleChatInputChange = useCallback((value: string, caretPosition: number) => {
    setChatInput(value);
    setChatInputCaret(caretPosition);

    const safeCaret = Math.max(0, Math.min(caretPosition, value.length));
    const beforeCaret = value.slice(0, safeCaret);
    const tokenMatch = beforeCaret.match(/(^|\s)([@:])([a-zA-Z0-9_+-]*)$/);

    if (!tokenMatch) {
      setSuggestionType(null);
      setSuggestionQuery('');
      return;
    }

    const trigger = tokenMatch[2];
    const query = (tokenMatch[3] ?? '').toLowerCase();

    if (trigger === '@') {
      setSuggestionType('mention');
      setSuggestionQuery(query);
      return;
    }

    setSuggestionType('emoji');
    setSuggestionQuery(query);
  }, []);

  const handleSuggestionSelect = useCallback((selection: string) => {
    setChatInput((current) => {
      const safeCaret = Math.max(0, Math.min(chatInputCaret, current.length));
      let tokenStart = safeCaret;
      while (tokenStart > 0 && !/\s/.test(current[tokenStart - 1])) {
        tokenStart -= 1;
      }

      let tokenEnd = safeCaret;
      while (tokenEnd < current.length && !/\s/.test(current[tokenEnd])) {
        tokenEnd += 1;
      }

      const token = current.slice(tokenStart, tokenEnd);
      let replacement = selection;

      if (suggestionType === 'mention') {
        replacement = `@${selection} `;
      } else if (suggestionType === 'emoji') {
        replacement = `${selection} `;
      }

      if (token.startsWith('@') || token.startsWith(':')) {
        return `${current.slice(0, tokenStart)}${replacement}${current.slice(tokenEnd)}`;
      }

      const insertionPrefix = current && !/\s$/.test(current) ? ' ' : '';
      return `${current}${insertionPrefix}${replacement}`;
    });
    setSuggestionType(null);
    setSuggestionQuery('');
  }, [chatInputCaret, suggestionType]);

  const submitChat = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const socket = socketRef.current;

      const text = chatInput.trim();
      if (!text || !socket || !socket.connected) {
        if (text) {
          setErrorMsg('Realtime socket is offline.');
        }
        return;
      }

      socket.emit('send_chat_message', { text });
      setChatInput('');
      setSuggestionType(null);
      setSuggestionQuery('');
      setChatInputCaret(0);
    },
    [chatInput]
  );

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const handleSendFriendRequest = async () => {
    const usernameToAdd = friendSearch.trim();
    if (usernameToAdd.length < 3) {
      setFriendNotice('Please enter at least 3 characters.');
      return;
    }

    const response = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: usernameToAdd }),
    });

    const payload = (await response.json()) as { error?: string; receiverUsername?: string };
    if (!response.ok) {
      setFriendNotice(payload.error ?? 'Could not send request.');
      return;
    }

    setFriendSearch('');
    setFriendNotice('Friend request sent.');
    void loadFriends();
  };

  const handleQuickAddFriendFromOnline = async (targetUserId: string, targetUsername: string) => {
    const response = await fetch('/api/friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId }),
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setFriendNotice(payload.error ?? 'Could not send friend request.');
      return { ok: false };
    }

    setFriendNotice(`Friend request sent to ${targetUsername}.`);
    toast.success(`Anfrage an ${targetUsername} gesendet!`);

    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit('send_friend_request', { receiverUserId: targetUserId, receiverUsername: targetUsername });
    }

    setPendingOutgoing((current) => {
      const exists = current.some((entry) => entry.username.trim().toLowerCase() === targetUsername.trim().toLowerCase());
      if (exists) {
        return current;
      }

      return [
        {
          friendshipId: `pending-${targetUserId}`,
          userId: targetUserId,
          username: targetUsername,
        },
        ...current,
      ];
    });

    return { ok: true };
  };

  const handleRespondFriendRequest = async (friendshipId: string, action: 'accept' | 'decline') => {
    const response = await fetch('/api/friends/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId, action }),
    });

    const payload = (await response.json()) as {
      error?: string;
      receiverUsername?: string;
    };
    if (!response.ok) {
      setFriendNotice(payload.error ?? 'Could not update request.');
      return;
    }

    setFriendNotice(action === 'accept' ? 'Friend request accepted.' : 'Friend request declined.');
    void loadFriends();
  };

  const handleRemoveFriendship = async (friendshipId: string) => {
    const response = await fetch(`/api/friends?friendshipId=${encodeURIComponent(friendshipId)}`, {
      method: 'DELETE',
    });

    const payload = (await response.json()) as {
      error?: string;
      receiverUsername?: string;
    };
    if (!response.ok) {
      setFriendNotice(payload.error ?? 'Could not remove friendship.');
      return;
    }

    setFriendNotice('Friendship removed.');
    void loadFriends();
  };

  const handleBlockUser = async (targetUserId: string) => {
    const response = await fetch('/api/friends/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId }),
    });

    const payload = (await response.json()) as {
      error?: string;
      receiverUsername?: string;
    };
    if (!response.ok) {
      setFriendNotice(payload.error ?? 'Could not block user.');
      return;
    }

    setFriendNotice('User blocked.');
    void loadFriends();
  };

  const handleUnblockUser = async (blockId: string) => {
    const response = await fetch(`/api/friends/block?blockId=${encodeURIComponent(blockId)}`, {
      method: 'DELETE',
    });

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      setFriendNotice(payload.error ?? 'Could not unblock user.');
      return;
    }

    setFriendNotice('User unblocked.');
    void loadFriends();
  };

  const handleSendMoneyToFriend = async (targetUserId: string, targetUsername: string, targetRole?: string) => {
    const numericBalance = typeof balance === 'string' ? parseFloat(balance) : balance;
    setMoneyTarget({ userId: targetUserId, username: targetUsername, role: targetRole, balance: numericBalance });
    setShowSendMoneyModal(true);
  };

  const handleSendMoneyConfirm = async (amount: number, message: string) => {
    if (!moneyTarget) {
      return;
    }

    const response = await fetch('/api/friends/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: moneyTarget.userId, amount, message }),
    });

    setShowSendMoneyModal(false);
    setMoneyTarget(null);

    if (!response.ok) {
      const text = await response.text();
      const payload = text ? (JSON.parse(text) as { error?: string }) : { error: 'Network error' };
      setFriendNotice(payload.error ?? 'Could not send money.');
      return;
    }

    const payload = (await response.json()) as {
      error?: string;
      receiverUsername?: string;
    };

    await syncBalanceFromServer();
    setFriendNotice(`Sent ${amount} NVC to ${moneyTarget.username}.`);
    toast.success(`${amount} NVC an ${moneyTarget.username} gesendet!`);

    const socket = socketRef.current;
    if (socket?.connected && payload.receiverUsername) {
      const displayMessage = message || 'Du hast NVC erhalten!';
      socket.emit('friend_transfer_notification', {
        receiverUserId: moneyTarget.userId,
        receiverUsername: payload.receiverUsername,
        message: displayMessage,
      });
    }
  };

  const handleViewProfile = useCallback(async (targetUserId: string | null, targetUsername: string) => {
    setProfileLoading(true);
    setFriendNotice('');

    const trimmedUsername = String(targetUsername ?? '').trim();
    const trimmedUserId = String(targetUserId ?? '').trim();

    try {
      const fallbackUrl = trimmedUsername
        ? `/api/profile/${encodeURIComponent(trimmedUsername)}`
        : null;
      const response = fallbackUrl
        ? await fetch(fallbackUrl, { cache: 'no-store' })
        : new Response(JSON.stringify({ error: 'Profile target missing.' }), { status: 400 });
      const payload = (await response.json()) as { error?: string; profile?: PublicProfileData };

      if (!response.ok || !payload.profile) {
        setSelectedProfile(null);
        setFriendNotice(payload.error ?? 'Could not load profile.');
        return;
      }

      setSelectedProfile({
        ...payload.profile,
        userId: payload.profile.userId || trimmedUserId,
        isSelf: payload.profile.username.trim().toLowerCase() === normalizedEffectiveUsername,
      });
    } catch (error) {
      console.error('Failed to load profile:', error);
      setSelectedProfile(null);
      setFriendNotice('Failed to load profile. Check your connection.');
    } finally {
      setProfileLoading(false);
    }
  }, [normalizedEffectiveUsername]);

  const openProfileModal = useCallback(
    (targetUserId: string | null, targetUsername: string) => {
      const trimmedUsername = String(targetUsername ?? '').trim();
      const trimmedUserId = String(targetUserId ?? '').trim();
      if (!trimmedUsername && !trimmedUserId) {
        return;
      }

      setProfileModalOpen(true);
      setProfileLoading(true);
      setSelectedProfile(null);

      const socket = socketRef.current;
      if (socket?.connected) {
        socket.emit(
          'fetch_user_profile',
          {
            targetUserId: trimmedUserId || undefined,
            targetUsername: trimmedUsername || undefined,
          },
          (response?: { ok?: boolean; error?: string; profile?: PublicProfileData }) => {
            if (!response?.ok || !response.profile) {
              void handleViewProfile(trimmedUserId || null, trimmedUsername);
            }
          }
        );
        return;
      }

      void handleViewProfile(trimmedUserId || null, trimmedUsername);
    },
    [handleViewProfile]
  );

  const handleMentionClick = useCallback(
    (targetUsername: string) => {
      const trimmedUsername = String(targetUsername ?? '').trim();
      if (!trimmedUsername) {
        return;
      }

      const targetPresence = presenceByUsername[trimmedUsername.toLowerCase()];
      openProfileModal(targetPresence?.userId ?? null, trimmedUsername);
    },
    [openProfileModal, presenceByUsername]
  );

  const handleProfilePopupAddFriend = useCallback(
    async (profile: ProfileActionPayload) => {
      const targetUserId = profile.userId?.trim();
      if (!targetUserId) {
        setFriendNotice('Cannot send friend request without a user id.');
        return;
      }

      const result = await handleQuickAddFriendFromOnline(targetUserId, profile.username);
      if (result.ok) {
        setSelectedProfile((current) => (current ? { ...current, isFriend: true } : current));
      }
    },
    [handleQuickAddFriendFromOnline]
  );

  const handleProfilePopupSendMoney = useCallback(
    (profile: ProfileActionPayload) => {
      const targetUserId = profile.userId?.trim();
      if (!targetUserId) {
        setFriendNotice('Cannot send money without a user id.');
        return;
      }

      void handleSendMoneyToFriend(targetUserId, profile.username, profile.role);
    },
    [handleSendMoneyToFriend]
  );

  const handleSaveProfileCustomization = useCallback(async () => {
    setSettingsSaving(true);
    setSettingsNotice('');
    try {
      const response = await fetch('/api/profile/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarUrl: avatarUrlDraft,
          bannerUrl: bannerUrlDraft,
          bio,
          favoriteGame: favoriteGameDraft,
          privacyShowBalance,
          publicGameHistory,
        }),
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        setSettingsNotice(payload.error ?? 'Profile update failed.');
        setSettingsSaving(false);
        return;
      }

      setSettingsNotice('Profile customization saved.');
    } catch (error) {
      console.error('Failed to save profile customization:', error);
      setSettingsNotice('Profile update failed.');
    } finally {
      setSettingsSaving(false);
    }
  }, [avatarUrlDraft, bannerUrlDraft, bio, favoriteGameDraft, privacyShowBalance, publicGameHistory]);

  const handleChangeUsername = async () => {
    const nextUsername = usernameDraft.trim();
    if (nextUsername.length < 3) {
      setAccountNotice('Username must be at least 3 characters.');
      return;
    }

    if (!usernamePassword) {
      setAccountNotice('Enter current password to confirm username change.');
      return;
    }

    setAccountSaving(true);
    setAccountNotice('');

    const response = await fetch('/api/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'username', username: nextUsername, currentPassword: usernamePassword }),
    });

    const payload = (await response.json()) as { error?: string; requiresRelogin?: boolean };
    setAccountSaving(false);

    if (!response.ok) {
      setAccountNotice(payload.error ?? 'Username change failed.');
      return;
    }

    setAccountNotice('Username changed. Please login again.');
    setUsernamePassword('');

    if (payload.requiresRelogin) {
      setTimeout(() => {
        void signOut({ callbackUrl: '/login' });
      }, 900);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordCurrent || !passwordNext || !passwordConfirm) {
      setAccountNotice('Fill all password fields.');
      return;
    }

    if (passwordNext !== passwordConfirm) {
      setAccountNotice('New password confirmation does not match.');
      return;
    }

    setAccountSaving(true);
    setAccountNotice('');

    const response = await fetch('/api/account', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'password', currentPassword: passwordCurrent, nextPassword: passwordNext }),
    });

    const payload = (await response.json()) as { error?: string };
    setAccountSaving(false);

    if (!response.ok) {
      setAccountNotice(payload.error ?? 'Password change failed.');
      return;
    }

    setPasswordCurrent('');
    setPasswordNext('');
    setPasswordConfirm('');
    setAccountNotice('Password updated successfully.');
  };

  const handleDeleteAccount = async () => {
    if (accountDeleting) {
      return;
    }

    const confirmed = window.confirm('Delete your account permanently? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    setAccountDeleting(true);
    setAccountNotice('');

    const response = await fetch('/api/user/delete', {
      method: 'DELETE',
    });

    const payload = (await response.json()) as { error?: string };
    setAccountDeleting(false);

    if (!response.ok) {
      setAccountNotice(payload.error ?? 'Account deletion failed.');
      return;
    }

    setAccountNotice('Account deleted. Signing out...');
    await signOut({ callbackUrl: '/login' });
  };

  const handleSaveSettings = async () => {
    await persistSettings(false);
  };

  const handleSelectSidebarTab = (tab: string) => {
    const nextTab = tab as Tab;
    if (nextTab === 'admin' && !hasAdminPanelAccess) {
      setErrorMsg('Admin access required.');
      return;
    }

    setErrorMsg('');
    setActiveTab(nextTab);
    setMobileSidebarOpen(false);
    router.push(`/hub?game=${nextTab}`);
  };

  const handleJoinFriendGame = (activity: string) => {
    const normalized = String(activity ?? '').trim().toLowerCase();
    let tab: Tab | null = null;

    if (normalized.includes('poker')) {
      tab = 'poker';
      setPokerMode('friends');
    } else if (normalized.includes('blackjack')) {
      tab = 'blackjack';
    } else if (normalized.includes('roulette')) {
      tab = 'roulette';
    } else if (normalized.includes('crash')) {
      tab = 'crash';
    } else if (normalized.includes('coinflip')) {
      tab = 'coinflip';
    }

    if (!tab) {
      return;
    }

    setErrorMsg('');
    setActiveTab(tab);
    setMobileSidebarOpen(false);
    router.push(`/hub?game=${tab}`);
  };

  const canBypassMaintenance = chatRole === 'OWNER' || chatRole === 'ADMIN' || chatRole === 'SUPPORT';
  const shouldShowMaintenanceLock = !maintenanceLoading && maintenanceState.isMaintenanceMode && !canBypassMaintenance;

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((item) => !item.isRead).length,
    [notifications]
  );

  const emitWithTimeout = useCallback(
    <T,>(event: string, payload: Record<string, unknown>, timeoutMs = 4000) =>
      new Promise<T | null>((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
          resolve(null);
          return;
        }

        let settled = false;
        const timeout = window.setTimeout(() => {
          if (settled) {
            return;
          }
          settled = true;
          resolve(null);
        }, timeoutMs);

        socket.emit(event, payload, (response: T) => {
          if (settled) {
            return;
          }

          settled = true;
          window.clearTimeout(timeout);
          resolve(response);
        });
      }),
    []
  );

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);

    try {
      const socketResponse = await emitWithTimeout<{ ok?: boolean; notifications?: NotificationItem[] }>('fetch_notifications', {
        limit: 20,
      });

      if (socketResponse?.ok) {
        setNotifications(Array.isArray(socketResponse.notifications) ? socketResponse.notifications : []);
      } else {
        const response = await fetch('/api/notifications', { cache: 'no-store' });
        if (!response.ok) {
          setNotifications([]);
          return;
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const payload = (await response.json()) as { notifications?: NotificationItem[] };
          setNotifications(Array.isArray(payload.notifications) ? payload.notifications : []);
        } else {
          console.error('Notifications API did not return JSON');
          setNotifications([]);
        }
      }
    } finally {
      setNotificationsLoading(false);
    }
  }, [emitWithTimeout]);

  const markNotificationsRead = useCallback(async (ids: string[] = [], markAll = false) => {
    const socketResponse = await emitWithTimeout<{ ok?: boolean }>('mark_notifications_read', { ids, markAll });

    if (!socketResponse?.ok) {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, markAll }),
      }).catch(() => null);
    }

    setNotifications((current) =>
      current.map((notification) => {
        if (markAll || ids.includes(notification.id)) {
          return { ...notification, isRead: true };
        }
        return notification;
      })
    );
  }, [emitWithTimeout]);

  const deleteNotifications = useCallback(async (ids: string[] = [], clearAll = false) => {
    const socketResponse = await emitWithTimeout<{ ok?: boolean }>('delete_notifications', { ids, clearAll });

    if (!socketResponse?.ok) {
      await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, clearAll }),
      }).catch(() => null);
    }

    setNotifications((current) => {
      if (clearAll) {
        return [];
      }

      const removals = new Set(ids);
      return current.filter((notification) => !removals.has(notification.id));
    });
  }, [emitWithTimeout]);

  const handleOpenNotification = useCallback(
    (notification: NotificationItem) => {
      if (!notification.isRead) {
        void markNotificationsRead([notification.id], false);
      }

      const type = String(notification.type || '').toUpperCase();
      if (type === 'SUPPORT_REPLY') {
        setActiveTab('support');
        router.push('/hub?game=support');
      }
      setNotificationOpen(false);
    },
    [markNotificationsRead, router]
  );

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  if (shouldShowMaintenanceLock) {
    return <MaintenanceScreen maintenanceEndTime={maintenanceState.maintenanceEndTime} />;
  }

  return (
    <div className={`hub-root flex h-screen w-full overflow-hidden bg-vault-black-darker ${themeSurfaceClass} text-slate-200 font-sans`}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        activeTab={activeTab}
        onSelectTab={handleSelectSidebarTab}
        canAccessAdmin={hasAdminPanelAccess}
        dailyFaucetClaimed={daily.faucetClaimed}
        onClaimFaucet={handleFaucet}
      />

      <div className="flex-1 flex flex-col h-full relative min-w-0">
        <AnnouncementOverlay message={announcement} />
        {mobileSidebarOpen ? (
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(false)}
            aria-label="Close sidebar"
            className="fixed inset-0 z-30 bg-slate-950/55 md:hidden"
          />
        ) : null}
        {showSendMoneyModal && moneyTarget ? (
          <SendMoneyModal
            targetUsername={moneyTarget.username}
            targetRole={moneyTarget.role}
            balance={moneyTarget.balance}
            onConfirm={handleSendMoneyConfirm}
            onCancel={() => {
              setShowSendMoneyModal(false);
              setMoneyTarget(null);
            }}
          />
        ) : null}

        <header className="hub-header h-16 shrink-0 bg-vault-black bg-slate-900 border-b border-slate-800 flex items-center justify-between w-full px-2 sm:px-4 lg:px-8 z-50 gap-2">
          <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen((current) => !current)}
              className="md:hidden h-10 w-10 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 inline-flex items-center justify-center"
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <span className={`h-2.5 w-2.5 rounded-full ${socketConnected ? 'bg-emerald-400' : socketReconnecting ? 'bg-red-400 animate-pulse' : 'bg-slate-500'}`} />
            <ShieldCheck size={16} className={`hidden sm:block ${socketConnected ? 'text-emerald-500' : socketReconnecting ? 'text-red-400' : 'text-slate-500'}`} />
            <span className={`hidden sm:block text-sm font-medium ${socketConnected ? 'text-emerald-300' : socketReconnecting ? 'text-red-300' : 'text-slate-400'}`}>
              {socketConnected ? 'Realtime Connected' : socketReconnecting ? 'Realtime Reconnecting...' : 'Realtime Offline'}
            </span>
            {socketReconnecting ? <span className="h-3.5 w-3.5 rounded-full border-2 border-red-300/60 border-t-transparent animate-spin" aria-hidden /> : null}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 lg:gap-4 min-w-0">
            {isMounted ? (
              <div className="text-right min-w-0">
                <div className="flex items-center justify-end gap-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 truncate">{effectiveUsername}</p>
                  {hasAdminPanelAccess ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-200 shadow-[0_0_10px_rgba(244,63,94,0.25)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-300" />
                      {chatRole} Access
                    </span>
                  ) : null}
                </div>
                <p className="font-mono text-[10px] text-slate-400 whitespace-nowrap">Level {level} · XP {xp}</p>
                <p className="font-mono text-[10px] text-slate-500 whitespace-nowrap hidden xl:block">
                  {levelProgress}% to L{level + 1} ({nextLevelXp - xp} XP left)
                </p>
              </div>
            ) : (
              <div className="h-10 w-32 bg-slate-800 animate-pulse rounded shrink-0" />
            )}
            <div className="flex items-center gap-2 sm:gap-3 bg-slate-950 border border-slate-800 px-2 sm:px-3 lg:px-4 py-2 rounded-lg shrink-0">
              <Wallet size={16} className="text-slate-400" />
              <span suppressHydrationWarning className="font-mono text-sm sm:text-base font-bold text-white">
                {isMounted ? formatUserBalance(balance, useCompactBalance) : '0'}
              </span>
              <span className="text-xs sm:text-sm font-bold text-blue-500">NVC</span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="hidden sm:inline-flex h-10 px-3 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold uppercase tracking-wide items-center gap-1.5 shrink-0 whitespace-nowrap"
            >
              <LogOut size={14} /> Logout
            </button>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="sm:hidden h-10 w-10 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 inline-flex items-center justify-center"
              aria-label="Logout"
            >
              <LogOut size={15} />
            </button>
            <NotificationCenter
              open={notificationOpen}
              unreadCount={unreadNotificationsCount}
              notifications={notifications}
              loading={notificationsLoading}
              onToggle={() => {
                setNotificationOpen((current) => {
                  const next = !current;
                  if (next) {
                    void loadNotifications();
                  }
                  return next;
                });
              }}
              onMarkAllRead={() => {
                void markNotificationsRead([], true);
              }}
              onMarkReadNotification={(notificationId) => {
                void markNotificationsRead([notificationId], false);
              }}
              onDeleteNotification={(notificationId) => {
                void deleteNotifications([notificationId], false);
              }}
              onClearAll={() => {
                void deleteNotifications([], true);
              }}
              onOpenNotification={handleOpenNotification}
            />
            <button
              type="button"
              onClick={toggleChat}
              className="relative h-10 w-10 rounded-lg border border-slate-700 bg-slate-900 text-slate-200 inline-flex items-center justify-center"
              aria-label="Toggle chat"
            >
              <MessageSquare size={16} />
              {unreadMessagesCount > 0 ? (
                <span className="absolute -right-1 -top-1 rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white animate-bounce">
                  {unreadMessagesCount > 99 ? '99+' : unreadMessagesCount}
                </span>
              ) : null}
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto flex flex-col relative min-h-0">
          <GlobalEventBanner event={globalEvent} />

          {hadSocketConnection && !socketConnected ? (
            <div className="mx-4 lg:mx-6 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200">
              Verbindung zum Server verloren. Reconnecting...
            </div>
          ) : null}

          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            <div className="flex-1 min-h-0 min-w-0 flex flex-col xl:flex-row p-2 sm:p-4 md:p-8 lg:p-12 gap-3 lg:gap-4 xl:gap-2 overflow-y-auto overflow-x-hidden lg:justify-center">
          <div className="hub-panel relative flex-1 min-h-0 min-w-0 flex flex-col bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
            {activeTab === 'crash' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
                <div className="h-full flex flex-col justify-center">
                  <CrashGame />
                </div>
              </div>
            )}

            {activeTab === 'crash-aviator' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
                <div className="h-full flex flex-col justify-center">
                  <CyberAviator />
                </div>
              </div>
            )}

            {activeTab === 'blackjack' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                <div className="h-full">
                  <BlackjackGame username={effectiveUsername} />
                </div>
              </div>
            )}
            {activeTab === 'roulette' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                <div className="h-full flex flex-col justify-center">
                  <RouletteGame />
                </div>
              </div>
            )}
            {activeTab === 'slots' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
                <SlotsGame />
              </div>
            )}
            {activeTab === 'poker' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
                <div className="h-14 shrink-0 px-4 border-b border-slate-800 bg-slate-950 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Poker Mode</p>
                    <p className="text-sm text-slate-300">Solo gegen Bots oder Friends-Room</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSwitchPokerMode('solo')}
                      className={`h-9 px-3 rounded-lg border text-xs font-bold uppercase ${
                        pokerMode === 'solo'
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      Solo + Bots
                    </button>
                    <button
                      onClick={() => handleSwitchPokerMode('friends')}
                      className={`h-9 px-3 rounded-lg border text-xs font-bold uppercase ${
                        pokerMode === 'friends'
                          ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                          : 'border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      Friends Room
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-hidden">
                  <div className="h-full flex flex-col justify-center">
                    {pokerMode === 'solo' ? <PokerGame /> : <PokerFriendsGame username={effectiveUsername} />}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'coinflip' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
                <CoinflipGame socket={socketRef.current} username={effectiveUsername} />
              </div>
            )}

            {activeTab === 'friends' && (
              <Friends
                friendRealtimeNotice={friendRealtimeNotice}
                friendSearch={friendSearch}
                friendNotice={friendNotice}
                friendsAccepted={friendsAccepted}
                pendingIncoming={pendingIncoming}
                pendingOutgoing={pendingOutgoing}
                blockedUsers={blockedUsers}
                friendsLoading={friendsLoading}
                uniqueOnlineUsers={uniqueOnlineUsers}
                uniqueOnlinePlayers={uniqueOnlinePlayers}
                showOnlinePresence={showOnlinePresence}
                presenceByUsername={presenceByUsername}
                selectedProfile={selectedProfile}
                profileLoading={profileLoading}
                incomingOpen={incomingOpen}
                outgoingOpen={outgoingOpen}
                blockedOpen={blockedOpen}
                setFriendSearch={setFriendSearch}
                setIncomingOpen={setIncomingOpen}
                setOutgoingOpen={setOutgoingOpen}
                setBlockedOpen={setBlockedOpen}
                onSendFriendRequest={() => {
                  void handleSendFriendRequest();
                }}
                onRespondFriendRequest={(friendshipId, action) => {
                  void handleRespondFriendRequest(friendshipId, action);
                }}
                onRemoveFriendship={(friendshipId) => {
                  void handleRemoveFriendship(friendshipId);
                }}
                onBlockUser={(targetUserId) => {
                  void handleBlockUser(targetUserId);
                }}
                onUnblockUser={(blockId) => {
                  void handleUnblockUser(blockId);
                }}
                onSendMoneyToFriend={(targetUserId, targetUsername, targetRole) => {
                  void handleSendMoneyToFriend(targetUserId, targetUsername, targetRole);
                }}
                onOpenProfile={openProfileModal}
                onJoinFriendGame={handleJoinFriendGame}
                onQuickAddOnlinePlayer={(targetUserId, targetUsername) => {
                  return handleQuickAddFriendFromOnline(targetUserId, targetUsername);
                }}
              />
            )}

            {activeTab === 'leaderboard' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
                <LeaderboardPanel />
              </div>
            )}

            {activeTab === 'quests' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
                <QuestsPanel />
              </div>
            )}

            {activeTab === 'support' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-hidden">
                <SupportPanel socket={socketRef.current} username={effectiveUsername} role={chatRole} />
              </div>
            )}

            {activeTab === 'admin' && hasAdminPanelAccess ? (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
                <AdminPanel />
              </div>
            ) : null}

            {activeTab === 'settings' && (
              <div className="flex-1 min-h-0 min-w-0 p-6 overflow-y-auto">
                <h2 className="text-2xl font-bold text-slate-100">Settings</h2>
                <p className="text-sm text-slate-400 mt-1">Structured controls for profile, gameplay, appearance, privacy and security.</p>

                <div className="mt-5 grid gap-5 lg:grid-cols-[240px_1fr]">
                  <aside className="rounded-xl border border-slate-800 bg-slate-950/50 p-3 h-fit">
                    {([
                      ['overview', 'Overview'],
                      ['profile', 'Profile Customization'],
                      ['appearance', 'Appearance'],
                      ['gameplay', 'Gameplay'],
                      ['privacy', 'Privacy'],
                      ['security', 'Account & Security'],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setSettingsSection(key)}
                        className={`w-full text-left h-10 px-3 rounded-lg text-sm font-semibold transition ${
                          settingsSection === key
                            ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40'
                            : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </aside>

                  <div className="space-y-4">
                    {settingsSection === 'overview' && (
                      <>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="font-semibold text-slate-100">Level Progress</p>
                              <p className="text-xs text-slate-500">Level {level} - {xp}/{nextLevelXp} XP</p>
                            </div>
                            <span className="text-sm font-semibold text-cyan-300">{levelProgress}%</span>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-slate-800 overflow-hidden">
                            <div className="h-full bg-cyan-500" style={{ width: `${levelProgress}%` }} />
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="font-semibold text-slate-100">Enable Baller Tag</p>
                              <p className="text-xs text-slate-500">Nur verfugbar fur Freunde von Daniel.</p>
                            </div>
                            <button
                              type="button"
                              disabled={!hasDanielFriend && selectedRankTag !== 'BALLER'}
                              onClick={() => {
                                if (selectedRankTag === 'BALLER') {
                                  setSelectedRankTag('BRONZE');
                                  return;
                                }

                                if (!hasDanielFriend) {
                                  setSettingsNotice('Nur verfugbar fur Freunde von Daniel.');
                                  return;
                                }

                                setSelectedRankTag('BALLER');
                              }}
                              className={`h-9 px-3 rounded-lg border text-xs font-bold uppercase ${
                                selectedRankTag === 'BALLER'
                                  ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-400'
                                  : 'border-slate-700 bg-slate-900 text-slate-400'
                              } ${!hasDanielFriend && selectedRankTag !== 'BALLER' ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                              {selectedRankTag === 'BALLER' ? 'Enabled' : 'Disabled'}
                            </button>
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                          <p className="font-semibold text-slate-100 mb-1">Chat Nametag</p>
                          <p className="text-xs text-slate-500 mb-3">Alle Ränge sind sichtbar, aber erst ab dem jeweiligen Level freischaltbar.</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {RANKS.map((rank) => {
                              const unlocked = canUseRankTag(level, balance, rank.tag, { hasDanielFriend });
                              const selected = selectedRankTag === rank.tag;
                              return (
                                <button
                                  key={rank.tag}
                                  onClick={() => {
                                    if (!unlocked) {
                                      if (rank.tag === 'BALLER') {
                                        setSettingsNotice('BALLER unlockt nur, wenn du Daniel als Freund hast.');
                                        return;
                                      }
                                      const requirement = rank.minLevel <= 1
                                        ? `${formatMoney(rank.minBalance)} NVC`
                                        : `Level ${rank.minLevel} und ${formatMoney(rank.minBalance)} NVC`;
                                      setSettingsNotice(`Rank ${rank.tag} unlockt ab ${requirement}.`);
                                      return;
                                    }
                                    setSelectedRankTag(rank.tag);
                                  }}
                                  className={`rounded-lg border px-3 py-2 text-left transition ${
                                    selected
                                      ? 'border-cyan-500/50 bg-cyan-500/10'
                                      : 'border-slate-700 bg-slate-900 hover:bg-slate-800'
                                  } ${!unlocked ? 'opacity-70' : ''}`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-black uppercase" style={{ color: getRankColor(rank.tag) }}>
                                      {rank.tag.replace(/_/g, ' ')}
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                      {unlocked
                                        ? 'Unlocked'
                                        : rank.minLevel <= 1
                                          ? `Locked ${formatMoney(rank.minBalance)} NVC`
                                          : `Locked L${rank.minLevel} · ${formatMoney(rank.minBalance)} NVC`}
                                    </span>
                                  </div>
                                  <p className="mt-1 text-[11px] text-slate-400">Wird als Tag neben deinem Namen im Live-Chat angezeigt.</p>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}

                    {settingsSection === 'profile' && (
                      <>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                          <p className="font-semibold text-slate-100 mb-3">Profile Customization</p>
                          <p className="text-xs text-slate-500 mb-4">Customize how your profile appears to other players.</p>

                          <div className="space-y-4">
                            {/* Avatar URL */}
                            <div>
                              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1.5">Avatar URL</label>
                              <input
                                type="text"
                                placeholder="https://..."
                                value={avatarUrlDraft}
                                onChange={(event) => setAvatarUrlDraft(event.target.value.slice(0, 500))}
                                className="w-full h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition"
                              />
                              <p className="text-[10px] text-slate-600 mt-1">Link to your profile avatar image</p>
                            </div>

                            {/* Banner URL */}
                            <div>
                              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1.5">Banner URL</label>
                              <input
                                type="text"
                                placeholder="https://..."
                                value={bannerUrlDraft}
                                onChange={(event) => setBannerUrlDraft(event.target.value.slice(0, 500))}
                                className="w-full h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition"
                              />
                              <p className="text-[10px] text-slate-600 mt-1">Background image for your profile</p>
                            </div>

                            {/* Bio / Status */}
                            <div>
                              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1.5">Bio <span className="text-slate-600 normal-case">({bio.length}/150)</span></label>
                              <textarea
                                maxLength={150}
                                rows={3}
                                placeholder="Tell other players about yourself..."
                                value={bio}
                                onChange={(event) => setBio(event.target.value.slice(0, 150))}
                                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition resize-none"
                              />
                            </div>

                            {/* Favorite Game */}
                            <div>
                              <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1.5">Favorite Game</label>
                              <select
                                value={favoriteGameDraft}
                                onChange={(event) => setFavoriteGameDraft(event.target.value)}
                                className="w-full h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition"
                              >
                                <option value="Unknown">Unknown</option>
                                <option value="roulette">Roulette</option>
                                <option value="blackjack">Blackjack</option>
                                <option value="poker">Poker</option>
                                <option value="crash">Crash</option>
                                <option value="coinflip">Coinflip</option>
                              </select>
                            </div>

                            {/* Privacy Toggles */}
                            <div className="border-t border-slate-800/40 pt-4 space-y-2">
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Privacy Settings</p>
                              <button
                                type="button"
                                onClick={() => setPrivacyShowBalance((current) => !current)}
                                className="w-full flex items-center justify-between h-10 px-3 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 text-xs font-semibold hover:bg-slate-800 transition"
                              >
                                <span>Show Balance to Friends</span>
                                <span className="text-cyan-300">{privacyShowBalance ? 'On' : 'Off'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setPublicGameHistory((current) => !current)}
                                className="w-full flex items-center justify-between h-10 px-3 rounded-lg border border-slate-700 bg-slate-900 text-slate-100 text-xs font-semibold hover:bg-slate-800 transition"
                              >
                                <span>Public Game History</span>
                                <span className="text-cyan-300">{publicGameHistory ? 'On' : 'Off'}</span>
                              </button>
                            </div>

                            {/* Save Button */}
                            <button
                              type="button"
                              onClick={() => {
                                void handleSaveProfileCustomization();
                              }}
                              disabled={settingsSaving}
                              className="w-full mt-6 h-10 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold uppercase text-xs transition disabled:opacity-60"
                            >
                              {settingsSaving ? 'Saving...' : 'Save Profile Settings'}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {settingsSection === 'appearance' && (
                      <>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                          <p className="font-semibold text-slate-100 mb-2">Theme</p>
                          <div className="grid gap-2 sm:grid-cols-3">
                            {(['slate', 'steel', 'sunset', 'ocean', 'matrix'] as const).map((option) => (
                              <button
                                key={option}
                                onClick={() => setTheme(option)}
                                className={`h-9 px-4 rounded-lg border text-xs font-bold uppercase ${
                                  theme === option
                                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                                    : 'border-slate-700 bg-slate-900 text-slate-400'
                                }`}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 grid gap-3 sm:grid-cols-2">
                          <button
                            onClick={() => setCompactSidebar((current) => !current)}
                            className={`h-10 rounded-lg border text-xs font-bold uppercase ${compactSidebar ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}
                          >
                            Compact Sidebar {compactSidebar ? 'On' : 'Off'}
                          </button>
                          <button
                            onClick={() => setReducedMotion((current) => !current)}
                            className={`h-10 rounded-lg border text-xs font-bold uppercase ${reducedMotion ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}
                          >
                            Reduced Motion {reducedMotion ? 'On' : 'Off'}
                          </button>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold text-slate-100">Compact Balance Display</p>
                            <p className="text-xs text-slate-500">e.g. 1M instead of 1,000,000</p>
                          </div>
                          <button
                            onClick={() => toggleCompactBalance(!useCompactBalance)}
                            className={`h-9 px-3 rounded-lg border text-xs font-bold uppercase ${
                              useCompactBalance
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                : 'border-slate-700 bg-slate-900 text-slate-400'
                            }`}
                          >
                            {useCompactBalance ? 'On' : 'Off'}
                          </button>
                        </div>
                      </>
                    )}

                    {settingsSection === 'gameplay' && (
                      <>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-slate-100">Sound</p>
                            <p className="text-xs text-slate-500">Enable game effects and notifications.</p>
                          </div>
                          <button
                            onClick={() => setSoundEnabled((current) => !current)}
                            className={`h-9 px-3 rounded-lg border text-xs font-bold uppercase ${
                              soundEnabled
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                : 'border-slate-700 bg-slate-900 text-slate-400'
                            }`}
                          >
                            {soundEnabled ? 'On' : 'Off'}
                          </button>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                          <p className="font-semibold text-slate-100 mb-2">Quick Bet Preset</p>
                          <div className="grid gap-2 sm:grid-cols-4">
                            {[100, 250, 500, 1000].map((value) => (
                              <button
                                key={value}
                                onClick={() => setQuickBetPreset(value)}
                                className={`h-9 rounded-lg border text-xs font-bold ${
                                  quickBetPreset === value
                                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                                    : 'border-slate-700 bg-slate-900 text-slate-400'
                                }`}
                              >
                                {value} NVC
                              </button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {settingsSection === 'privacy' && (
                      <>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-slate-100">Public Profile</p>
                              <p className="text-xs text-slate-500">Allow non-friends to view your profile card.</p>
                            </div>
                            <button
                              onClick={() => setPublicProfile((current) => !current)}
                              className={`h-9 px-3 rounded-lg border text-xs font-bold uppercase ${
                                publicProfile
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                  : 'border-slate-700 bg-slate-900 text-slate-400'
                              }`}
                            >
                              {publicProfile ? 'Public' : 'Private'}
                            </button>
                          </div>

                          <label className="block text-xs uppercase tracking-wide text-slate-500 mt-4 mb-2">Bio</label>
                          <textarea
                            value={bio}
                            onChange={(event) => setBio(event.target.value.slice(0, 240))}
                            rows={4}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-blue-500"
                            placeholder="Tell others what games you like..."
                          />
                          <p className="mt-1 text-[11px] text-slate-500">{bio.length}/240</p>

                          <label className="block text-xs uppercase tracking-wide text-slate-500 mt-4 mb-2">Clan Tag</label>
                          <input
                            value={clanDraft}
                            onChange={(event) => setClanDraft(event.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toUpperCase())}
                            className="w-full h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
                            placeholder="Optional, z.B. NEON"
                          />
                          <p className="mt-1 text-[11px] text-slate-500">Wird als [TAG] vor deinem Namen im Chat angezeigt (max. 5 Zeichen).</p>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 grid gap-3 sm:grid-cols-2">
                          <button
                            onClick={() => setShowOnlinePresence((current) => !current)}
                            className={`h-10 rounded-lg border text-xs font-bold uppercase ${showOnlinePresence ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}
                          >
                            Presence {showOnlinePresence ? 'Visible' : 'Hidden'}
                          </button>
                          <button
                            onClick={() => setShowChatTimestamps((current) => !current)}
                            className={`h-10 rounded-lg border text-xs font-bold uppercase ${showChatTimestamps ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}
                          >
                            Chat Time {showChatTimestamps ? 'On' : 'Off'}
                          </button>
                        </div>
                      </>
                    )}

                    {settingsSection === 'security' && (
                      <>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                          <p className="font-semibold text-slate-100 mb-2">Change Username</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <input
                              value={usernameDraft}
                              onChange={(event) => setUsernameDraft(event.target.value)}
                              className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
                              placeholder="New username"
                            />
                            <input
                              type="password"
                              value={usernamePassword}
                              onChange={(event) => setUsernamePassword(event.target.value)}
                              className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
                              placeholder="Current password"
                            />
                          </div>
                          <button
                            onClick={handleChangeUsername}
                            disabled={accountSaving}
                            className="mt-3 h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold"
                          >
                            Update Username
                          </button>
                        </div>

                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                          <p className="font-semibold text-slate-100 mb-2">Change Password</p>
                          <div className="grid gap-2 sm:grid-cols-3">
                            <input
                              type="password"
                              value={passwordCurrent}
                              onChange={(event) => setPasswordCurrent(event.target.value)}
                              className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
                              placeholder="Current password"
                            />
                            <input
                              type="password"
                              value={passwordNext}
                              onChange={(event) => setPasswordNext(event.target.value)}
                              className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
                              placeholder="New password"
                            />
                            <input
                              type="password"
                              value={passwordConfirm}
                              onChange={(event) => setPasswordConfirm(event.target.value)}
                              className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
                              placeholder="Confirm new"
                            />
                          </div>
                          <button
                            onClick={handleChangePassword}
                            disabled={accountSaving}
                            className="mt-3 h-10 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold"
                          >
                            Update Password
                          </button>
                        </div>

                        <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-4">
                          <p className="font-semibold text-red-200 mb-1">Danger Zone</p>
                          <p className="text-xs text-red-300/80">Delete your account and all associated data permanently.</p>
                          <button
                            onClick={handleDeleteAccount}
                            disabled={accountDeleting}
                            className="mt-3 h-10 px-4 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold"
                          >
                            {accountDeleting ? 'Deleting...' : 'Delete Account'}
                          </button>
                        </div>
                      </>
                    )}

                    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 flex items-center justify-between">
                      <p className="text-sm text-slate-400">Save current preferences</p>
                      <button
                        onClick={handleSaveSettings}
                        disabled={settingsSaving}
                        className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold"
                      >
                        {settingsSaving ? 'Saving...' : 'Save Settings'}
                      </button>
                    </div>

                    {settingsNotice ? <p className="text-sm text-slate-400">{settingsNotice}</p> : null}
                    {accountNotice ? <p className="text-sm text-slate-400">{accountNotice}</p> : null}
                  </div>
                </div>
              </div>
            )}
          </div>

          <LiveChatPanel
            desktopVisible={isChatVisible}
            mobileOpen={mobileChatOpen}
            onCloseMobile={() => {
              setMobileChatOpen(false);
            }}
            chatMessages={chatMessages}
            chatInput={chatInput}
            rainBanner={rainBanner}
            suggestionType={suggestionType}
            suggestionQuery={suggestionQuery}
            mentionSuggestions={mentionSuggestions}
            emojiSuggestions={emojiSuggestions}
            showChatTimestamps={showChatTimestamps}
            reducedMotion={reducedMotion}
            chatScrollRef={chatScrollRef}
            onChatInputChange={handleChatInputChange}
            onSuggestionSelect={handleSuggestionSelect}
            onMentionClick={handleMentionClick}
            onSubmitChat={submitChat}
          />

          {mobileChatOpen && isMobileViewport ? (
            <button
              type="button"
              onClick={() => setMobileChatOpen(false)}
              aria-label="Close chat"
              className="fixed inset-0 z-30 bg-slate-950/45 md:hidden"
            />
          ) : null}

            </div>
          </div>

          <CorporateFooter className="mt-auto shrink-0" />
        </div>

        <ProfilePopup
          open={profileModalOpen}
          loading={profileLoading}
          profile={selectedProfile}
          onClose={() => setProfileModalOpen(false)}
          onAddFriend={(profile) => {
            void handleProfilePopupAddFriend(profile);
          }}
          onSendMoney={handleProfilePopupSendMoney}
        />
      </div>
    </div>
  );
}

const ChatMessageItem = React.memo(function ChatMessageItem({
  event,
  reducedMotion,
  showChatTimestamps,
  onMentionClick,
}: {
  event: ChatMessage;
  reducedMotion: boolean;
  showChatTimestamps: boolean;
  onMentionClick: (username: string) => void;
}) {
  const messageRenderCountRef = useRef(0);
  messageRenderCountRef.current += 1;

  useEffect(() => {
    if (!ENABLE_RENDER_PROFILING) {
      return;
    }

    if (messageRenderCountRef.current % 10 === 0) {
      console.debug(`[perf] ChatMessageItem id=${event.id} renders=${messageRenderCountRef.current}`);
    }
  });

  const hue = Math.abs(event.username.charCodeAt(0) * 7) % 360;
  const usernameColor = `hsl(${hue}, 70%, 55%)`;
  const rankColor = event.rankColor || '#64748b';
  const normalizedRole = (event.role ?? '').toUpperCase();
  const isBanned = Boolean(event.isBanned ?? event.user?.isBanned);
  const clanLabel = typeof event.clanTag === 'string' ? event.clanTag.trim() : '';
  const roleBadge = getRoleBadge(normalizedRole);

  // Role-based glow styles
  const roleGlow = (() => {
    if (event.system) return {};
    if (normalizedRole === 'OWNER' || normalizedRole === 'ADMIN') {
      return {
        boxShadow: '0 0 0 1px rgba(239,68,68,0.25), 0 0 12px rgba(239,68,68,0.18)',
        borderColor: 'rgba(239,68,68,0.35)',
        animation: 'pulse-glow-admin 3s ease-in-out infinite',
      };
    }
    if (normalizedRole === 'MODERATOR') {
      return { boxShadow: '0 0 0 1px rgba(34,211,238,0.2), 0 0 10px rgba(34,211,238,0.12)', borderColor: 'rgba(34,211,238,0.3)' };
    }
    if (normalizedRole === 'VIP') {
      return { borderColor: 'rgba(251,191,36,0.35)', boxShadow: '0 0 0 1px rgba(251,191,36,0.15)' };
    }
    return {};
  })();

  const usernameGlow = (() => {
    if (event.system) return {};
    if (normalizedRole === 'OWNER' || normalizedRole === 'ADMIN') return { textShadow: '0 0 10px rgba(239,68,68,0.7)' };
    if (normalizedRole === 'MODERATOR') return { textShadow: '0 0 8px rgba(34,211,238,0.6)' };
    return {};
  })();

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
      className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition-all group"
      style={roleGlow}
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {clanLabel ? (
            <span className="inline-flex items-center h-5 rounded-md border border-slate-700 bg-slate-900 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              [{clanLabel}]
            </span>
          ) : null}
          <span
            className={`font-bold text-[15px] leading-5 truncate ${isBanned ? 'line-through text-vault-gray-500 opacity-70' : ''}`}
            style={isBanned ? undefined : { color: event.system ? '#f87171' : usernameColor, ...usernameGlow }}
          >
            {event.username}
          </span>
          {isBanned ? (
            <span className="inline-flex items-center h-5 rounded-md border border-red-500/50 bg-red-500/15 px-1.5 text-[10px] font-bold uppercase tracking-wide text-red-300">
              BANNED
            </span>
          ) : null}
          {!event.system && event.isKing ? <span className="text-[14px] leading-5">👑</span> : null}
          {roleBadge && !event.system ? <span className={roleBadge.className}>{roleBadge.label}</span> : null}
          {event.rankTag ? (
            <span
              className="inline-flex items-center h-5 px-2 rounded-md border text-[10px] font-black uppercase tracking-wide"
              style={{ color: rankColor, borderColor: rankColor }}
            >
              {event.rankTag}
            </span>
          ) : null}
        </div>
        {showChatTimestamps ? (
          <span className="shrink-0 text-[11px] text-slate-500 font-mono group-hover:text-slate-400 transition mt-0.5">
            {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : null}
      </div>
      <p className="text-sm text-slate-200 leading-snug break-words">
        <RenderChatMessage text={event.text} onMentionClick={onMentionClick} />
      </p>
    </motion.div>
  );
});

const LiveChatPanel = React.memo(function LiveChatPanel({
  desktopVisible,
  mobileOpen,
  onCloseMobile,
  chatMessages,
  chatInput,
  rainBanner,
  suggestionType,
  suggestionQuery,
  mentionSuggestions,
  emojiSuggestions,
  showChatTimestamps,
  reducedMotion,
  chatScrollRef,
  onChatInputChange,
  onSuggestionSelect,
  onMentionClick,
  onSubmitChat,
}: {
  desktopVisible: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  chatMessages: ChatMessage[];
  chatInput: string;
  rainBanner: RainBannerState;
  suggestionType: SuggestionType | null;
  suggestionQuery: string;
  mentionSuggestions: string[];
  emojiSuggestions: string[];
  showChatTimestamps: boolean;
  reducedMotion: boolean;
  chatScrollRef: React.RefObject<HTMLDivElement | null>;
  onChatInputChange: (value: string, caretPosition: number) => void;
  onSuggestionSelect: (value: string) => void;
  onMentionClick: (username: string) => void;
  onSubmitChat: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const panelRenderCountRef = useRef(0);
  panelRenderCountRef.current += 1;
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [isSuggestionDismissed, setIsSuggestionDismissed] = useState(false);
  const visibleSuggestions = useMemo(
    () => {
      if (isSuggestionDismissed) {
        return [];
      }

      if (suggestionType === 'mention') {
        return mentionSuggestions;
      }

      if (suggestionType === 'emoji') {
        return emojiSuggestions;
      }

      return [];
    },
    [isSuggestionDismissed, suggestionType, mentionSuggestions, emojiSuggestions]
  );

  useEffect(() => {
    setIsSuggestionDismissed(false);
  }, [chatInput, suggestionType]);

  useEffect(() => {
    if (visibleSuggestions.length === 0) {
      setActiveSuggestionIndex(0);
      return;
    }

    setActiveSuggestionIndex((current) => Math.min(current, visibleSuggestions.length - 1));
  }, [visibleSuggestions]);

  const handleMentionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape' && visibleSuggestions.length > 0) {
        event.preventDefault();
        setIsSuggestionDismissed(true);
        return;
      }

      if (visibleSuggestions.length === 0) {
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveSuggestionIndex((current) => (current + 1) % visibleSuggestions.length);
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveSuggestionIndex((current) => (current - 1 + visibleSuggestions.length) % visibleSuggestions.length);
        return;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const selected = visibleSuggestions[activeSuggestionIndex];
        if (selected) {
          onSuggestionSelect(selected);
        }
      }
    },
    [activeSuggestionIndex, onSuggestionSelect, visibleSuggestions]
  );

  useEffect(() => {
    if (!ENABLE_RENDER_PROFILING) {
      return;
    }

    if (panelRenderCountRef.current % 10 === 0) {
      console.debug(`[perf] LiveChatPanel renders=${panelRenderCountRef.current} messages=${chatMessages.length}`);
    }
  }, [chatMessages.length]);

  return (
    <div className={`hub-chat fixed md:relative inset-y-0 right-0 z-40 md:z-10 w-[88vw] max-w-[360px] h-full flex-shrink-0 bg-slate-900 rounded-none md:rounded-xl border-l md:border border-slate-800 flex flex-col overflow-hidden shadow-lg transition-all duration-300 ${mobileOpen ? 'translate-x-0' : 'translate-x-full'} ${desktopVisible ? 'md:w-80 md:translate-x-0 md:opacity-100' : 'md:w-0 md:translate-x-full md:opacity-0 md:border-transparent'}`}>
      <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-800 flex items-center gap-3">
        <Activity size={18} className="text-emerald-400" />
        <h3 className="font-bold text-slate-100">Live Chat</h3>
        <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <button
          type="button"
          onClick={onCloseMobile}
          className="md:hidden h-8 w-8 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 inline-flex items-center justify-center"
          aria-label="Close chat drawer"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar space-y-2" ref={chatScrollRef}>
        <AnimatePresence>
          {chatMessages.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs text-slate-500 text-center">No messages yet. Start the conversation.</p>
            </div>
          ) : null}
          {chatMessages.map((event) => (
            <ChatMessageItem
              key={event.id}
              event={event}
              reducedMotion={reducedMotion}
              showChatTimestamps={showChatTimestamps}
              onMentionClick={onMentionClick}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="border-t border-slate-800 p-3 bg-slate-950 shrink-0 sticky bottom-0">
        {rainBanner.active ? (
          <div className="mb-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-200">
            🌧️ RAIN ACTIVE: {rainBanner.amount} NVC in {rainBanner.remainingSeconds}s
          </div>
        ) : null}
        <div className="relative">
          {visibleSuggestions.length > 0 ? (
            <div className="absolute bottom-full mb-2 left-0 w-full z-50 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden">
              <div className="px-3 py-1.5 border-b border-slate-700/80 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {suggestionType === 'emoji' ? 'Emoji Suggestions' : 'Mention Suggestions'}
                {suggestionQuery ? ` - ${suggestionQuery}` : ''}
              </div>
              <div className="max-h-44 overflow-y-auto">
                {visibleSuggestions.map((value, index) => {
                  const isActive = index === activeSuggestionIndex;
                  const isMention = suggestionType === 'mention';
                  const label = isMention ? `@${value}` : `${value} ${EMOJI_MAP[value.toLowerCase()] ?? ''}`.trim();

                  return (
                    <button
                      key={value}
                      type="button"
                      onMouseEnter={() => setActiveSuggestionIndex(index)}
                      onClick={() => onSuggestionSelect(value)}
                      className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                        isActive ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <form onSubmit={onSubmitChat} className="flex items-center gap-2">
          <input
            value={chatInput}
            onChange={(event) => onChatInputChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
            onKeyDown={handleMentionKeyDown}
            placeholder="Nachricht..."
            maxLength={200}
            className="h-10 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition"
          />
          <button
            type="submit"
            disabled={!chatInput.trim()}
            className="h-10 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white flex items-center justify-center transition-colors"
          >
            <Send size={16} />
          </button>
          </form>
        </div>
      </div>
    </div>
  );
});

function SidebarButton({
  icon,
  label,
  active,
  onClick,
  collapsed,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  collapsed: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`hub-nav-btn w-full flex items-center ${collapsed ? 'justify-center' : 'gap-3'} p-3 rounded-lg transition-colors font-medium ${
        active ? 'hub-nav-btn-active bg-blue-600/10 text-blue-500' : 'hub-nav-btn-idle text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
      title={collapsed ? label : undefined}
    >
      {icon}
      {!collapsed ? <span>{label}</span> : null}
    </button>
  );
}
