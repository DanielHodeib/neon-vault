'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
  LogOut,
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
import RouletteGame from '@/components/games/RouletteGame';
import SlotsGame from '@/components/games/SlotsGame';
import PokerGame from '@/components/games/PokerGame';
import PokerFriendsGame from '@/components/games/PokerFriendsGame';
import CoinflipGame from '@/components/games/CoinflipGame';
import CyberAviator from '@/components/games/CyberAviator';
import LeaderboardPanel from '@/components/LeaderboardPanel';
import QuestsPanel from '@/components/QuestsPanel';
import AnnouncementOverlay from '@/components/AnnouncementOverlay';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { formatCompactNumber, formatMoney, formatUserBalance } from '@/lib/formatMoney';
import { canUseRankTag, getRankColor, RANKS, type RankTag } from '@/lib/ranks';
import { useCasinoStore } from '../../store/useCasinoStore';

const AdminPanel = dynamic(() => import('@/components/AdminPanel'));

type Tab = 'crash' | 'crash-aviator' | 'slots' | 'blackjack' | 'roulette' | 'poker' | 'coinflip' | 'friends' | 'leaderboard' | 'quests' | 'settings' | 'admin';
type PokerMode = 'solo' | 'friends';
type SettingsSection = 'overview' | 'appearance' | 'gameplay' | 'privacy' | 'security';

interface ChatMessage {
  id: string;
  username: string;
  text: string;
  createdAt: number;
  role?: string;
  isKing?: boolean;
  clanTag?: string | null;
  rankTag?: string;
  rankColor?: string;
  system?: boolean;
}

interface RainBannerState {
  active: boolean;
  amount: number;
  remainingSeconds: number;
  endsAt: number;
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
}

interface BlockSummary {
  blockId: string;
  userId: string;
  username: string;
}

interface SettingsPayload {
  soundEnabled: boolean;
  theme: ThemeOption;
  selectedRankTag: RankTag;
  publicProfile: boolean;
  bio: string;
  clanTag?: string | null;
}

type ThemeOption = 'slate' | 'steel' | 'sunset' | 'ocean' | 'matrix';
type SuggestionType = 'mention' | 'emoji';

interface PublicProfileData {
  username: string;
  balance: number;
  xp: number;
  favoriteGame: string;
  bio: string;
  theme: string;
  publicProfile: boolean;
  isFriend: boolean;
  createdAt: string;
  friendsCount: number;
}

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
  const fromEnv = process.env.NEXT_PUBLIC_GAME_SERVER_URL;

  if (typeof window === 'undefined') {
    return fromEnv ?? 'http://localhost:4001';
  }

  if (fromEnv === 'same-origin') {
    return window.location.origin;
  }

  if (!fromEnv) {
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    if (isLocalHost || isPrivateIp) {
      return `${window.location.protocol}//${window.location.hostname}:4001`;
    }
    return window.location.origin;
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
    const host = window.location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1';
    const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    if (isLocalHost || isPrivateIp) {
      return `${window.location.protocol}//${window.location.hostname}:4001`;
    }
    return window.location.origin;
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
  const [socketConnected, setSocketConnected] = useState(false);
  const [hadSocketConnection, setHadSocketConnection] = useState(false);

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
  const [chatRole, setChatRole] = useState('USER');
  const [chatClanTag, setChatClanTag] = useState<string | null>(null);
  const [isKing, setIsKing] = useState(false);
  const [serverAdminAccess, setServerAdminAccess] = useState(false);
  const [rainBanner, setRainBanner] = useState<RainBannerState>({
    active: false,
    amount: 0,
    remainingSeconds: 0,
    endsAt: 0,
  });
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
  const isDanielAdmin = useMemo(
    () => effectiveUsername === 'Daniel' && chatRole === 'ADMIN' && serverAdminAccess,
    [effectiveUsername, chatRole, serverAdminAccess]
  );
  const normalizedEffectiveUsername = useMemo(() => effectiveUsername.trim().toLowerCase(), [effectiveUsername]);
  const isCurrentCrashPlayer = useCallback(
    (player: CrashPlayer) => String(player.username ?? '').trim().toLowerCase() === normalizedEffectiveUsername,
    [normalizedEffectiveUsername]
  );

  useEffect(() => {
    if (activeTab === 'admin' && !isDanielAdmin) {
      setActiveTab('settings');
    }
  }, [activeTab, isDanielAdmin]);

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

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings', { cache: 'no-store' });
      if (!response.ok) {
        console.warn(`Settings API returned ${response.status}`);
        return;
      }

      const payload = (await response.json()) as { settings?: SettingsPayload };
      if (!payload.settings) {
        return;
      }

      setSoundEnabled(payload.settings.soundEnabled);
      setTheme(payload.settings.theme);
      setSelectedRankTag(payload.settings.selectedRankTag ?? 'BRONZE');
      setPublicProfile(payload.settings.publicProfile);
      setBio(payload.settings.bio ?? '');
      setClanDraft(payload.settings.clanTag ?? '');
      settingsHydratedRef.current = true;
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }, []);

  useEffect(() => {
    setUsernameDraft(effectiveUsername);
  }, [effectiveUsername]);

  useEffect(() => {
    void hydrateFromSession();
    void fetchInitialBalance();
  }, [fetchInitialBalance, hydrateFromSession]);

  useEffect(() => {
    void loadFriends();
    void loadSettings();

    const interval = window.setInterval(() => {
      void loadFriends();
    }, 7000);

    return () => window.clearInterval(interval);
  }, [loadFriends, loadSettings]);

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
            role?: string;
            clanTag?: string | null;
          };
        };

        if (!isActive || !payload.user) {
          return;
        }

        setChatRole((payload.user.role ?? 'USER').toUpperCase());
        setChatClanTag(payload.user.clanTag ?? null);

        const adminResponse = await fetch('/api/admin/me', { cache: 'no-store' });
        if (adminResponse.ok) {
          const adminPayload = (await adminResponse.json()) as { isAdmin?: boolean };
          setServerAdminAccess(Boolean(adminPayload.isAdmin));
        } else {
          setServerAdminAccess(false);
        }
      } catch {
        // Keep defaults if profile fetch fails.
        setServerAdminAccess(false);
      }
    })();

    return () => {
      isActive = false;
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
      transports: forcePolling ? ['polling'] : ['websocket', 'polling'],
      upgrade: !forcePolling,
      query: { 
        username: effectiveUsername, 
        role: chatRole,
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
    };
    const disconnectStatusHandler = () => setSocketConnected(false);
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

    const onlineUsersHandler = (users: string[]) => setOnlineUsers(users ?? []);
    const chatHistoryHandler = (history: ChatMessage[]) => setChatMessages(history);
    const chatMessageHandler = (message: ChatMessage) => {
      setChatMessages((prev) => [...prev, message].slice(-60));
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

    socket.on('connect', connectHandler);
    socket.on('disconnect', disconnectStatusHandler);
    socket.on('disconnect', disconnectRecoveryHandler);
    socket.on('online_users', onlineUsersHandler);
    socket.on('chat_history', chatHistoryHandler);
    socket.on('chat_message', chatMessageHandler);
    socket.on('chat_mention', chatMentionHandler);
    socket.on('notification', notificationHandler);
    socket.on('global_notification', globalNotificationHandler);
    socket.on('admin_broadcast', adminBroadcastHandler);
    socket.on('rain_started', rainStartedHandler);
    socket.on('rain_tick', rainTickHandler);
    socket.on('rain_ended', rainEndedHandler);
    socket.on('rain_reward', rainRewardHandler);
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
      socket.off('online_users', onlineUsersHandler);
      socket.off('chat_history', chatHistoryHandler);
      socket.off('chat_message', chatMessageHandler);
      socket.off('chat_mention', chatMentionHandler);
      socket.off('notification', notificationHandler);
      socket.off('global_notification', globalNotificationHandler);
      socket.off('admin_broadcast', adminBroadcastHandler);
      socket.off('rain_started', rainStartedHandler);
      socket.off('rain_tick', rainTickHandler);
      socket.off('rain_ended', rainEndedHandler);
      socket.off('rain_reward', rainRewardHandler);
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
  }, [addWin, chatClanTag, chatRole, commitPendingCrashBet, isCurrentCrashPlayer, refundCommittedCrashBet, setAnnouncement]);

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
          body: JSON.stringify({ soundEnabled, theme, selectedRankTag, publicProfile, bio, clanTag: clanDraft }),
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
    [soundEnabled, theme, selectedRankTag, publicProfile, bio, clanDraft]
  );

  useEffect(() => {
    if (!settingsHydratedRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistSettings(true);
    }, 850);

    return () => window.clearTimeout(timeout);
  }, [soundEnabled, theme, selectedRankTag, publicProfile, bio, clanDraft, persistSettings]);

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

  const handleRespondFriendRequest = async (friendshipId: string, action: 'accept' | 'decline') => {
    const response = await fetch('/api/friends/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friendshipId, action }),
    });

    const payload = (await response.json()) as { error?: string };
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

    const payload = (await response.json()) as { error?: string };
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

    const payload = (await response.json()) as { error?: string };
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

  const handleSendMoneyToFriend = async (targetUserId: string, targetUsername: string) => {
    const rawAmount = window.prompt(`Wie viel NVC möchtest du an ${targetUsername} senden?`, '100');
    if (!rawAmount) {
      return;
    }

    const amount = Math.floor(Number(rawAmount));
    if (!Number.isFinite(amount) || amount <= 0) {
      setFriendNotice('Please enter a valid amount greater than 0.');
      return;
    }

    const response = await fetch('/api/friends/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId, amount }),
    });

    const payload = (await response.json()) as { error?: string };

    if (!response.ok) {
      setFriendNotice(payload.error ?? 'Could not send money.');
      return;
    }

    await syncBalanceFromServer();
    setFriendNotice(`Sent ${amount} NVC to ${targetUsername}.`);
    toast.success(`${amount} NVC an ${targetUsername} gesendet!`);

    const socket = socketRef.current;
    if (socket?.connected && payload.receiverUsername) {
      socket.emit('friend_transfer_notification', {
        receiverUsername: payload.receiverUsername,
        message: 'Du hast NVC erhalten!',
      });
    }
  };

  const handleViewProfile = useCallback(async (targetUsername: string) => {
    setProfileLoading(true);
    setFriendNotice('');

    try {
      const response = await fetch(`/api/profile/${encodeURIComponent(targetUsername)}`, { cache: 'no-store' });
      const payload = (await response.json()) as { error?: string; profile?: PublicProfileData };

      if (!response.ok || !payload.profile) {
        setSelectedProfile(null);
        setFriendNotice(payload.error ?? 'Could not load profile.');
        return;
      }

      setSelectedProfile(payload.profile);
    } catch (error) {
      console.error('Failed to load profile:', error);
      setSelectedProfile(null);
      setFriendNotice('Failed to load profile. Check your connection.');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const openProfileModal = useCallback(
    (targetUsername: string) => {
      const trimmedUsername = String(targetUsername ?? '').trim();
      if (!trimmedUsername) {
        return;
      }

      setProfileModalOpen(true);
      void handleViewProfile(trimmedUsername);
    },
    [handleViewProfile]
  );

  const handleMentionClick = useCallback(
    (targetUsername: string) => {
      const trimmedUsername = String(targetUsername ?? '').trim();
      if (!trimmedUsername) {
        return;
      }

      setProfileModalOpen(true);
      void handleViewProfile(trimmedUsername);
    },
    [handleViewProfile]
  );

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

  return (
    <div className={`hub-root h-screen w-full ${themeSurfaceClass} text-slate-200 font-sans flex overflow-hidden`}>
      <AnnouncementOverlay message={announcement} />
      <aside className={`hub-sidebar ${sidebarCollapsed ? 'w-20' : 'w-64'} bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 z-20 transition-all duration-300`}>
        <div className={`h-16 flex items-center ${sidebarCollapsed ? 'px-3 justify-center' : 'px-6'} border-b border-slate-800`}>
          <button
            onClick={() => setSidebarCollapsed((current) => !current)}
            className={`w-8 h-8 bg-blue-600 rounded flex items-center justify-center ${sidebarCollapsed ? '' : 'mr-3'} hover:bg-blue-500 transition-colors`}
            aria-label="Toggle sidebar"
          >
            <Menu size={18} className="text-white" />
          </button>
          {!sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => router.push('/')}
              className="text-lg font-bold text-white tracking-wide hover:text-cyan-200 transition-colors"
            >
              NEON VAULT
            </button>
          ) : null}
        </div>

        <nav className={`flex-1 ${sidebarCollapsed ? 'p-3' : 'p-4'} space-y-2 overflow-y-auto custom-scrollbar`}>
          <SidebarButton icon={<House size={20} />} label="Home" active={false} onClick={() => router.push('/')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<TrendingUp size={20} />} label="Neon Rocket" active={activeTab === 'crash'} onClick={() => setActiveTab('crash')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<TrendingUp size={20} />} label="Cyber Aviator" active={activeTab === 'crash-aviator'} onClick={() => setActiveTab('crash-aviator')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<Coins size={20} />} label="Slots" active={activeTab === 'slots'} onClick={() => setActiveTab('slots')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<Hand size={20} />} label="Blackjack" active={activeTab === 'blackjack'} onClick={() => setActiveTab('blackjack')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<CircleDashed size={20} />} label="Roulette" active={activeTab === 'roulette'} onClick={() => setActiveTab('roulette')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<Spade size={20} />} label="Poker" active={activeTab === 'poker'} onClick={() => setActiveTab('poker')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<Coins size={20} />} label="Coinflip" active={activeTab === 'coinflip'} onClick={() => setActiveTab('coinflip')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<Users size={20} />} label="Friends" active={activeTab === 'friends'} onClick={() => setActiveTab('friends')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<TrendingUp size={20} />} label="Leaderboard" active={activeTab === 'leaderboard'} onClick={() => setActiveTab('leaderboard')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<ShieldCheck size={20} />} label="Quests" active={activeTab === 'quests'} onClick={() => setActiveTab('quests')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<Settings size={20} />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} collapsed={sidebarCollapsed} />
          {isDanielAdmin ? (
            <SidebarButton icon={<ShieldCheck size={20} />} label="Admin" active={activeTab === 'admin'} onClick={() => setActiveTab('admin')} collapsed={sidebarCollapsed} />
          ) : null}
        </nav>

        <div className={`${sidebarCollapsed ? 'p-3' : 'p-4'} border-t border-slate-800`}>
          <button
            onClick={handleFaucet}
            disabled={daily.faucetClaimed}
            className={`w-full py-3 rounded text-sm font-medium transition-colors text-slate-300 active:scale-95 ${
              daily.faucetClaimed
                ? 'bg-slate-800/60 cursor-not-allowed opacity-70'
                : 'bg-slate-800 hover:bg-slate-700'
            } ${sidebarCollapsed ? 'px-0' : ''}`}
          >
            {sidebarCollapsed ? 'F' : daily.faucetClaimed ? 'Faucet Claimed' : 'Claim Daily Faucet (+5000)'}
          </button>
        </div>
      </aside>

      <main className="hub-main flex-1 flex flex-col min-h-0 min-w-0">
        <header className="hub-header h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 lg:px-8 z-10 gap-3">
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldCheck size={18} className="text-emerald-500" />
            <span className="text-sm font-medium">{socketConnected ? 'Realtime Connected' : 'Realtime Offline'}</span>
          </div>

          <div className="flex items-center gap-3 lg:gap-4 min-w-0">
            {isMounted ? (
              <div className="text-right min-w-0">
                <div className="flex items-center justify-end gap-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500 truncate">{effectiveUsername}</p>
                  {isDanielAdmin ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-200 shadow-[0_0_10px_rgba(244,63,94,0.25)]">
                      <span className="h-1.5 w-1.5 rounded-full bg-rose-300" />
                      Admin Verified
                    </span>
                  ) : null}
                </div>
                <p className="font-mono text-xs text-slate-400 whitespace-nowrap">Level {level} · XP {xp}</p>
                <p className="font-mono text-[10px] text-slate-500 whitespace-nowrap hidden xl:block">
                  {levelProgress}% to L{level + 1} ({nextLevelXp - xp} XP left)
                </p>
                <p className="font-mono text-[10px] uppercase text-cyan-400 whitespace-nowrap hidden lg:block">Crash Room {crashRoomId}</p>
              </div>
            ) : (
              <div className="h-10 w-32 bg-slate-800 animate-pulse rounded shrink-0" />
            )}
            <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 px-3 lg:px-4 py-2 rounded-lg shrink-0">
              <Wallet size={16} className="text-slate-400" />
              <span suppressHydrationWarning className="font-mono text-lg font-bold text-white">
                {isMounted ? formatUserBalance(balance, useCompactBalance) : '0'}
              </span>
              <span className="text-sm font-bold text-blue-500">NVC</span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="h-10 px-3 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold uppercase tracking-wide inline-flex items-center gap-1.5 shrink-0 whitespace-nowrap"
            >
              <LogOut size={14} /> Logout
            </button>
          </div>
        </header>

        {hadSocketConnection && !socketConnected ? (
          <div className="mx-4 lg:mx-6 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200">
            Verbindung zum Server verloren. Versuche neu zu verbinden...
          </div>
        ) : null}

        <div className="flex-1 min-h-0 min-w-0 flex p-4 lg:p-6 gap-4 overflow-hidden">
          <div className="hub-panel relative flex-1 min-h-0 min-w-0 flex flex-col bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
            {activeTab === 'crash' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto flex flex-col">
                <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden px-6 py-6">
                  <div className="absolute inset-0 opacity-40 pointer-events-none">
                    <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-blue-600/15 to-transparent" />
                    <motion.div
                      className="absolute left-0 right-0 bottom-12 h-[2px] bg-gradient-to-r from-transparent via-blue-500/70 to-transparent"
                      animate={reducedMotion ? { opacity: 0.5 } : { x: ['-25%', '25%', '-25%'] }}
                      transition={reducedMotion ? { duration: 0 } : { duration: 2.2, repeat: Infinity, ease: 'linear' }}
                    />
                  </div>

                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-3">
                    <div className="px-3 py-1.5 rounded-md border border-slate-700 bg-slate-950/80 text-xs text-slate-300 uppercase tracking-wide">
                      {hasBet ? `Potential ${(crashActiveBetAmount * crashState.multiplier).toFixed(2)} NVC` : 'No Active Bet'}
                    </div>
                    <div className="px-3 py-1.5 rounded-md border border-slate-700 bg-slate-950/80 text-xs text-slate-300 uppercase tracking-wide">
                      {autoCashOutEnabled ? `Auto Cashout ${autoCashOutValue.toFixed(2)}x` : 'Auto Cashout Off'}
                    </div>
                  </div>

                  <AnimatePresence>
                    {payoutToast ? (
                      <motion.div
                        key={`${payoutToast.label}-${payoutToast.text}`}
                        initial={{ opacity: 0, y: -18, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.98 }}
                        transition={{ duration: 0.2 }}
                        className={`absolute top-16 z-20 px-4 py-2 rounded-md border text-sm font-bold tracking-wide ${
                          payoutToast.tone === 'auto'
                            ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                            : 'border-blue-500/40 bg-blue-500/15 text-blue-300'
                        }`}
                      >
                        {payoutToast.label} {payoutToast.text}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <div className={`text-[120px] md:text-[160px] font-black font-mono leading-none z-10 tracking-tighter transition-colors ${crashState.phase === 'crashed' ? 'text-red-500' : 'text-white'}`}>
                    {crashState.multiplier.toFixed(2)}x
                  </div>
                  <div className="mt-4 text-slate-400 font-medium uppercase tracking-widest text-lg z-10">{crashLabel}</div>
                  {crashState.phase === 'waiting' ? (
                    <div className="mt-3 z-10 text-center">
                      <div className="text-4xl md:text-5xl font-black font-mono text-cyan-300 leading-none">
                        {Math.max(0, crashCountdownSeconds)}s
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.25em] text-slate-500">Round starts soon</div>
                    </div>
                  ) : null}

                  <div className="absolute bottom-4 left-4 right-4">
                    <div className="mb-2 text-[11px] font-bold text-slate-500 uppercase tracking-wide">Last Crashes</div>
                    <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5">
                      {crashState.history.length === 0 ? (
                        <div className="col-span-6 md:col-span-12 text-xs text-slate-500">No rounds yet</div>
                      ) : (
                        crashState.history.map((entry, index) => (
                          <div
                            key={`${entry}-${index}`}
                            className={`text-center rounded px-1.5 py-1 text-[11px] font-mono border ${
                              entry >= 3
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : entry >= 1.8
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                  : 'bg-red-500/10 text-red-400 border-red-500/30'
                            }`}
                          >
                            {entry.toFixed(2)}x
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950 border-t border-slate-800 p-4 lg:p-6 grid gap-4 lg:grid-cols-[1.4fr_1fr_0.7fr_0.9fr] items-end">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Crash Room</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={crashRoomInput}
                        onChange={(event) => setCrashRoomInput(event.target.value)}
                        className="h-11 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-cyan-500"
                        placeholder="global oder room-name"
                      />
                      <button
                        onClick={handleJoinCrashRoom}
                        disabled={joiningCrashRoom}
                        className="h-11 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {joiningCrashRoom ? 'Joining...' : 'Join'}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        onClick={handleCreateCrashRoom}
                        className="h-8 px-3 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300"
                      >
                        Create Private
                      </button>
                      <button
                        onClick={handleCopyCrashInvite}
                        className="h-8 px-3 rounded-md border border-cyan-700/60 bg-cyan-600/10 hover:bg-cyan-600/20 text-xs font-semibold text-cyan-300"
                      >
                        Copy Invite
                      </button>
                    </div>

                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/70 p-2">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">In room ({crashRoomMembers.length})</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {crashRoomMembers.length === 0 ? <span className="text-xs text-slate-500">No players yet</span> : null}
                        {crashRoomMembers.map((member, index) => (
                          <span key={`${member}-${index}`} className="px-2 py-1 rounded-md border border-slate-700 bg-slate-950 text-[11px] text-slate-200">
                            {member}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Bet Amount</label>
                    <div className="flex bg-slate-900 border border-slate-800 rounded-lg overflow-hidden focus-within:border-blue-500 transition-colors">
                      <input
                        type="number"
                        value={betInput || ''}
                        onChange={(event) => setBetInput(event.target.value.replace(/[^0-9]/g, ''))}
                        disabled={crashState.phase === 'running' || hasBet || isPlacingCrashBet || isCrashBetCooldown}
                        className="w-full bg-transparent p-4 outline-none font-mono text-white"
                      />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2">
                      <button
                        onClick={() => {
                          const current = Math.max(0, Math.floor(Number(betInput || 0)));
                          const next = Math.max(1, Math.floor(current / 2));
                          setBetInput(String(next));
                        }}
                        disabled={crashState.phase === 'running' || hasBet || isPlacingCrashBet || isCrashBetCooldown}
                        className="h-8 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        1/2
                      </button>
                      <button
                        onClick={() => {
                          const current = Math.max(0, Math.floor(Number(betInput || 0)));
                          const doubled = current <= 0 ? 2 : current * 2;
                          const next = Math.min(Math.floor(parseFloat(balance)), doubled);
                          setBetInput(String(Math.max(1, next)));
                        }}
                        disabled={crashState.phase === 'running' || hasBet || isPlacingCrashBet || isCrashBetCooldown}
                        className="h-8 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        2x
                      </button>
                      <button
                        onClick={() => setBetInput(String(Math.max(1, Math.floor(parseFloat(balance)))))}
                        disabled={crashState.phase === 'running' || hasBet || isPlacingCrashBet || isCrashBetCooldown}
                        className="h-8 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        MAX
                      </button>
                    </div>
                    {errorMsg && <p className="text-red-500 text-xs mt-2 font-medium">{errorMsg}</p>}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Auto Cashout</label>
                    <button
                      type="button"
                      onClick={() => setAutoCashOutEnabled((current) => !current)}
                      disabled={crashState.phase === 'running' && hasBet}
                      className={`mb-2 w-full h-9 rounded-lg border text-xs font-bold uppercase transition-colors ${
                        autoCashOutEnabled
                          ? 'border-blue-600 bg-blue-600/10 text-blue-400'
                          : 'border-slate-700 bg-slate-900 text-slate-400'
                      } ${crashState.phase === 'running' && hasBet ? 'opacity-60 cursor-not-allowed' : 'hover:border-blue-500 hover:text-blue-300'}`}
                    >
                      {autoCashOutEnabled ? 'Auto On' : 'Auto Off'}
                    </button>
                    <div className="flex bg-slate-900 border border-slate-800 rounded-lg overflow-hidden focus-within:border-blue-500 transition-colors">
                      <input
                        type="number"
                        min={1}
                        step={0.05}
                        value={autoCashOutInput || ''}
                        onChange={(event) => setAutoCashOutInput(event.target.value)}
                        disabled={crashState.phase === 'running' && hasBet}
                        className="w-full bg-transparent p-4 outline-none font-mono text-white"
                      />
                    </div>
                  </div>

                  <div>
                    {crashState.phase === 'running' && hasBet ? (
                      <button
                        onClick={handleCashOut}
                        className="w-full py-5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-lg uppercase transition-colors"
                      >
                        Cash Out {(crashActiveBetAmount * crashState.multiplier).toFixed(2)}
                      </button>
                    ) : (
                      <button
                        onClick={handleCrashBet}
                        disabled={crashState.phase !== 'waiting' || hasBet || isPlacingCrashBet || isCrashBetCooldown}
                        className="w-full py-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isPlacingCrashBet
                          ? 'Placing...'
                          : isCrashBetCooldown
                            ? 'Locked...'
                            : crashState.phase === 'waiting'
                              ? 'Place Bet'
                              : 'Round Running'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'crash-aviator' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
                <CyberAviator />
              </div>
            )}

            {activeTab === 'blackjack' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
                <BlackjackGame username={effectiveUsername} />
              </div>
            )}
            {activeTab === 'roulette' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
                <RouletteGame />
              </div>
            )}
            {activeTab === 'slots' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
                <SlotsGame />
              </div>
            )}
            {activeTab === 'poker' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto flex flex-col">
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

                <div className="flex-1 min-h-0">{pokerMode === 'solo' ? <PokerGame /> : <PokerFriendsGame username={effectiveUsername} />}</div>
              </div>
            )}

            {activeTab === 'coinflip' && (
              <div className="flex-1 min-h-0 min-w-0 overflow-y-auto">
                <CoinflipGame socket={socketRef.current} username={effectiveUsername} />
              </div>
            )}

            {activeTab === 'friends' && (
              <div className="flex-1 min-h-0 min-w-0 p-6 overflow-y-auto">
                <h2 className="text-2xl font-bold text-slate-100">Friends & Presence</h2>
                <p className="text-sm text-slate-400 mt-1">Send requests, accept invites, and track online status in real time.</p>
                {friendRealtimeNotice ? (
                  <p className="mt-2 text-sm font-semibold text-cyan-300">{friendRealtimeNotice}</p>
                ) : null}

                <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <label className="block text-xs uppercase tracking-wide text-slate-500 mb-2">Find Player</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Username..."
                      value={friendSearch}
                      onChange={(event) => setFriendSearch(event.target.value)}
                      className="h-11 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 text-slate-100 outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={handleSendFriendRequest}
                      className="h-11 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold"
                    >
                      Add
                    </button>
                  </div>
                  {friendNotice ? <p className="mt-2 text-xs text-slate-400">{friendNotice}</p> : null}
                </div>

                <div className="mt-5 grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Friends</p>
                    {friendsLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}
                    {!friendsLoading && friendsAccepted.length === 0 ? (
                      <p className="text-slate-500 italic text-sm p-4 text-center border border-dashed border-slate-800 rounded-lg">No accepted friends yet.</p>
                    ) : null}
                    {friendsAccepted.length > 0 ? (
                      <div className="rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800">
                        {friendsAccepted.map((friend) => {
                          const isOnline = showOnlinePresence && onlineUsersSet.has(friend.username.trim().toLowerCase());
                          const displayName = (friend.username ?? '').trim() || 'Unknown Friend';
                          return (
                            <div
                              key={friend.friendshipId}
                              onClick={() => openProfileModal(displayName)}
                              className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-800/40 transition-colors"
                            >
                              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                              <button
                                type="button"
                                onClick={() => openProfileModal(displayName)}
                                className="font-semibold text-slate-200 truncate hover:text-cyan-300 hover:underline"
                              >
                                {displayName}
                              </button>
                              <div className="ml-auto flex items-center gap-1.5">
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleSendMoneyToFriend(friend.userId, displayName);
                                  }}
                                  className="h-8 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                                >
                                  Send
                                </button>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    openProfileModal(displayName);
                                  }}
                                  className="h-8 px-2.5 rounded-md bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 text-xs inline-flex items-center gap-1"
                                >
                                  <Eye size={13} />
                                  View
                                </button>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleRemoveFriendship(friend.friendshipId);
                                  }}
                                  className="h-8 w-8 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-800/80 inline-flex items-center justify-center"
                                  title="Remove friend"
                                  aria-label={`Remove ${displayName}`}
                                >
                                  <Trash2 size={13} />
                                </button>
                                <button
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    void handleBlockUser(friend.userId);
                                  }}
                                  className="h-8 w-8 rounded-md text-slate-500 hover:text-red-400 hover:bg-slate-800/80 inline-flex items-center justify-center"
                                  title="Block user"
                                  aria-label={`Block ${displayName}`}
                                >
                                  <Ban size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </section>

                  <div className="space-y-4">
                    <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                      <button
                        type="button"
                        onClick={() => setIncomingOpen((current) => !current)}
                        className="w-full flex items-center justify-between"
                      >
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Incoming Requests</span>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-5 min-w-5 px-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300 inline-flex items-center justify-center">
                            {pendingIncoming.length}
                          </span>
                          {incomingOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                        </span>
                      </button>
                      {incomingOpen ? (
                        pendingIncoming.length === 0 ? (
                          <p className="mt-3 text-slate-500 italic text-sm p-3 text-center border border-dashed border-slate-800 rounded-lg">No incoming requests.</p>
                        ) : (
                          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800">
                            {pendingIncoming.map((request) => (
                              <div key={request.friendshipId} className="flex items-center gap-3 px-3 py-2.5">
                                <span className="font-medium text-slate-200 truncate">{request.username}</span>
                                <div className="ml-auto flex items-center gap-2">
                                  <button
                                    onClick={() => handleRespondFriendRequest(request.friendshipId, 'accept')}
                                    className="h-8 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    onClick={() => handleRespondFriendRequest(request.friendshipId, 'decline')}
                                    className="h-8 px-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                                  >
                                    Decline
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      ) : null}
                    </section>

                    <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                      <button
                        type="button"
                        onClick={() => setOutgoingOpen((current) => !current)}
                        className="w-full flex items-center justify-between"
                      >
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outgoing Requests</span>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-5 min-w-5 px-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300 inline-flex items-center justify-center">
                            {pendingOutgoing.length}
                          </span>
                          {outgoingOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                        </span>
                      </button>
                      {outgoingOpen ? (
                        pendingOutgoing.length === 0 ? (
                          <p className="mt-3 text-slate-500 italic text-sm p-3 text-center border border-dashed border-slate-800 rounded-lg">No pending requests.</p>
                        ) : (
                          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800">
                            {pendingOutgoing.map((request) => (
                              <div key={request.friendshipId} className="flex items-center gap-3 px-3 py-2.5">
                                <span className="font-medium text-slate-200 truncate">{request.username}</span>
                                <span className="text-xs uppercase tracking-wide text-amber-400">Pending</span>
                                <button
                                  onClick={() => handleRemoveFriendship(request.friendshipId)}
                                  className="ml-auto h-8 px-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                                >
                                  Cancel
                                </button>
                              </div>
                            ))}
                          </div>
                        )
                      ) : null}
                    </section>

                    <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                      <button
                        type="button"
                        onClick={() => setBlockedOpen((current) => !current)}
                        className="w-full flex items-center justify-between"
                      >
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Blocked Users</span>
                        <span className="inline-flex items-center gap-2">
                          <span className="h-5 min-w-5 px-1 rounded-full bg-slate-800 border border-slate-700 text-[11px] text-slate-300 inline-flex items-center justify-center">
                            {blockedUsers.length}
                          </span>
                          {blockedOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                        </span>
                      </button>
                      {blockedOpen ? (
                        blockedUsers.length === 0 ? (
                          <p className="mt-3 text-slate-500 italic text-sm p-3 text-center border border-dashed border-slate-800 rounded-lg">No blocked users.</p>
                        ) : (
                          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 divide-y divide-slate-800">
                            {blockedUsers.map((blocked) => (
                              <div key={blocked.blockId} className="flex items-center gap-3 px-3 py-2.5">
                                <span className="font-medium text-slate-200 truncate">{blocked.username}</span>
                                <button
                                  onClick={() => handleUnblockUser(blocked.blockId)}
                                  className="ml-auto h-8 px-2.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                                >
                                  Unblock
                                </button>
                              </div>
                            ))}
                          </div>
                        )
                      ) : null}
                    </section>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">All Online Players</p>
                  {uniqueOnlineUsers.length === 0 ? (
                    <p className="text-slate-500 italic text-sm p-4 text-center border border-dashed border-slate-800 rounded-lg">No players online right now.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {uniqueOnlineUsers.map((user) => (
                        <button
                          key={user}
                          type="button"
                          onClick={() => openProfileModal(user)}
                          className="flex items-center justify-between p-4 bg-slate-900 rounded-lg border border-slate-800 text-left hover:border-cyan-500/40 hover:bg-slate-800/80 transition-colors"
                        >
                          <span className="font-medium text-slate-200 truncate">{user}</span>
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 rounded-xl border border-cyan-700/30 bg-gradient-to-br from-slate-950/80 to-slate-900/80 p-4 shadow-[0_0_30px_rgba(6,182,212,0.12)]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Activity size={16} className="text-cyan-300" />
                      <p className="text-xs font-semibold uppercase tracking-wide text-cyan-300">Friend Profile Preview</p>
                    </div>
                    {profileLoading ? <span className="text-xs text-slate-400">Loading...</span> : null}
                  </div>

                  {!selectedProfile && !profileLoading ? (
                    <p className="text-slate-500 italic text-sm p-4 text-center border border-dashed border-slate-800 rounded-lg mt-3">
                      Select a friend and click View Profile.
                    </p>
                  ) : null}

                  {selectedProfile ? (
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/90 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-100">{selectedProfile.username}</p>
                        <span className="text-xs uppercase tracking-wide text-cyan-300">{selectedProfile.theme}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Balance {formatUserBalance(selectedProfile.balance, false)} NVC · XP {selectedProfile.xp} · Friends {selectedProfile.friendsCount}
                      </p>
                      <p className="mt-1 text-xs text-cyan-300">Favorite: {selectedProfile.favoriteGame}</p>
                      <p className="mt-2 text-sm text-slate-300">{selectedProfile.bio || 'No bio yet.'}</p>
                      <p className="mt-2 text-[11px] text-slate-500">
                        Joined {new Date(selectedProfile.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  ) : null}
                </div>

              </div>
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

            {activeTab === 'admin' && isDanielAdmin ? (
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

          {profileModalOpen ? (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 sm:p-6">
                <div className="w-full max-w-2xl rounded-xl border border-cyan-700/30 bg-gradient-to-br from-slate-950 to-slate-900 p-6 sm:p-7 shadow-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Activity size={16} className="text-cyan-300" />
                      <p className="text-sm font-semibold uppercase tracking-wide text-cyan-300">Friend Profile</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfileModalOpen(false)}
                    className="h-8 w-8 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
                    aria-label="Close profile preview"
                  >
                    x
                  </button>
                </div>

                {profileLoading ? <p className="mt-4 text-sm text-slate-400">Loading profile...</p> : null}

                {!selectedProfile && !profileLoading ? (
                  <p className="mt-4 text-slate-500 italic text-sm p-4 text-center border border-dashed border-slate-800 rounded-lg">
                    Profile not available.
                  </p>
                ) : null}

                {selectedProfile ? (
                    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/90 p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-lg font-semibold text-slate-100">{selectedProfile.username}</p>
                        <span className="text-sm uppercase tracking-wide text-cyan-300">{selectedProfile.theme}</span>
                    </div>
                      <p className="mt-1 text-sm text-slate-300">
                      Balance {formatUserBalance(selectedProfile.balance, false)} NVC · XP {selectedProfile.xp} · Friends {selectedProfile.friendsCount}
                    </p>
                      <p className="mt-1 text-sm text-cyan-300">Favorite: {selectedProfile.favoriteGame}</p>
                      <p className="mt-3 text-base text-slate-200 leading-relaxed">{selectedProfile.bio || 'No bio yet.'}</p>
                      <p className="mt-3 text-xs text-slate-500">Joined {new Date(selectedProfile.createdAt).toLocaleDateString()}</p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}

function chatRoleBadgeClass(normalizedRole: string) {
  if (normalizedRole === 'BALLER') {
    return 'inline-flex items-center h-5 text-[10px] font-bold px-2 rounded-md border border-yellow-500/50 text-yellow-300 bg-yellow-500/10 shadow-[0_0_10px_rgba(234,179,8,0.18)]';
  }
  if (normalizedRole === 'ADMIN') {
    return 'inline-flex items-center h-5 text-[10px] font-bold px-2 rounded-md border border-red-500/50 text-red-300 bg-red-500/10';
  }
  if (normalizedRole === 'OVERLORD') {
    return 'inline-flex items-center h-5 text-[10px] font-bold px-2 rounded-md border border-cyan-500/50 text-cyan-300 bg-cyan-500/10';
  }
  if (normalizedRole === 'VIP') {
    return 'inline-flex items-center h-5 text-[10px] font-bold px-2 rounded-md border border-fuchsia-500/50 text-fuchsia-300 bg-fuchsia-500/10';
  }
  return '';
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
  const clanLabel = typeof event.clanTag === 'string' ? event.clanTag.trim() : '';
  const roleBadgeClass = chatRoleBadgeClass(normalizedRole);

  return (
    <motion.div
      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
      className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition-all group"
    >
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {clanLabel ? (
            <span className="inline-flex items-center h-5 rounded-md border border-slate-700 bg-slate-900 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              [{clanLabel}]
            </span>
          ) : null}
          <span className="font-bold text-[15px] leading-5 truncate" style={{ color: event.system ? '#f87171' : usernameColor }}>
            {event.username}
          </span>
          {!event.system && event.isKing ? <span className="text-[14px] leading-5">👑</span> : null}
          {roleBadgeClass && !event.system ? <span className={roleBadgeClass}>{normalizedRole}</span> : null}
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
    <div className="hub-chat relative w-80 lg:w-80 flex-shrink-0 bg-slate-900 rounded-xl border border-slate-800 flex flex-col overflow-hidden hidden lg:flex shadow-lg">
      <div className="p-4 border-b border-slate-800 bg-gradient-to-r from-slate-900 to-slate-800 flex items-center gap-3">
        <Activity size={18} className="text-emerald-400" />
        <h3 className="font-bold text-slate-100">Live Chat</h3>
        <div className="ml-auto w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
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

      <div className="border-t border-slate-800 p-3 bg-slate-950 shrink-0">
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
