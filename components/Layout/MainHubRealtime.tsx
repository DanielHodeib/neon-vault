'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
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
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';
import { signOut } from 'next-auth/react';
import toast from 'react-hot-toast';

import BlackjackGame from '@/components/games/BlackjackGame';
import RouletteGame from '@/components/games/RouletteGame';
import SlotsGame from '@/components/games/SlotsGame';
import PokerGame from '@/components/games/PokerGame';
import PokerFriendsGame from '@/components/games/PokerFriendsGame';
import LeaderboardPanel from '@/components/LeaderboardPanel';
import QuestsPanel from '@/components/QuestsPanel';
import { copyToClipboard } from '@/lib/copyToClipboard';
import { formatMoney } from '@/lib/formatMoney';
import { canUseRankTag, getRankColor, RANKS, type RankTag } from '@/lib/ranks';
import { useCasinoStore } from '../../store/useCasinoStore';

type Tab = 'crash' | 'slots' | 'blackjack' | 'roulette' | 'poker' | 'friends' | 'leaderboard' | 'quests' | 'settings';
type PokerMode = 'solo' | 'friends';
type SettingsSection = 'overview' | 'appearance' | 'gameplay' | 'privacy' | 'security';

interface ChatMessage {
  id: string;
  username: string;
  text: string;
  createdAt: number;
  rankTag?: string;
  rankColor?: string;
  system?: boolean;
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
}

type ThemeOption = 'slate' | 'steel' | 'sunset' | 'ocean' | 'matrix';

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

export default function MainHubRealtime({ initialUsername }: { initialUsername?: string }) {
  const {
    balance,
    username,
    xp,
    daily,
    fetchInitialBalance,
    hydrateFromSession,
    syncBalanceFromServer,
    placeBet,
    addWin,
    persistWalletAction,
  } = useCasinoStore();

  const [activeTab, setActiveTab] = useState<Tab>('crash');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);

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
  const socketRef = useRef<Socket | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const incomingSeenRef = useRef<Set<string>>(new Set());
  const settingsHydratedRef = useRef(false);
  const hasBetRef = useRef(false);
  const autoCashOutEnabledRef = useRef(false);
  const autoCashOutRef = useRef(2);
  const onlineUsersSet = useMemo(() => new Set(onlineUsers), [onlineUsers]);
  const effectiveUsername = useMemo(() => {
    const trimmedStore = (username ?? '').trim();
    if (trimmedStore && trimmedStore !== 'Guest') {
      return trimmedStore;
    }

    const trimmedInitial = (initialUsername ?? '').trim();
    return trimmedInitial || 'Guest';
  }, [username, initialUsername]);

  const level = useMemo(() => Math.floor(xp / 1000) + 1, [xp]);
  const levelBaseXp = useMemo(() => (level - 1) * 1000, [level]);
  const nextLevelXp = useMemo(() => level * 1000, [level]);
  const levelProgress = useMemo(() => Math.min(100, Math.round(((xp - levelBaseXp) / 1000) * 100)), [xp, levelBaseXp]);
  const autoCashOutValue = useMemo(() => {
    const parsed = Number(autoCashOutInput);
    if (!Number.isFinite(parsed)) {
      return 1;
    }
    return Math.max(1, parsed);
  }, [autoCashOutInput]);
  const crashActiveBetAmount = useMemo(() => {
    const active = crashState.players.find((player) => player.username === effectiveUsername && !player.cashedOut);
    return active?.amount ?? 0;
  }, [crashState.players, effectiveUsername]);

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
    const socketUrl = getSocketUrl();
    const socket: Socket = io(socketUrl, {
      path: '/socket.io',
      query: { 
        username: effectiveUsername, 
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

      addWin(payload.payout);
      setHasBet(false);
      setPayoutToast({
        label: payload.mode === 'auto' ? 'Auto Cashout' : 'Manual Cashout',
        text: `${payload.multiplier.toFixed(2)}x · +${payload.payout.toFixed(2)} NVC`,
        tone: payload.mode,
      });
    };

    socket.on('connect', () => setSocketConnected(true));
    socket.on('disconnect', () => setSocketConnected(false));
    socket.on('disconnect', () => setIsPlacingCrashBet(false));

    socket.on('online_users', (users: string[]) => setOnlineUsers(users));
    socket.on('chat_history', (history: ChatMessage[]) => setChatMessages(history));
    socket.on('chat_message', (message: ChatMessage) => {
      setChatMessages((prev) => [...prev, message].slice(-60));
    });

    socket.on('crash_room_joined', (payload: { ok: boolean; roomId?: string }) => {
      if (!payload.ok || !payload.roomId) {
        return;
      }

      setCrashRoomId(payload.roomId);
      setCrashRoomInput(payload.roomId);
      setJoiningCrashRoom(false);
    });

    socket.on('crash_room_members', (payload: { roomId: string; members: string[] }) => {
      setCrashRoomMembers(payload.members ?? []);
    });

    socket.on('crash_state', (state: CrashState) => {
      setCrashState(state);
      const activeBet = (state.players ?? []).some((player) => player.username === effectiveUsername && !player.cashedOut);
      setHasBet(activeBet);
    });

    socket.on('crash_tick', ({ multiplier, players }: { multiplier: number; players: CrashPlayer[] }) => {
      setCrashState((prev) => ({ ...prev, multiplier, players, phase: 'running' }));
      const activeBet = (players ?? []).some((player) => player.username === effectiveUsername && !player.cashedOut);
      setHasBet(activeBet);

      if (autoCashOutEnabledRef.current && hasBetRef.current && multiplier >= autoCashOutRef.current) {
        socket.emit('crash_cashout', {});
      }
    });

    socket.on('crash_players', (players: CrashPlayer[]) => {
      setCrashState((prev) => ({ ...prev, players }));
      const activeBet = (players ?? []).some((player) => player.username === effectiveUsername && !player.cashedOut);
      setHasBet(activeBet);
    });

    socket.on(
      'crash_crashed',
      ({ crashPoint, history, players }: { crashPoint: number; history: number[]; players: CrashPlayer[] }) => {
        setCrashState((prev) => ({
          ...prev,
          phase: 'crashed',
          multiplier: crashPoint,
          crashPoint,
          history,
          players,
        }));
        const activeBet = (players ?? []).some((player) => player.username === effectiveUsername && !player.cashedOut);
        setHasBet(activeBet);
      }
    );

    socket.on('crash_cashout_result', cashoutHandler);

    return () => {
      socket.off('crash_cashout_result', cashoutHandler);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [addWin, persistWalletAction, effectiveUsername, xp]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      return;
    }

    socket.emit('profile_sync', {
      username: effectiveUsername,
      xp,
      balance,
      selectedRankTag,
    });
  }, [xp, balance, effectiveUsername, selectedRankTag, socketConnected]);

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
          body: JSON.stringify({ soundEnabled, theme, selectedRankTag, publicProfile, bio }),
        });

        const payload = (await response.json()) as { error?: string; settings?: SettingsPayload };
        setSettingsSaving(false);

        if (!response.ok) {
          setSettingsNotice(payload.error ?? 'Settings save failed.');
          return;
        }

        setSettingsNotice(silent ? 'Settings autosaved.' : 'Settings saved.');
      } catch (error) {
        console.error('Settings save error:', error);
        setSettingsSaving(false);
        setSettingsNotice('Settings save failed.');
      }
    },
    [soundEnabled, theme, selectedRankTag, publicProfile, bio]
  );

  useEffect(() => {
    if (!settingsHydratedRef.current) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void persistSettings(true);
    }, 850);

    return () => window.clearTimeout(timeout);
  }, [soundEnabled, theme, selectedRankTag, publicProfile, bio, persistSettings]);

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
    if (isPlacingCrashBet) {
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

    if (crashState.phase !== 'waiting') {
      setErrorMsg('Round already started. Wait for next round.');
      return;
    }

    setIsPlacingCrashBet(true);

    if (!placeBet(amount)) {
      setIsPlacingCrashBet(false);
      setErrorMsg('Not enough funds');
      return;
    }

    let ackReceived = false;
    const ackTimeout = window.setTimeout(() => {
      if (ackReceived) {
        return;
      }

      addWin(amount);
      setIsPlacingCrashBet(false);
      setErrorMsg('Bet request timed out. Your amount was refunded.');
    }, 2200);

    socket.emit('crash_place_bet', { amount, autoCashOut: autoCashOutEnabled ? autoCashOutValue : 0 }, (response: { ok: boolean; error?: string }) => {
      ackReceived = true;
      window.clearTimeout(ackTimeout);

      if (!response.ok) {
        addWin(amount);
        setIsPlacingCrashBet(false);
        setErrorMsg(response.error ?? 'Unable to place bet.');
        return;
      }

      setHasBet(true);
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

  const submitChat = (event: FormEvent<HTMLFormElement>) => {
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
  };

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

    const payload = (await response.json()) as { error?: string };
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
  };

  const handleViewProfile = async (targetUsername: string) => {
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
  };

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
      <aside className={`hub-sidebar ${sidebarCollapsed ? 'w-20' : 'w-64'} bg-slate-900 border-r border-slate-800 flex flex-col z-20 transition-all duration-300`}>
        <div className={`h-16 flex items-center ${sidebarCollapsed ? 'px-3 justify-center' : 'px-6'} border-b border-slate-800`}>
          <button
            onClick={() => setSidebarCollapsed((current) => !current)}
            className={`w-8 h-8 bg-blue-600 rounded flex items-center justify-center ${sidebarCollapsed ? '' : 'mr-3'} hover:bg-blue-500 transition-colors`}
            aria-label="Toggle sidebar"
          >
            <Menu size={18} className="text-white" />
          </button>
          {!sidebarCollapsed ? <h1 className="text-lg font-bold text-white tracking-wide">NEON VAULT</h1> : null}
        </div>

        <nav className={`flex-1 ${sidebarCollapsed ? 'p-3' : 'p-4'} space-y-2 overflow-y-auto custom-scrollbar`}>
          <SidebarButton icon={<TrendingUp size={20} />} label="Crash" active={activeTab === 'crash'} onClick={() => setActiveTab('crash')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<Coins size={20} />} label="Slots" active={activeTab === 'slots'} onClick={() => setActiveTab('slots')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<Hand size={20} />} label="Blackjack" active={activeTab === 'blackjack'} onClick={() => setActiveTab('blackjack')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<CircleDashed size={20} />} label="Roulette" active={activeTab === 'roulette'} onClick={() => setActiveTab('roulette')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<Spade size={20} />} label="Poker" active={activeTab === 'poker'} onClick={() => setActiveTab('poker')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<Users size={20} />} label="Friends" active={activeTab === 'friends'} onClick={() => setActiveTab('friends')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<TrendingUp size={20} />} label="Leaderboard" active={activeTab === 'leaderboard'} onClick={() => setActiveTab('leaderboard')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<ShieldCheck size={20} />} label="Quests" active={activeTab === 'quests'} onClick={() => setActiveTab('quests')} collapsed={sidebarCollapsed} />
          <SidebarButton icon={<Settings size={20} />} label="Settings" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} collapsed={sidebarCollapsed} />
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

      <main className="hub-main flex-1 flex flex-col min-w-0">
        <header className="hub-header h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-8 z-10">
          <div className="flex items-center gap-2 text-slate-400">
            <ShieldCheck size={18} className="text-emerald-500" />
            <span className="text-sm font-medium">{socketConnected ? 'Realtime Connected' : 'Realtime Offline'}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-500">{effectiveUsername}</p>
              <p className="font-mono text-xs text-slate-400">Level {level} · XP {xp}</p>
              <p className="font-mono text-[10px] text-slate-500">
                {levelProgress}% to L{level + 1} ({nextLevelXp - xp} XP left)
              </p>
              <p className="font-mono text-[10px] uppercase text-cyan-400">Crash Room {crashRoomId}</p>
            </div>
            <div className="flex items-center gap-3 bg-slate-950 border border-slate-800 px-4 py-2 rounded-lg">
              <Wallet size={16} className="text-slate-400" />
              <span className="font-mono text-lg font-bold text-white">{formatMoney(balance)}</span>
              <span className="text-sm font-bold text-blue-500">NVC</span>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="h-10 px-3 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-semibold uppercase tracking-wide inline-flex items-center gap-1.5"
            >
              <LogOut size={14} /> Logout
            </button>
          </div>
        </header>

        <div className="flex-1 flex p-4 lg:p-6 gap-4 overflow-hidden">
          <div className="hub-panel flex-1 flex flex-col bg-slate-900 rounded-xl border border-slate-800 overflow-hidden shadow-xl">
            {activeTab === 'crash' && (
              <>
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
                        disabled={crashState.phase === 'running' || hasBet || isPlacingCrashBet}
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
                        disabled={crashState.phase === 'running' || hasBet || isPlacingCrashBet}
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
                        disabled={crashState.phase === 'running' || hasBet || isPlacingCrashBet}
                        className="h-8 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        2x
                      </button>
                      <button
                        onClick={() => setBetInput(String(Math.max(1, Math.floor(parseFloat(balance)))))}
                        disabled={crashState.phase === 'running' || hasBet || isPlacingCrashBet}
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
                        disabled={crashState.phase !== 'waiting' || isPlacingCrashBet}
                        className="w-full py-5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg uppercase transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isPlacingCrashBet ? 'Placing...' : crashState.phase === 'waiting' ? 'Place Bet' : 'Round Running'}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'blackjack' && <BlackjackGame username={effectiveUsername} />}
            {activeTab === 'roulette' && <RouletteGame />}
            {activeTab === 'slots' && <SlotsGame />}
            {activeTab === 'poker' && (
              <div className="h-full min-h-0 flex flex-col">
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

            {activeTab === 'friends' && (
              <div className="flex-1 p-6 overflow-y-auto">
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

                <div className="mt-5 grid gap-5 lg:grid-cols-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Friends</p>
                    <div className="space-y-2">
                      {friendsLoading ? <p className="text-sm text-slate-500">Loading...</p> : null}
                      {!friendsLoading && friendsAccepted.length === 0 ? (
                        <p className="text-sm text-slate-500">No accepted friends yet.</p>
                      ) : null}
                      {friendsAccepted.map((friend) => (
                        <div key={friend.friendshipId} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-slate-200">{friend.username}</span>
                            <span className={`text-xs uppercase tracking-wide ${onlineUsersSet.has(friend.username) ? 'text-emerald-400' : 'text-slate-500'}`}>
                              {showOnlinePresence ? (onlineUsersSet.has(friend.username) ? 'Online' : 'Offline') : 'Hidden'}
                            </span>
                          </div>
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => handleViewProfile(friend.username)}
                              className="h-8 px-3 rounded-md bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
                            >
                              View Profile
                            </button>
                            <button
                              onClick={() => handleRemoveFriendship(friend.friendshipId)}
                              className="h-8 px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                            >
                              Remove
                            </button>
                            <button
                              onClick={() => handleBlockUser(friend.userId)}
                              className="h-8 px-3 rounded-md bg-red-600 hover:bg-red-500 text-xs font-semibold text-white"
                            >
                              Block
                            </button>
                            <button
                              onClick={() => handleSendMoneyToFriend(friend.userId, friend.username)}
                              className="h-8 px-3 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                            >
                              Send NVC
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Incoming</p>
                    <div className="space-y-2">
                      {pendingIncoming.length === 0 ? (
                        <p className="text-sm text-slate-500">No incoming requests.</p>
                      ) : (
                        pendingIncoming.map((request) => (
                          <div key={request.friendshipId} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                            <p className="font-medium text-slate-200">{request.username}</p>
                            <div className="mt-2 flex gap-2">
                              <button
                                onClick={() => handleRespondFriendRequest(request.friendshipId, 'accept')}
                                className="h-8 px-3 rounded-md bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white"
                              >
                                Accept
                              </button>
                              <button
                                onClick={() => handleRespondFriendRequest(request.friendshipId, 'decline')}
                                className="h-8 px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                              >
                                Decline
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Outgoing</p>
                    <div className="space-y-2">
                      {pendingOutgoing.length === 0 ? (
                        <p className="text-sm text-slate-500">No pending requests.</p>
                      ) : (
                        pendingOutgoing.map((request) => (
                          <div key={request.friendshipId} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium text-slate-200">{request.username}</span>
                              <span className="text-xs uppercase tracking-wide text-amber-400">Pending</span>
                            </div>
                            <button
                              onClick={() => handleRemoveFriendship(request.friendshipId)}
                              className="mt-2 h-8 px-3 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200"
                            >
                              Cancel Request
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Blocked</p>
                  {blockedUsers.length === 0 ? (
                    <p className="text-sm text-slate-500">No blocked users.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {blockedUsers.map((blocked) => (
                        <div key={blocked.blockId} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 flex items-center justify-between">
                          <span className="font-medium text-slate-200">{blocked.username}</span>
                          <button
                            onClick={() => handleUnblockUser(blocked.blockId)}
                            className="h-7 px-2 rounded-md bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold uppercase text-slate-200"
                          >
                            Unblock
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">All Online Players</p>
                  {onlineUsers.length === 0 ? (
                    <p className="text-sm text-slate-500">No players online right now.</p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {onlineUsers.map((user, index) => (
                      <div key={`${user}-${index}`} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 flex items-center justify-between">
                        <span className="font-medium text-slate-200">{user}</span>
                        <span className="text-xs uppercase tracking-wide text-emerald-400">Online</span>
                      </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Friend Profile</p>
                    {profileLoading ? <span className="text-xs text-slate-500">Loading...</span> : null}
                  </div>

                  {!selectedProfile && !profileLoading ? (
                    <p className="mt-2 text-sm text-slate-500">Select a friend and click View Profile.</p>
                  ) : null}

                  {selectedProfile ? (
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-100">{selectedProfile.username}</p>
                        <span className="text-xs uppercase tracking-wide text-cyan-300">{selectedProfile.theme}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        Balance {selectedProfile.balance} NVC · XP {selectedProfile.xp} · Friends {selectedProfile.friendsCount}
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

            {activeTab === 'leaderboard' && <LeaderboardPanel />}

            {activeTab === 'quests' && <QuestsPanel />}

            {activeTab === 'settings' && (
              <div className="flex-1 p-6 overflow-y-auto">
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
                          <p className="font-semibold text-slate-100 mb-1">Chat Nametag</p>
                          <p className="text-xs text-slate-500 mb-3">Alle Ränge sind sichtbar, aber erst ab dem jeweiligen Level freischaltbar.</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {RANKS.map((rank) => {
                              const unlocked = canUseRankTag(level, balance, rank.tag);
                              const selected = selectedRankTag === rank.tag;
                              return (
                                <button
                                  key={rank.tag}
                                  onClick={() => {
                                    if (!unlocked) {
                                      const requirement = rank.minLevel <= 1
                                        ? `${rank.minBalance.toLocaleString()} NVC`
                                        : `Level ${rank.minLevel} und ${rank.minBalance.toLocaleString()} NVC`;
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
                                          ? `Locked ${rank.minBalance.toLocaleString()} NVC`
                                          : `Locked L${rank.minLevel} · ${rank.minBalance.toLocaleString()} NVC`}
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

          <div className="hub-chat w-80 bg-slate-900 rounded-xl border border-slate-800 flex flex-col overflow-hidden hidden lg:flex shadow-lg">
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
                {chatMessages.map((event) => {
                  const hue = Math.abs(event.username.charCodeAt(0) * 7) % 360;
                  const usernameColor = `hsl(${hue}, 70%, 55%)`;
                  const rankColor = event.rankColor || '#64748b';
                  return (
                    <motion.div
                      key={event.id}
                      initial={reducedMotion ? { opacity: 1 } : { opacity: 0, y: 10 }}
                      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                      exit={reducedMotion ? { opacity: 1 } : { opacity: 0 }}
                      className="p-3 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900 transition-all group"
                    >
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-sm" style={{ color: event.system ? '#f87171' : usernameColor }}>
                            {event.username}
                          </span>
                          {event.rankTag ? (
                            <span
                              className="px-1.5 py-0.5 rounded border text-[10px] font-black uppercase tracking-wide"
                              style={{ color: rankColor, borderColor: rankColor }}
                            >
                              {event.rankTag}
                            </span>
                          ) : null}
                        </div>
                        {showChatTimestamps ? (
                          <span className="text-[11px] text-slate-500 font-mono group-hover:text-slate-400 transition">
                            {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-slate-200 leading-snug break-words">{event.text}</p>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            <form onSubmit={submitChat} className="border-t border-slate-800 p-3 flex items-center gap-2 bg-slate-950 shrink-0">
              <input
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
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
      </main>
    </div>
  );
}

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
