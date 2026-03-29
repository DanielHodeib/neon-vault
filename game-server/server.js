const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 4001);
const CORS_ORIGIN = process.env.CORS_ORIGIN || process.env.CLIENT_ORIGIN || 'http://localhost:3000';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const VERCEL_FRONTEND_ORIGIN = typeof process.env.VERCEL_FRONTEND_ORIGIN === 'string' ? process.env.VERCEL_FRONTEND_ORIGIN.trim() : '';
const ROOM_PREFIX = 'crash:';
const POKER_ROOM_PREFIX = 'poker:';
const BLACKJACK_ROOM_PREFIX = 'blackjack:';
const ROULETTE_ROOM_PREFIX = 'roulette:';
const COINFLIP_ROOM_ID = 'coinflip:global';
const CRASH_ROUND_WAIT_MS = 4000;
const CRASH_ROUND_CRASHED_MS = 1500;
const CRASH_TICK_MS = 75;
const CRASH_BROADCAST_MS = 120;
const POKER_TURN_MS = 20000;
const GLOBAL_CRASH_ROOM_ID = 'global';
const POKER_ANTE = Math.max(1, Math.floor(Number(process.env.POKER_ANTE || 10)));
const POKER_SMALL_BLIND = 50;
const POKER_BIG_BLIND = 100;
const CHAT_ACTIVITY_WINDOW_MS = 10 * 60 * 1000;
const COINFLIP_HOUSE_FEE_RATE = 0.05;
const OWNER_USERNAMES = new Set(
  String(process.env.OWNER_USERNAMES || 'Daniel')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
);
const VALID_USER_ROLES = new Set(['OWNER', 'ADMIN', 'MODERATOR', 'SUPPORT', 'USER']);
const ROLE_RANK = {
  USER: 0,
  SUPPORT: 1,
  MODERATOR: 2,
  ADMIN: 3,
  OWNER: 4,
};
const ROULETTE_WHEEL_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const APP_INTERNAL_URL = (process.env.APP_INTERNAL_URL || CLIENT_ORIGIN || 'http://localhost:3000').replace(/\/$/, '');

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

const app = express();

const allowedOrigins = new Set([
  CORS_ORIGIN,
  CLIENT_ORIGIN,
  ...CLIENT_ORIGINS,
  ...(VERCEL_FRONTEND_ORIGIN ? [VERCEL_FRONTEND_ORIGIN] : []),
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]);

function isLanHost(hostname) {
  // Allow localhost, private IPs, and common tunnel domains.
  return /^(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|.*\.ngrok\.io|.*\.loca\.?lt|.*\.tunnel|.*\.localhost\.run|.*\.lhr\.life|.*\.life|.*\.ts\.net)/.test(hostname);
}

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.has(origin)) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    return isLanHost(parsed.hostname);
  } catch {
    return false;
  }
}

let isShuttingDown = false;

app.use(cors({
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  credentials: true,
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  path: '/socket.io',
  cors: {
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

const onlineUsers = new Map();
const userActivities = new Map();
const userActivityStartedAt = new Map();
const userGameDurations = new Map();
let chatHistory = [];
const crashRooms = new Map();
const pokerRooms = new Map();
const blackjackRooms = new Map();
const rouletteRooms = new Map();
const genericRooms = new Map();
const socketProfiles = new Map();
const chatActiveUsers = new Map();
const pokerBroadcastTimers = new Map();
let maintenanceTimer = null;
let systemMaintenanceState = {
  isMaintenanceMode: false,
  maintenanceEndTime: null,
};

const coinflipState = {
  openLobbies: [],
  status: 'waiting',
  lastResult: null,
};

let activeRain = null;
let rainResolveTimer = null;
let rainTickTimer = null;

const HIGH_ROLLER_THRESHOLD = 50000;
const RANK_RULES = [
  { tag: 'BALLER', color: '#fb923c', minLevel: 1, minBalance: 0 },
  { tag: 'BRONZE', color: '#d97706', minLevel: 1, minBalance: 0 },
  { tag: 'IRON', color: '#9ca3af', minLevel: 2, minBalance: 2500 },
  { tag: 'COPPER', color: '#b45309', minLevel: 3, minBalance: 5000 },
  { tag: 'STEEL', color: '#94a3b8', minLevel: 4, minBalance: 12000 },
  { tag: 'SILVER', color: '#cbd5e1', minLevel: 6, minBalance: 25000 },
  { tag: 'EMERALD', color: '#10b981', minLevel: 8, minBalance: 60000 },
  { tag: 'GOLD', color: '#fbbf24', minLevel: 10, minBalance: 100000 },
  { tag: 'PLATINUM', color: '#93c5fd', minLevel: 14, minBalance: 250000 },
  { tag: 'DIAMOND', color: '#60a5fa', minLevel: 18, minBalance: 500000 },
  { tag: 'RUBY', color: '#ef4444', minLevel: 20, minBalance: 750000 },
  { tag: 'MASTER', color: '#8b5cf6', minLevel: 22, minBalance: 1000000 },
  { tag: 'ELITE', color: '#ec4899', minLevel: 26, minBalance: 2500000 },
  { tag: 'HIGH_ROLLER', color: '#06b6d4', minLevel: 1, minBalance: 3500000 },
  { tag: 'TYCOON', color: '#22c55e', minLevel: 1, minBalance: 5000000 },
  { tag: 'CASINO_LORD', color: '#84cc16', minLevel: 1, minBalance: 7500000 },
  { tag: 'MILLIONAIRE', color: '#14b8a6', minLevel: 1, minBalance: 10000000 },
  { tag: 'MULTI_MILLIONAIRE', color: '#0ea5e9', minLevel: 1, minBalance: 25000000 },
  { tag: 'BILLIONAIRE', color: '#eab308', minLevel: 1, minBalance: 50000000 },
  { tag: 'CASINO_EMPEROR', color: '#f97316', minLevel: 1, minBalance: 100000000 },
  { tag: 'NEON_OVERLORD', color: '#22d3ee', minLevel: 1, minBalance: 150000000 },
];

function rankFromXp(rawXp, rawBalance = Number.MAX_SAFE_INTEGER) {
  const xp = Number.isFinite(Number(rawXp)) ? Math.max(0, Math.floor(Number(rawXp))) : 0;
  const balance = Number.isFinite(Number(rawBalance)) ? Math.max(0, Math.floor(Number(rawBalance))) : 0;
  const level = Math.floor(xp / 1000) + 1;
  const unlocked = [...RANK_RULES].reverse().find((rank) => level >= rank.minLevel && balance >= rank.minBalance) || RANK_RULES[0];
  return { xp, level, rankTag: unlocked.tag, rankColor: unlocked.color };
}

function rankFromSelection(level, balance, selectedRankTag) {
  const selected = typeof selectedRankTag === 'string' ? RANK_RULES.find((rule) => rule.tag === selectedRankTag) : null;
  if (selected && level >= selected.minLevel && balance >= selected.minBalance) {
    return { rankTag: selected.tag, rankColor: selected.color };
  }

  const fallback = [...RANK_RULES].reverse().find((rank) => level >= rank.minLevel && balance >= rank.minBalance) || RANK_RULES[0];
  return { rankTag: fallback.tag, rankColor: fallback.color };
}

function isTrustedOwnerUsername(username) {
  const normalized = typeof username === 'string' ? username.trim().toLowerCase() : '';
  return Boolean(normalized) && OWNER_USERNAMES.has(normalized);
}

function normalizeRole(rawRole, username = '') {
  if (isTrustedOwnerUsername(username)) {
    return 'OWNER';
  }

  const role = typeof rawRole === 'string' ? rawRole.trim().toUpperCase() : '';
  if (VALID_USER_ROLES.has(role)) {
    return role;
  }

  return 'USER';
}

function hasRoleAtLeast(candidateRole, minimumRole) {
  const normalizedCandidate = normalizeRole(candidateRole);
  const normalizedMinimum = normalizeRole(minimumRole);
  return (ROLE_RANK[normalizedCandidate] || 0) >= (ROLE_RANK[normalizedMinimum] || 0);
}

function checkPermission(socket, requiredRole, callback) {
  const profile = getSocketProfile(socket.id, onlineUsers.get(socket.id) || `Guest-${socket.id.slice(0, 6)}`);
  const actorRole = normalizeRole(profile.role, profile.username);

  if (hasRoleAtLeast(actorRole, requiredRole)) {
    return { ok: true, profile, role: actorRole };
  }

  callback?.({ ok: false, error: 'Insufficient permissions.' });
  return { ok: false, profile, role: actorRole };
}

function getInternalToken() {
  const token = typeof process.env.INTERNAL_API_TOKEN === 'string' ? process.env.INTERNAL_API_TOKEN.trim() : '';
  return token || null;
}

function isAuthorizedInternalRequest(req) {
  const expected = getInternalToken();
  if (!expected) {
    return true;
  }

  const provided = typeof req.get('x-internal-token') === 'string' ? req.get('x-internal-token').trim() : '';
  return provided.length > 0 && provided === expected;
}

function getInternalFetchHeaders() {
  const token = getInternalToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'x-internal-token': token } : {}),
  };
}

function normalizeMaintenancePayload(payload) {
  const enabled = Boolean(payload?.isMaintenanceMode);
  let endTime = null;

  if (enabled && payload?.maintenanceEndTime) {
    const parsed = new Date(payload.maintenanceEndTime);
    if (!Number.isNaN(parsed.getTime())) {
      endTime = parsed.toISOString();
    }
  }

  return {
    isMaintenanceMode: enabled,
    maintenanceEndTime: enabled ? endTime : null,
  };
}

function emitMaintenanceUpdate() {
  io.emit('system_maintenance_update', {
    isMaintenanceMode: Boolean(systemMaintenanceState.isMaintenanceMode),
    maintenanceEndTime: systemMaintenanceState.maintenanceEndTime,
  });
}

async function syncMaintenanceToApp() {
  await fetch(`${APP_INTERNAL_URL}/api/internal/system/maintenance`, {
    method: 'POST',
    headers: getInternalFetchHeaders(),
    cache: 'no-store',
    body: JSON.stringify({
      isMaintenanceMode: Boolean(systemMaintenanceState.isMaintenanceMode),
      maintenanceEndTime: systemMaintenanceState.maintenanceEndTime,
    }),
  }).catch(() => null);
}

function applyMaintenanceState(nextState, options = { emit: true }) {
  systemMaintenanceState = {
    isMaintenanceMode: Boolean(nextState.isMaintenanceMode),
    maintenanceEndTime: nextState.maintenanceEndTime ?? null,
  };

  if (options.emit) {
    emitMaintenanceUpdate();
  }
}

async function loadMaintenanceStateFromApp() {
  const response = await fetch(`${APP_INTERNAL_URL}/api/internal/system/maintenance`, {
    method: 'GET',
    headers: getInternalFetchHeaders(),
    cache: 'no-store',
  }).catch(() => null);

  if (!response?.ok) {
    return;
  }

  const payload = await response.json().catch(() => ({}));
  const normalized = normalizeMaintenancePayload(payload?.settings ?? payload);
  applyMaintenanceState(normalized, { emit: false });
}

function startMaintenanceTimer() {
  if (maintenanceTimer) {
    clearInterval(maintenanceTimer);
  }

  maintenanceTimer = setInterval(async () => {
    if (!systemMaintenanceState.isMaintenanceMode || !systemMaintenanceState.maintenanceEndTime) {
      return;
    }

    const end = new Date(systemMaintenanceState.maintenanceEndTime);
    if (Number.isNaN(end.getTime()) || end.getTime() > Date.now()) {
      return;
    }

    applyMaintenanceState(
      {
        isMaintenanceMode: false,
        maintenanceEndTime: null,
      },
      { emit: true }
    );
    await syncMaintenanceToApp();
  }, 60000);
}

async function callFriendsSocketApi(action, payload) {
  const token = getInternalToken();

  try {
    const response = await fetch(`${APP_INTERNAL_URL}/api/internal/friends/socket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-internal-token': token } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: typeof data?.error === 'string' ? data.error : 'Social API request failed.',
      };
    }

    return {
      ok: true,
      ...data,
    };
  } catch {
    return { ok: false, error: 'Social API unreachable.' };
  }
}

async function callSupportSocketApi(action, payload) {
  const token = getInternalToken();

  try {
    const response = await fetch(`${APP_INTERNAL_URL}/api/internal/support/socket`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'x-internal-token': token } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: typeof data?.error === 'string' ? data.error : 'Support API request failed.',
      };
    }

    return {
      ok: true,
      ...data,
    };
  } catch {
    return { ok: false, error: 'Support API unreachable.' };
  }
}

async function callNotificationApi(action, payload) {
  try {
    const response = await fetch(`${APP_INTERNAL_URL}/api/internal/notifications`, {
      method: 'POST',
      headers: getInternalFetchHeaders(),
      body: JSON.stringify({ action, ...payload }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        error: typeof data?.error === 'string' ? data.error : 'Notification API request failed.',
      };
    }

    return {
      ok: true,
      ...data,
    };
  } catch {
    return { ok: false, error: 'Notification API unreachable.' };
  }
}

async function sendNotification(userId, type, title, message) {
  const safeUserId = typeof userId === 'string' ? userId.trim() : '';
  const safeTitle = typeof title === 'string' ? title.trim().slice(0, 120) : '';
  const safeMessage = typeof message === 'string' ? message.trim().slice(0, 400) : '';

  if (!safeUserId || !safeTitle || !safeMessage) {
    return { ok: false, error: 'userId, title and message are required.' };
  }

  const created = await callNotificationApi('create', {
    userId: safeUserId,
    type,
    title: safeTitle,
    message: safeMessage,
  });

  if (!created.ok || !created.notification) {
    return { ok: false, error: created.error || 'Failed to store notification.' };
  }

  const receiverSocketIds = getSocketIdsByUserId(safeUserId);
  receiverSocketIds.forEach((receiverSocketId) => {
    io.to(receiverSocketId).emit('new_notification', created.notification);
  });

  return {
    ok: true,
    notification: created.notification,
    delivered: receiverSocketIds.length,
  };
}

function normalizeClanTag(rawClanTag) {
  if (typeof rawClanTag !== 'string') {
    return null;
  }

  const clanTag = rawClanTag.trim().toUpperCase();
  return clanTag ? clanTag.slice(0, 5) : null;
}

function upsertSocketProfile(
  socketId,
  username,
  rawXp,
  selectedRankTag,
  rawBalance = Number.MAX_SAFE_INTEGER,
  rawRole = 'USER',
  rawClanTag = null,
  rawIsKing = false,
  rawUserId = null,
  rawIsBanned = false
) {
  const rank = rankFromXp(rawXp, rawBalance);
  const balance = Number.isFinite(Number(rawBalance)) ? Math.max(0, Math.floor(Number(rawBalance))) : 0;
  const displayed = rankFromSelection(rank.level, balance, selectedRankTag);
  const profile = {
    userId: typeof rawUserId === 'string' && rawUserId.trim() ? rawUserId.trim() : null,
    username,
    role: normalizeRole(rawRole, username),
    clanTag: normalizeClanTag(rawClanTag),
    balance,
    isKing: Boolean(rawIsKing),
    isBanned: Boolean(rawIsBanned),
    xp: rank.xp,
    level: rank.level,
    rankTag: displayed.rankTag,
    rankColor: displayed.rankColor,
  };

  socketProfiles.set(socketId, profile);
  return profile;
}

function getSocketProfile(socketId, usernameFallback) {
  const existing = socketProfiles.get(socketId);
  if (existing) {
    return existing;
  }

  return upsertSocketProfile(socketId, usernameFallback, 0, undefined, Number.MAX_SAFE_INTEGER, 'USER', null, false, null, false);
}

function shuffleArray(values) {
  const next = [...values];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function distributeAmount(total, recipients) {
  const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
  const safeRecipients = Math.max(0, Math.floor(Number(recipients) || 0));
  if (safeTotal <= 0 || safeRecipients <= 0) {
    return [];
  }

  if (safeRecipients === 1) {
    return [safeTotal];
  }

  const cuts = new Set();
  while (cuts.size < safeRecipients - 1) {
    cuts.add(Math.floor(Math.random() * safeTotal));
  }

  const sortedCuts = [0, ...Array.from(cuts).sort((a, b) => a - b), safeTotal];
  const shares = [];

  for (let i = 1; i < sortedCuts.length; i += 1) {
    shares.push(sortedCuts[i] - sortedCuts[i - 1]);
  }

  return shuffleArray(shares);
}

function emitSystemMessage(text) {
  const message = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    username: 'SYSTEM',
    sender: 'SYSTEM',
    text,
    timestamp: new Date().toISOString(),
    createdAt: Date.now(),
    role: 'ADMIN',
    userId: null,
    isBanned: false,
    user: { id: null, isBanned: false },
    system: true,
  };

  chatHistory = [...chatHistory, message].slice(-80);
  io.emit('chat_message', message);
}

function coinflipPublicState() {
  const openLobbies = Array.isArray(coinflipState.openLobbies) ? coinflipState.openLobbies : [];
  return {
    openLobbies,
    openLobby: openLobbies[0] ?? null,
    status: coinflipState.status,
    lastResult: coinflipState.lastResult,
  };
}

function emitCoinflipState() {
  io.to(COINFLIP_ROOM_ID).emit('coinflip_state', coinflipPublicState());
}

function getRecentRainCandidates(limit) {
  const threshold = Date.now() - CHAT_ACTIVITY_WINDOW_MS;
  const candidates = [];

  chatActiveUsers.forEach((lastAt, candidateUsername) => {
    if (lastAt < threshold) {
      return;
    }
    if (String(candidateUsername).startsWith('Guest-')) {
      return;
    }
    candidates.push(candidateUsername);
  });

  return shuffleArray(candidates).slice(0, Math.max(1, Math.floor(limit)));
}

function stopRainTimers() {
  if (rainResolveTimer) {
    clearTimeout(rainResolveTimer);
    rainResolveTimer = null;
  }

  if (rainTickTimer) {
    clearInterval(rainTickTimer);
    rainTickTimer = null;
  }
}

function finishRain() {
  if (!activeRain) {
    return;
  }

  const rain = activeRain;
  const winners = getRecentRainCandidates(rain.participantsCount);
  const shares = distributeAmount(rain.amount, winners.length);
  const payouts = winners.map((winnerUsername, index) => ({
    username: winnerUsername,
    amount: shares[index] ?? 0,
  })).filter((entry) => entry.amount > 0);

  payouts.forEach((entry) => {
    const socketIds = getSocketIdsByUsername(entry.username);
    socketIds.forEach((socketId) => {
      io.to(socketId).emit('rain_reward', {
        rainId: rain.id,
        amount: entry.amount,
        username: entry.username,
      });
    });
  });

  io.emit('rain_ended', {
    rainId: rain.id,
    winners: payouts,
    totalWinners: payouts.length,
    endedAt: Date.now(),
  });

  if (payouts.length > 0) {
    const winnersLabel = payouts
      .map((entry) => `${entry.username} (+${entry.amount})`)
      .join(', ');
    emitSystemMessage(`🌧️ RAIN ENDED: ${winnersLabel}`);
  } else {
    emitSystemMessage('🌧️ RAIN ENDED: Keine aktiven Chat-Teilnehmer in den letzten 10 Minuten.');
  }

  activeRain = null;
  stopRainTimers();
}

function startRain(amount, duration, participantsCount, startedBy = 'SYSTEM') {
  const safeAmount = Math.max(1, Math.floor(Number(amount) || 0));
  const safeDuration = Math.max(5, Math.floor(Number(duration) || 0));
  const safeParticipants = Math.max(1, Math.floor(Number(participantsCount) || 0));

  if (activeRain) {
    return { ok: false, error: 'Rain already active.' };
  }

  const now = Date.now();
  activeRain = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    amount: safeAmount,
    duration: safeDuration,
    participantsCount: safeParticipants,
    startedBy,
    startedAt: now,
    endsAt: now + safeDuration * 1000,
  };

  io.emit('rain_started', {
    rainId: activeRain.id,
    amount: activeRain.amount,
    duration: activeRain.duration,
    participantsCount: activeRain.participantsCount,
    endsAt: activeRain.endsAt,
    startedBy: activeRain.startedBy,
  });

  emitSystemMessage(`🌧️ RAIN ACTIVE: ${activeRain.amount} NVC in ${activeRain.duration}s für ${activeRain.participantsCount} Spieler!`);

  rainTickTimer = setInterval(() => {
    if (!activeRain) {
      return;
    }

    const remainingSeconds = Math.max(0, Math.ceil((activeRain.endsAt - Date.now()) / 1000));
    io.emit('rain_tick', {
      rainId: activeRain.id,
      amount: activeRain.amount,
      participantsCount: activeRain.participantsCount,
      remainingSeconds,
      endsAt: activeRain.endsAt,
    });
  }, 1000);

  rainResolveTimer = setTimeout(() => {
    finishRain();
  }, safeDuration * 1000);

  return { ok: true, rain: activeRain };
}

function shouldBroadcastSystemWin(amount = 0) {
  return amount >= HIGH_ROLLER_THRESHOLD;
}

function getHypeMessage(username, payout, source = '') {
  const game = typeof source === 'string' ? source.trim().toLowerCase() : '';
  const amountText = Math.floor(Number(payout) || 0);

  if (game === 'crash') {
    return `🚀 CRASH MOONSHOT! ${username} hat ${amountText} NVC aus dem Crash geholt!`;
  }

  if (game === 'slots') {
    return `🎰 SLOT EXPLOSION! ${username} hat ${amountText} NVC aus den Slots gesnackt!`;
  }

  if (game === 'roulette') {
    return `🎯 ROULETTE SNIPE! ${username} hat ${amountText} NVC am Roulette-Tisch getroffen!`;
  }

  if (game === 'blackjack') {
    return `🃏 BLACKJACK HEATER! ${username} hat ${amountText} NVC im Blackjack abgeräumt!`;
  }

  if (game === 'poker') {
    return `♠️ POKER CRUSH! ${username} hat ${amountText} NVC am Poker-Table gewonnen!`;
  }

  if (game === 'coinflip') {
    return `🪙 COINFLIP DUEL! ${username} hat ${amountText} NVC im 1v1 Coinflip gewonnen!`;
  }

  return `🏆 HIGH ROLLER! ${username} hat ${amountText} NVC gewonnen!`;
}

function emitSystemBigWin(username, amount, source = '') {
  const numericAmount = Number.isFinite(Number(amount)) ? Math.floor(Number(amount)) : 0;

  if (!shouldBroadcastSystemWin(numericAmount)) {
    return;
  }

  const hypeText = getHypeMessage(username, numericAmount, source);

  emitSystemMessage(hypeText);
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function generateCrashPoint() {
  const roll = Math.random();

  // Weighted server RNG targeting a more stable feel:
  // mostly low-mid rounds, some medium-high, and very rare moonshots.
  if (roll < 0.08) {
    return Number(randomRange(1.0, 1.15).toFixed(2));
  }

  if (roll < 0.72) {
    return Number(randomRange(1.16, 2.8).toFixed(2));
  }

  if (roll < 0.96) {
    return Number(randomRange(2.81, 6.0).toFixed(2));
  }

  return Number(randomRange(6.01, 18.0).toFixed(2));
}

function roomChannel(roomId) {
  return `${ROOM_PREFIX}${roomId}`;
}

function pokerChannel(roomId) {
  return `${POKER_ROOM_PREFIX}${roomId}`;
}

function blackjackChannel(roomId) {
  return `${BLACKJACK_ROOM_PREFIX}${roomId}`;
}

function rouletteChannel(roomId) {
  return `${ROULETTE_ROOM_PREFIX}${roomId}`;
}

function sanitizeGenericRoomId(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return raw || 'global';
}

function emitGenericRoomUpdate(roomId) {
  const room = genericRooms.get(roomId) || new Set();
  const members = Array.from(room).map((socketId) => onlineUsers.get(socketId) || `Guest-${socketId.slice(0, 6)}`);
  io.to(roomId).emit('room_update', {
    roomId,
    members,
  });
}

function createDeck() {
  const deck = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(`${rank}${suit}`);
    }
  }

  for (let i = deck.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

function sanitizeRoomId(value) {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return raw || 'global';
}

function normalizePokerUserKey(rawUserId, username) {
  const fromUserId = typeof rawUserId === 'string' ? rawUserId.trim() : '';
  if (fromUserId) {
    return fromUserId;
  }

  const fromName = typeof username === 'string' ? username.trim().toLowerCase() : '';
  return fromName || `guest-${Math.random().toString(36).slice(2, 8)}`;
}

function removePokerGhostUsers(currentSocket, pokerUserId) {
  pokerRooms.forEach((room) => {
    let changed = false;

    Array.from(room.players.entries()).forEach(([socketId, player]) => {
      if (socketId === currentSocket.id) {
        return;
      }

      if (String(player.userId || '') !== String(pokerUserId)) {
        return;
      }

      if (Number(player.buyIn || 0) > 0) {
        const profile = getSocketProfile(socketId, player.username);
        if (Number.isFinite(Number(profile.balance))) {
          profile.balance = Number(profile.balance) + Number(player.buyIn || 0);
          socketProfiles.set(socketId, profile);
        }
      }

      room.players.delete(socketId);
      room.sockets.delete(socketId);
      room.actedSocketIds.delete(socketId);
      changed = true;

      const ghostSocket = io.sockets.sockets.get(socketId);
      if (ghostSocket) {
        ghostSocket.leave(pokerChannel(room.id));
        ghostSocket.data.pokerRoomId = null;
      }
    });

    if (changed) {
      if (room.started) {
        maybeAdvancePokerStage(room);
      }
      broadcastPokerState(room.id);
    }
  });
}

function getCrashRoom(roomId) {
  const id = sanitizeRoomId(roomId);
  if (crashRooms.has(id)) {
    return crashRooms.get(id);
  }

  const room = {
    id,
    phase: 'waiting',
    multiplier: 1,
    crashPoint: generateCrashPoint(),
    roundId: 1,
    resolvingCrash: false,
    crashResetTimer: null,
    history: [],
    players: new Map(),
    sockets: new Set(),
    roundStartAt: 0,
    lastTickBroadcastAt: 0,
  };

  crashRooms.set(id, room);
  return room;
}

function getActiveCrashBetCount(room) {
  return Array.from(room.players.values()).filter(
    (player) => player.roundId === room.roundId && !player.cashedOut
  ).length;
}

function getPokerRoom(roomId) {
  const id = sanitizeRoomId(roomId);
  if (pokerRooms.has(id)) {
    return pokerRooms.get(id);
  }

  const room = {
    id,
    sockets: new Set(),
    players: new Map(),
    started: false,
    stage: 'waiting',
    deck: [],
    board: [],
    actedSocketIds: new Set(),
    pendingActionSocketIds: new Set(),
    pot: 0,
    currentBet: 0,
    currentTableBet: 0,
    minRaise: 0,
    lastRaiseAmount: POKER_BIG_BLIND,
    turnOrder: [],
    dealerIndex: -1,
    smallBlind: POKER_SMALL_BLIND,
    bigBlind: POKER_BIG_BLIND,
    activePlayerIndex: -1,
    activePlayerSocketId: null,
    currentTurnUserId: null,
    turnDeadlineAt: 0,
    turnTimer: null,
    winnerSocketId: null,
    winnerLabel: '',
  };

  pokerRooms.set(id, room);
  return room;
}

function getBlackjackRoom(roomId) {
  const id = sanitizeRoomId(roomId);
  if (blackjackRooms.has(id)) {
    return blackjackRooms.get(id);
  }

  const room = {
    id,
    sockets: new Set(),
    players: new Map(),
    deck: [],
    dealerHand: [],
    stage: 'waiting',
    message: 'Waiting for players',
    insuranceOpen: false,
    insuranceDeadlineAt: 0,
    lastRoundSummary: null,
  };

  blackjackRooms.set(id, room);
  return room;
}

function getRouletteRoom(roomId) {
  const id = sanitizeRoomId(roomId);
  if (rouletteRooms.has(id)) {
    return rouletteRooms.get(id);
  }

  const room = {
    id,
    sockets: new Set(),
  };

  rouletteRooms.set(id, room);
  return room;
}

function blackjackHandValue(cards) {
  let total = 0;
  let aces = 0;

  cards.forEach((card) => {
    const rank = card[0];
    if (rank === 'A') {
      total += 11;
      aces += 1;
      return;
    }

    if (['K', 'Q', 'J', 'T'].includes(rank)) {
      total += 10;
      return;
    }

    total += Number(rank);
  });

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function blackjackCardValueForSplit(card) {
  if (!card || typeof card !== 'string') {
    return 0;
  }

  const rank = card[0];
  if (rank === 'A') {
    return 11;
  }

  if (['K', 'Q', 'J', 'T'].includes(rank)) {
    return 10;
  }

  return Number(rank);
}

function createBlackjackHand(cards, bet, meta = {}) {
  const value = blackjackHandValue(cards);
  const naturalBlackjack = value === 21 && Array.isArray(cards) && cards.length === 2;

  return {
    cards,
    bet,
    doubled: Boolean(meta.doubled),
    stood: Boolean(meta.stood) || naturalBlackjack,
    busted: value > 21,
    resultText: typeof meta.resultText === 'string' ? meta.resultText : naturalBlackjack ? 'Blackjack' : '',
    payout: Number.isFinite(Number(meta.payout)) ? Number(meta.payout) : 0,
    blackjack: naturalBlackjack,
  };
}

function getBlackjackActiveHand(player) {
  const hands = Array.isArray(player?.hands) ? player.hands : [];
  const index = Number.isFinite(Number(player?.activeHandIndex)) ? Number(player.activeHandIndex) : 0;
  const safeIndex = Math.max(0, Math.min(index, Math.max(0, hands.length - 1)));
  return { hand: hands[safeIndex] || null, index: safeIndex, hands };
}

function isBlackjackHandDone(hand) {
  if (!hand) {
    return true;
  }

  return Boolean(hand.stood || hand.busted || hand.blackjack);
}

function isBlackjackPlayerDone(player) {
  const hands = Array.isArray(player?.hands) ? player.hands : [];
  if (hands.length === 0) {
    return true;
  }

  return hands.every((hand) => isBlackjackHandDone(hand));
}

function advanceBlackjackHand(player) {
  if (!player) {
    return;
  }

  const hands = Array.isArray(player.hands) ? player.hands : [];
  const currentIndex = Number.isFinite(Number(player.activeHandIndex)) ? Number(player.activeHandIndex) : 0;

  for (let index = currentIndex + 1; index < hands.length; index += 1) {
    if (!isBlackjackHandDone(hands[index])) {
      player.activeHandIndex = index;
      player.status = 'PLAYER_TURN';
      return;
    }
  }

  player.activeHandIndex = Math.max(0, hands.length - 1);
  player.status = 'WAITING';
}

function blackjackCanSplit(hand) {
  if (!hand || !Array.isArray(hand.cards) || hand.cards.length !== 2) {
    return false;
  }

  return blackjackCardValueForSplit(hand.cards[0]) === blackjackCardValueForSplit(hand.cards[1]);
}

function blackjackCanDouble(hand) {
  if (!hand || !Array.isArray(hand.cards)) {
    return false;
  }

  return hand.cards.length === 2 && !hand.doubled && !isBlackjackHandDone(hand);
}

function getBlackjackPlayerStatus(room, socketId) {
  const player = room.players.get(socketId);
  if (!player || Number(player.bet || 0) <= 0) {
    return 'WAITING';
  }

  if (room.stage !== 'playing') {
    return 'ROUND_OVER';
  }

  if (typeof player.status === 'string') {
    return player.status;
  }

  return isBlackjackPlayerDone(player) ? 'WAITING' : 'PLAYER_TURN';
}

function publicBlackjackState(room, targetSocketId) {
  const revealDealer = room.stage === 'result';
  const visibleDealerCards = room.dealerHand.map((card, index) => {
    if (!revealDealer && index === 1) {
      return '??';
    }
    return card;
  });

  return {
    roomId: room.id,
    stage: room.stage,
    status: getBlackjackPlayerStatus(room, targetSocketId),
    message: room.message,
    insuranceOpen: Boolean(room.insuranceOpen),
    insuranceDeadlineAt: Number(room.insuranceDeadlineAt || 0),
    roundSummary: room.lastRoundSummary,
    dealerCards: visibleDealerCards,
    dealerValue: revealDealer ? blackjackHandValue(room.dealerHand) : blackjackHandValue(room.dealerHand.slice(0, 1)),
    players: Array.from(room.players.values()).map((player) => ({
      socketId: player.socketId,
      userId: player.userId,
      username: player.username,
      hand: (() => {
        const active = getBlackjackActiveHand(player).hand;
        return active && Array.isArray(active.cards) ? active.cards : [];
      })(),
      value: (() => {
        const active = getBlackjackActiveHand(player).hand;
        return active && Array.isArray(active.cards) ? blackjackHandValue(active.cards) : 0;
      })(),
      stood: isBlackjackPlayerDone(player),
      busted: Array.isArray(player.hands) ? player.hands.every((hand) => Boolean(hand.busted)) : false,
      resultText: (() => {
        const active = getBlackjackActiveHand(player).hand;
        return active?.resultText || player.resultText || '';
      })(),
      totalBet: Number(player.bet || 0),
      insuranceBet: Number(player.insuranceBet || 0),
      activeHandIndex: Number(player.activeHandIndex || 0),
      hands: (Array.isArray(player.hands) ? player.hands : []).map((hand) => ({
        cards: hand.cards,
        value: blackjackHandValue(hand.cards),
        bet: Number(hand.bet || 0),
        stood: Boolean(hand.stood),
        busted: Boolean(hand.busted),
        doubled: Boolean(hand.doubled),
        blackjack: Boolean(hand.blackjack),
        resultText: hand.resultText || '',
        payout: Number(hand.payout || 0),
      })),
    })),
  };
}

function broadcastBlackjackState(roomId) {
  const room = getBlackjackRoom(roomId);
  room.sockets.forEach((socketId) => {
    io.to(socketId).emit('blackjack_state', publicBlackjackState(room, socketId));
  });
}

function resolveBlackjackRound(room) {
  room.insuranceOpen = false;
  room.insuranceDeadlineAt = 0;

  while (blackjackHandValue(room.dealerHand) < 17) {
    room.dealerHand.push(room.deck.pop());
  }

  const dealerValue = blackjackHandValue(room.dealerHand);
  const dealerBlackjack = dealerValue === 21 && room.dealerHand.length === 2;
  const roundWinners = [];

  room.players.forEach((player) => {
    const totalBet = Math.max(0, Math.floor(Number(player.bet) || 0));
    const hands = Array.isArray(player.hands) ? player.hands : [];

    if (!Number.isFinite(Number(totalBet)) || totalBet <= 0 || hands.length === 0) {
      player.resultText = '';
      player.status = 'WAITING';
      return;
    }

    let payout = 0;
    let summaryLabel = 'Lose';
    player.status = 'ROUND_OVER';

    hands.forEach((hand) => {
      const handValue = blackjackHandValue(hand.cards);
      const handBet = Math.max(0, Math.floor(Number(hand.bet) || 0));
      const handBlackjack = handValue === 21 && Array.isArray(hand.cards) && hand.cards.length === 2 && !hand.doubled;
      let handPayout = 0;

      if (handValue > 21) {
        hand.resultText = 'Bust';
      } else if (handBlackjack && !dealerBlackjack) {
        hand.resultText = 'Blackjack';
        handPayout = Number((handBet * 2.5).toFixed(2));
      } else if (dealerValue > 21 || handValue > dealerValue) {
        hand.resultText = 'Win';
        handPayout = Number((handBet * 2).toFixed(2));
      } else if (handValue === dealerValue) {
        hand.resultText = 'Push';
        handPayout = Number(handBet.toFixed(2));
      } else {
        hand.resultText = 'Lose';
      }

      hand.payout = handPayout;
      payout += handPayout;
    });

    const insuranceBet = Math.max(0, Math.floor(Number(player.insuranceBet || 0)));
    if (insuranceBet > 0 && dealerBlackjack) {
      payout += Number((insuranceBet * 3).toFixed(2));
    }

    const winningHands = hands.filter((hand) => Number(hand.payout || 0) > 0 && hand.resultText !== 'Push').length;
    const pushHands = hands.filter((hand) => hand.resultText === 'Push').length;
    if (winningHands > 0) {
      summaryLabel = hands.some((hand) => hand.resultText === 'Blackjack') ? 'Blackjack' : 'Win';
    } else if (pushHands > 0) {
      summaryLabel = 'Push';
    } else if (hands.some((hand) => hand.resultText === 'Bust')) {
      summaryLabel = 'Bust';
    }

    player.resultText = summaryLabel;

    if (payout > 0) {
      const profile = getSocketProfile(player.socketId, player.username);
      if (Number.isFinite(Number(profile.balance))) {
        profile.balance = Number(profile.balance) + payout;
        socketProfiles.set(player.socketId, profile);
      }

      io.to(player.socketId).emit('blackjack_payout', {
        ok: true,
        payout,
        balance: profile.balance,
        result: summaryLabel,
      });

      roundWinners.push({
        socketId: player.socketId,
        username: player.username,
        payout,
        result: summaryLabel,
      });

      emitSystemBigWin(player.username, payout, 'blackjack');
    }

    player.bet = 0;
    player.insuranceBet = 0;
    player.stood = true;
    player.busted = hands.every((hand) => Boolean(hand.busted));
  });

  room.stage = 'result';
  room.message = 'Round complete';
  room.lastRoundSummary = {
    dealerValue,
    dealerBlackjack,
    winners: roundWinners,
    at: Date.now(),
  };
  io.to(blackjackChannel(room.id)).emit('blackjack_round_result', {
    roomId: room.id,
    dealerValue,
    dealerBlackjack,
    winners: roundWinners,
    at: Date.now(),
  });
  broadcastBlackjackState(room.id);
}

function maybeResolveBlackjackRound(room) {
  const activePlayers = Array.from(room.players.values()).filter((player) => Number(player.bet || 0) > 0);
  if (activePlayers.length === 0) {
    return;
  }

  const done = activePlayers.every((player) => isBlackjackPlayerDone(player));
  if (!done) {
    return;
  }

  resolveBlackjackRound(room);
}

function startBlackjackRound(roomId) {
  const room = getBlackjackRoom(roomId);
  if (room.stage === 'playing') {
    return { ok: false, error: 'Round already in progress.' };
  }

  const seatedPlayers = Array.from(room.players.values()).filter((player) => Number(player.bet || 0) > 0);
  if (seatedPlayers.length === 0) {
    return { ok: false, error: 'No players in room.' };
  }

  room.deck = createDeck();
  room.dealerHand = [room.deck.pop(), room.deck.pop()];
  room.stage = 'playing';
  room.insuranceOpen = room.dealerHand[0]?.[0] === 'A';
  room.insuranceDeadlineAt = room.insuranceOpen ? Date.now() + 10000 : 0;
  room.lastRoundSummary = null;
  room.message = room.insuranceOpen ? 'Insurance available' : 'Players turn';

  room.players.forEach((player) => {
    if (Number(player.bet || 0) > 0) {
      const startingCards = [room.deck.pop(), room.deck.pop()];
      const hand = createBlackjackHand(startingCards, Number(player.bet || 0));
      player.hands = [hand];
      player.activeHandIndex = 0;
      player.stood = false;
      player.busted = Boolean(hand.busted);
      player.status = isBlackjackHandDone(hand) ? 'WAITING' : 'PLAYER_TURN';
      player.resultText = hand.resultText || '';
      player.hand = hand.cards;
      player.insuranceBet = 0;
      player.insuranceLocked = false;
    } else {
      player.hand = [];
      player.hands = [];
      player.activeHandIndex = 0;
      player.stood = false;
      player.busted = false;
      player.status = 'WAITING';
      player.resultText = '';
      player.insuranceBet = 0;
      player.insuranceLocked = false;
    }
  });

  broadcastBlackjackState(room.id);
  maybeResolveBlackjackRound(room);
  return { ok: true };
}

function applyBlackjackHit(room, socketId) {
  const player = room.players.get(socketId);

  if (!player) {
    return { ok: false, error: 'Not in blackjack room.' };
  }

  if (room.stage !== 'playing') {
    return { ok: false, error: 'No active round.' };
  }

  if (Number(player.bet || 0) <= 0) {
    return { ok: false, error: 'Place a bet first.' };
  }

  const { hand } = getBlackjackActiveHand(player);

  if (!hand || isBlackjackHandDone(hand)) {
    return { ok: false, error: 'Player already done.' };
  }

  const nextCard = room.deck.pop();
  if (!nextCard) {
    profile.balance = Number(profile.balance) + doubleCost;
    socketProfiles.set(player.socketId, profile);
    hand.bet = Number(hand.bet) - doubleCost;
    return { ok: false, error: 'Deck empty.' };
  }

  hand.cards.push(nextCard);
  hand.busted = blackjackHandValue(hand.cards) > 21;
  if (hand.busted) {
    hand.resultText = 'Bust';
  }

  player.insuranceLocked = true;
  if (hand.busted) {
    advanceBlackjackHand(player);
  } else {
    player.status = 'PLAYER_TURN';
  }

  player.hand = hand.cards;
  player.busted = Array.isArray(player.hands) ? player.hands.every((candidate) => Boolean(candidate.busted)) : hand.busted;
  player.stood = isBlackjackPlayerDone(player);
  player.resultText = hand.resultText || '';

  broadcastBlackjackState(room.id);
  maybeResolveBlackjackRound(room);
  return { ok: true };
}

function applyBlackjackStand(room, socketId) {
  const player = room.players.get(socketId);

  if (!player) {
    return { ok: false, error: 'Not in blackjack room.' };
  }

  if (room.stage !== 'playing') {
    return { ok: false, error: 'No active round.' };
  }

  if (Number(player.bet || 0) <= 0) {
    return { ok: false, error: 'Place a bet first.' };
  }

  const { hand } = getBlackjackActiveHand(player);

  if (!hand || isBlackjackHandDone(hand)) {
    return { ok: false, error: 'Player already done.' };
  }

  hand.stood = true;
  hand.resultText = hand.resultText || 'Stand';
  player.insuranceLocked = true;
  advanceBlackjackHand(player);
  player.hand = hand.cards;
  player.stood = isBlackjackPlayerDone(player);
  player.busted = Array.isArray(player.hands) ? player.hands.every((candidate) => Boolean(candidate.busted)) : false;
  player.resultText = hand.resultText || '';

  broadcastBlackjackState(room.id);
  maybeResolveBlackjackRound(room);
  return { ok: true };
}

function applyBlackjackDouble(room, socketId) {
  const player = room.players.get(socketId);

  if (!player) {
    return { ok: false, error: 'Not in blackjack room.' };
  }

  if (room.stage !== 'playing') {
    return { ok: false, error: 'No active round.' };
  }

  const { hand } = getBlackjackActiveHand(player);
  if (!hand) {
    return { ok: false, error: 'No active hand.' };
  }

  if (!blackjackCanDouble(hand)) {
    return { ok: false, error: 'Double not allowed now.' };
  }

  const profile = getSocketProfile(player.socketId, player.username);
  const doubleCost = Math.max(0, Math.floor(Number(hand.bet) || 0));
  if (!Number.isFinite(Number(profile.balance)) || Number(profile.balance) < doubleCost) {
    return { ok: false, error: 'Insufficient balance to double.' };
  }

  profile.balance = Number(profile.balance) - doubleCost;
  socketProfiles.set(player.socketId, profile);

  hand.bet = Number(hand.bet) + doubleCost;
  hand.doubled = true;

  const nextCard = room.deck.pop();
  if (!nextCard) {
    return { ok: false, error: 'Deck empty.' };
  }

  hand.cards.push(nextCard);
  hand.busted = blackjackHandValue(hand.cards) > 21;
  hand.stood = true;
  hand.resultText = hand.busted ? 'Bust' : 'Stand';

  player.bet = Number(player.bet || 0) + doubleCost;
  player.insuranceLocked = true;
  advanceBlackjackHand(player);
  player.hand = hand.cards;
  player.stood = isBlackjackPlayerDone(player);
  player.busted = Array.isArray(player.hands) ? player.hands.every((candidate) => Boolean(candidate.busted)) : hand.busted;
  player.resultText = hand.resultText;

  broadcastBlackjackState(room.id);
  maybeResolveBlackjackRound(room);
  return { ok: true };
}

function applyBlackjackSplit(room, socketId) {
  const player = room.players.get(socketId);

  if (!player) {
    return { ok: false, error: 'Not in blackjack room.' };
  }

  if (room.stage !== 'playing') {
    return { ok: false, error: 'No active round.' };
  }

  const { hand, index, hands } = getBlackjackActiveHand(player);
  if (!hand) {
    return { ok: false, error: 'No active hand.' };
  }

  if (!blackjackCanSplit(hand)) {
    return { ok: false, error: 'Split not allowed now.' };
  }

  const profile = getSocketProfile(player.socketId, player.username);
  const splitCost = Math.max(0, Math.floor(Number(hand.bet) || 0));
  if (!Number.isFinite(Number(profile.balance)) || Number(profile.balance) < splitCost) {
    return { ok: false, error: 'Insufficient balance to split.' };
  }

  profile.balance = Number(profile.balance) - splitCost;
  socketProfiles.set(player.socketId, profile);

  const [leftCard, rightCard] = hand.cards;
  const leftDraw = room.deck.pop();
  const rightDraw = room.deck.pop();
  if (!leftDraw || !rightDraw) {
    profile.balance = Number(profile.balance) + splitCost;
    socketProfiles.set(player.socketId, profile);
    return { ok: false, error: 'Deck empty.' };
  }

  const leftHand = createBlackjackHand([leftCard, leftDraw], hand.bet);
  const rightHand = createBlackjackHand([rightCard, rightDraw], hand.bet);
  hands.splice(index, 1, leftHand, rightHand);

  player.hands = hands;
  player.activeHandIndex = index;
  player.bet = Number(player.bet || 0) + splitCost;
  player.insuranceLocked = true;
  player.status = isBlackjackPlayerDone(player) ? 'WAITING' : 'PLAYER_TURN';
  player.hand = leftHand.cards;
  player.stood = isBlackjackPlayerDone(player);
  player.busted = hands.every((candidate) => Boolean(candidate.busted));
  player.resultText = leftHand.resultText || '';

  broadcastBlackjackState(room.id);
  maybeResolveBlackjackRound(room);
  return { ok: true };
}

function applyBlackjackInsurance(room, socketId) {
  const player = room.players.get(socketId);

  if (!player) {
    return { ok: false, error: 'Not in blackjack room.' };
  }

  if (room.stage !== 'playing' || !room.insuranceOpen) {
    return { ok: false, error: 'Insurance is not available.' };
  }

  if (player.insuranceLocked) {
    return { ok: false, error: 'Insurance window has closed.' };
  }

  if (Number(player.insuranceBet || 0) > 0) {
    return { ok: false, error: 'Insurance already placed.' };
  }

  const baseBet = Math.max(0, Math.floor(Number(player.bet) || 0));
  if (baseBet <= 0) {
    return { ok: false, error: 'Place a bet first.' };
  }

  const insuranceBet = Math.floor(baseBet / 2);
  if (insuranceBet <= 0) {
    return { ok: false, error: 'Insurance unavailable for current bet.' };
  }

  const profile = getSocketProfile(player.socketId, player.username);
  if (!Number.isFinite(Number(profile.balance)) || Number(profile.balance) < insuranceBet) {
    return { ok: false, error: 'Insufficient balance for insurance.' };
  }

  profile.balance = Number(profile.balance) - insuranceBet;
  socketProfiles.set(player.socketId, profile);
  player.insuranceBet = insuranceBet;

  broadcastBlackjackState(room.id);
  return { ok: true, insuranceBet };
}

function createPokerRoomForSocket(socket, username) {
  const roomId = `pk-${Math.random().toString(36).slice(2, 8)}`;
  const room = attachPokerSocket(socket, roomId, username);
  return room;
}

function removeDuplicateRouletteUsers(room, username, keepSocketId) {
  const normalized = String(username || '').trim().toLowerCase();
  if (!normalized) {
    return;
  }

  Array.from(room.sockets).forEach((socketId) => {
    if (socketId === keepSocketId) {
      return;
    }

    const memberName = String(onlineUsers.get(socketId) || '').trim().toLowerCase();
    if (memberName !== normalized) {
      return;
    }

    room.sockets.delete(socketId);
    const duplicateSocket = io.sockets.sockets.get(socketId);
    if (duplicateSocket) {
      duplicateSocket.leave(rouletteChannel(room.id));
      duplicateSocket.data.rouletteRoomId = null;
    }
  });
}

function publicCrashPlayers(room) {
  return Array.from(room.players.values()).map((player) => ({
    username: player.username,
    amount: player.amount,
    cashedOut: player.cashedOut,
    cashedAt: player.cashedAt,
  }));
}

function publicCrashRoomMembers(room) {
  return Array.from(room.sockets)
    .map((socketId) => onlineUsers.get(socketId) || `Guest-${socketId.slice(0, 6)}`)
    .sort((left, right) => left.localeCompare(right));
}

function publicRouletteRoomMembers(room) {
  return Array.from(room.sockets)
    .map((socketId) => ({
      id: socketId,
      username: onlineUsers.get(socketId) || `Guest-${socketId.slice(0, 6)}`,
    }))
    .sort((left, right) => left.username.localeCompare(right.username));
}

function broadcastOnlineUsers() {
  io.emit('online_users', Array.from(onlineUsers.values()));
}

function getSocketIdsByUsername(username) {
  const normalized = typeof username === 'string' ? username.trim().toLowerCase() : '';
  if (!normalized) {
    return [];
  }

  const socketIds = [];
  onlineUsers.forEach((onlineUsername, socketId) => {
    if (String(onlineUsername).trim().toLowerCase() === normalized) {
      socketIds.push(socketId);
    }
  });
  return socketIds;
}

function getSocketIdsByUserId(userId) {
  const normalized = typeof userId === 'string' ? userId.trim() : '';
  if (!normalized) {
    return [];
  }

  const socketIds = [];
  socketProfiles.forEach((profile, socketId) => {
    if (String(profile?.userId || '').trim() === normalized) {
      socketIds.push(socketId);
    }
  });
  return socketIds;
}

function setUserActivity(socketId, activity) {
  const nextActivity = typeof activity === 'string' && activity.trim() ? activity.trim() : 'Hub';
  const now = Date.now();
  const previousActivity = userActivities.get(socketId);
  const previousStartedAt = userActivityStartedAt.get(socketId);

  if (!previousActivity || !previousStartedAt) {
    userActivities.set(socketId, nextActivity);
    userActivityStartedAt.set(socketId, now);
    return;
  }

  if (previousActivity === nextActivity) {
    return;
  }

  const elapsedMs = Math.max(0, now - previousStartedAt);
  if (elapsedMs > 0) {
    const username = onlineUsers.get(socketId);
    if (username) {
      const normalizedUsername = String(username).trim();
      if (normalizedUsername) {
        const currentDurations = userGameDurations.get(normalizedUsername) || {};
        currentDurations[previousActivity] = (Number(currentDurations[previousActivity]) || 0) + elapsedMs;
        userGameDurations.set(normalizedUsername, currentDurations);
      }
    }
  }

  userActivities.set(socketId, nextActivity);
  userActivityStartedAt.set(socketId, now);
}

function getUserActivity(socketId) {
  return userActivities.get(socketId) || 'Hub';
}

function getFavoriteGameForUsername(username) {
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  if (!normalizedUsername) {
    return null;
  }

  const durations = userGameDurations.get(normalizedUsername);
  if (!durations) {
    return null;
  }

  let favorite = null;
  let maxMs = 0;

  Object.entries(durations).forEach(([game, totalMs]) => {
    const safeMs = Number.isFinite(Number(totalMs)) ? Number(totalMs) : 0;
    if (safeMs > maxMs) {
      maxMs = safeMs;
      favorite = game;
    }
  });

  if (!favorite) {
    return null;
  }

  return {
    game: favorite,
    totalMs: Math.round(maxMs),
  };
}

app.get('/presence', (_req, res) => {
  const uniqueUsers = new Map();

  onlineUsers.forEach((username, socketId) => {
    uniqueUsers.set(username, {
      username,
      activity: getUserActivity(socketId),
      online: true,
    });
  });

  res.json({
    onlineCount: uniqueUsers.size,
    users: Array.from(uniqueUsers.values()).sort((a, b) => a.username.localeCompare(b.username)),
  });
});

app.get('/favorite-game/:username', (req, res) => {
  const rawUsername = typeof req.params?.username === 'string' ? req.params.username : '';
  const username = decodeURIComponent(rawUsername).trim();

  if (!username) {
    return res.status(400).json({ error: 'Username required.' });
  }

  const favorite = getFavoriteGameForUsername(username);
  if (!favorite) {
    return res.json({ game: 'Unknown', totalMs: 0 });
  }

  return res.json({
    game: favorite.game,
    totalMs: favorite.totalMs,
  });
});

function broadcastCrashState(roomId) {
  const room = getCrashRoom(roomId);
  const payload = {
    roomId: room.id,
    roundId: room.roundId,
    phase: room.phase,
    multiplier: room.multiplier,
    crashPoint: room.phase === 'crashed' ? room.crashPoint : null,
    history: room.history,
    players: publicCrashPlayers(room),
    roundStartAt: room.roundStartAt,
  };
  io.to(roomChannel(room.id)).emit('crash_state', payload);
}

function broadcastCrashRoomMembers(roomId) {
  const room = getCrashRoom(roomId);
  const payload = {
    roomId: room.id,
    members: publicCrashRoomMembers(room),
  };
  io.to(roomChannel(room.id)).emit('crash_room_members', payload);
}

function emitToCrashRoom(roomId, event, payload) {
  const room = getCrashRoom(roomId);
  io.to(roomChannel(room.id)).emit(event, payload);
}

function isGlobalEventActive(type) {
  return Boolean(currentActiveEvent && currentActiveEvent.type === type);
}

function applyWinMultiplierBoost(basePayout) {
  const safePayout = Number.isFinite(Number(basePayout)) ? Number(basePayout) : 0;
  if (!isGlobalEventActive('MULTIPLIER-BOOST')) {
    return safePayout;
  }

  return Number((safePayout * 1.2).toFixed(2));
}

function applyCashbackForLoss(socketId, username, lostAmount, source) {
  const safeLoss = Number.isFinite(Number(lostAmount)) ? Number(lostAmount) : 0;
  if (!isGlobalEventActive('CASHBACK-MANIA') || safeLoss <= 0) {
    return 0;
  }

  const cashback = Number((safeLoss * 0.1).toFixed(2));
  if (cashback <= 0) {
    return 0;
  }

  const profile = getSocketProfile(socketId, username);
  if (Number.isFinite(Number(profile.balance))) {
    profile.balance = Number(profile.balance) + cashback;
    socketProfiles.set(socketId, profile);
  }

  io.to(socketId).emit('event_cashback_reward', {
    source,
    cashback,
    eventType: 'CASHBACK-MANIA',
  });

  return cashback;
}

function getNextActiveSeatIndex(room, fromIndex = -1) {
  if (!Array.isArray(room.turnOrder) || room.turnOrder.length === 0) {
    return -1;
  }

  for (let step = 1; step <= room.turnOrder.length; step += 1) {
    const index = (fromIndex + step + room.turnOrder.length) % room.turnOrder.length;
    const socketId = room.turnOrder[index];
    const player = room.players.get(socketId);
    if (!player || player.folded || !player.ready || player.hand.length === 0) {
      continue;
    }
    return index;
  }

  return -1;
}

function isPokerBettingRoundComplete(room) {
  const activePlayers = room.turnOrder
    .map((socketId) => room.players.get(socketId))
    .filter((player) => player && !player.folded && player.ready && player.hand.length > 0);

  if (activePlayers.length <= 1) {
    return true;
  }

  const targetBet = Number(room.currentTableBet || room.currentBet || 0);
  for (const player of activePlayers) {
    if (Number(player.buyIn || 0) <= 0) {
      continue;
    }

    if (Number(player.roundBet || 0) !== targetBet) {
      return false;
    }
  }

  return room.pendingActionSocketIds.size === 0;
}

function clearPokerTurnTimer(room) {
  if (room.turnTimer) {
    clearTimeout(room.turnTimer);
    room.turnTimer = null;
  }
  room.turnDeadlineAt = 0;
}

function getActivePokerPlayers(room) {
  return room.turnOrder
    .map((socketId) => room.players.get(socketId))
    .filter((player) => player && !player.folded && player.ready && player.hand.length > 0);
}

function getNextPokerTurnIndex(room, fromIndex = -1) {
  if (!Array.isArray(room.turnOrder) || room.turnOrder.length === 0) {
    return -1;
  }

  for (let step = 1; step <= room.turnOrder.length; step += 1) {
    const index = (fromIndex + step + room.turnOrder.length) % room.turnOrder.length;
    const socketId = room.turnOrder[index];
    const player = room.players.get(socketId);
    if (!player || player.folded || !player.ready || player.hand.length === 0) {
      continue;
    }

    if (!room.pendingActionSocketIds.has(socketId)) {
      continue;
    }

    return index;
  }

  return -1;
}

function assignPokerTurn(room, targetIndex = -1) {
  clearPokerTurnTimer(room);

  const nextIndex = targetIndex >= 0 ? targetIndex : getNextPokerTurnIndex(room, room.activePlayerIndex);
  if (nextIndex < 0) {
    room.activePlayerIndex = -1;
    room.activePlayerSocketId = null;
    room.currentTurnUserId = null;
    return;
  }

  room.activePlayerIndex = nextIndex;
  room.activePlayerSocketId = room.turnOrder[nextIndex] || null;
  room.currentTurnUserId = room.activePlayerSocketId
    ? room.players.get(room.activePlayerSocketId)?.userId ?? null
    : null;
  room.turnDeadlineAt = Date.now() + POKER_TURN_MS;

  room.turnTimer = setTimeout(() => {
    const activeSocketId = room.activePlayerSocketId;
    if (!activeSocketId) {
      return;
    }

    const activePlayer = room.players.get(activeSocketId);
    if (!activePlayer || activePlayer.folded || !room.pendingActionSocketIds.has(activeSocketId)) {
      return;
    }

    activePlayer.folded = true;
    activePlayer.actionText = 'folded (timeout)';
    room.pendingActionSocketIds.delete(activeSocketId);
    room.actedSocketIds.add(activeSocketId);

    const alive = getActivePokerPlayers(room);
    if (alive.length <= 1) {
      completePokerShowdown(room);
      return;
    }

    if (room.pendingActionSocketIds.size === 0) {
      maybeAdvancePokerStage(room);
      return;
    }

    assignPokerTurn(room);
    broadcastPokerState(room.id);
  }, POKER_TURN_MS);
}

function resetPokerBettingRound(room, stageName) {
  room.stage = stageName;
  room.currentBet = 0;
  room.currentTableBet = 0;
  room.minRaise = Math.max(room.bigBlind || POKER_BIG_BLIND, 1);
  room.lastRaiseAmount = room.minRaise;
  room.pendingActionSocketIds = new Set();
  room.actedSocketIds = new Set();

  room.players.forEach((player, socketId) => {
    if (player.folded || !player.ready || player.hand.length === 0) {
      player.roundBet = 0;
      return;
    }

    player.roundBet = 0;
    player.actionText = 'in hand';
    room.pendingActionSocketIds.add(socketId);
  });

  if (room.pendingActionSocketIds.size === 0) {
    room.activePlayerIndex = -1;
    room.activePlayerSocketId = null;
    room.currentTurnUserId = null;
    clearPokerTurnTimer(room);
    return;
  }

  const firstIndex = getNextActiveSeatIndex(room, room.dealerIndex);
  assignPokerTurn(room, firstIndex);
}

function publicPokerState(room, targetSocketId = null) {
  const revealAll = room.stage === 'showdown';
  const players = Array.from(room.players.values()).map((player) => ({
    socketId: player.socketId,
    userId: player.userId,
    username: player.username,
    ready: player.ready,
    seated: Boolean(player.seated),
    buyIn: Number(player.buyIn || 0),
    folded: player.folded,
    roundBet: Number(player.roundBet || 0),
    hand:
      revealAll || player.socketId === targetSocketId
        ? player.hand
        : (player.hand.length > 0 ? player.hand : ['??', '??']).map(() => ({ hidden: true })),
    actionText: player.actionText,
    isWinner: player.socketId === room.winnerSocketId,
  }));

  return {
    roomId: room.id,
    started: room.started,
    stage: room.stage,
    board: room.board,
    pot: Number(room.pot || 0),
    currentBet: Number(room.currentBet || 0),
    currentTableBet: Number(room.currentTableBet || room.currentBet || 0),
    dealerIndex: Number(room.dealerIndex || 0),
    smallBlind: Number(room.smallBlind || POKER_SMALL_BLIND),
    bigBlind: Number(room.bigBlind || POKER_BIG_BLIND),
    currentTurnUserId: room.currentTurnUserId,
    minRaise: Number(room.minRaise || 0),
    activePlayerSocketId: room.activePlayerSocketId,
    turnDeadlineAt: Number(room.turnDeadlineAt || 0),
    players,
    winnerLabel: room.winnerLabel,
  };
}

function broadcastPokerState(roomId) {
  const room = getPokerRoom(roomId);
  if (pokerBroadcastTimers.has(room.id)) {
    return;
  }

  const timer = setTimeout(() => {
    pokerBroadcastTimers.delete(room.id);
    const liveRoom = getPokerRoom(room.id);
    liveRoom.sockets.forEach((socketId) => {
      io.to(socketId).emit('poker_state', publicPokerState(liveRoom, socketId));
    });
  }, 34);

  pokerBroadcastTimers.set(room.id, timer);
}

function resetPokerRound(room) {
  clearPokerTurnTimer(room);
  room.started = false;
  room.stage = 'waiting';
  room.deck = [];
  room.board = [];
  room.actedSocketIds = new Set();
  room.pendingActionSocketIds = new Set();
  room.pot = 0;
  room.currentBet = 0;
  room.currentTableBet = 0;
  room.minRaise = 0;
  room.lastRaiseAmount = room.bigBlind || POKER_BIG_BLIND;
  room.activePlayerIndex = -1;
  room.activePlayerSocketId = null;
  room.currentTurnUserId = null;
  room.winnerSocketId = null;
  room.winnerLabel = '';
  room.players.forEach((player) => {
    player.ready = Boolean(player.seated && Number(player.buyIn || 0) > 0);
    player.folded = !player.ready;
    player.roundBet = 0;
    player.hand = [];
    player.actionText = player.ready ? 'seated' : 'waiting buy-in';
  });
}

function resolvePokerWinner(room) {
  const contenders = Array.from(room.players.values()).filter((player) => !player.folded);
  if (contenders.length === 0) {
    room.winnerSocketId = null;
    room.winnerLabel = 'No winner';
    return;
  }

  const winner = contenders[Math.floor(Math.random() * contenders.length)];
  const pot = Number(room.pot || 0);
  if (pot > 0) {
    winner.buyIn = Number(winner.buyIn || 0) + pot;
  }
  room.winnerSocketId = winner.socketId;
  room.winnerLabel = pot > 0 ? `${winner.username} wins ${pot}` : `${winner.username} wins`;

  room.players.forEach((player) => {
    if (player.socketId === winner.socketId) {
      player.actionText = 'winner';
    } else if (player.folded) {
      player.actionText = 'folded';
    } else {
      player.actionText = 'lost';
    }
  });

  io.to(pokerChannel(room.id)).emit('poker_table_win', {
    roomId: room.id,
    username: winner.username,
  });
}

function schedulePokerReset(room, delayMs = 6000) {
  setTimeout(() => {
    resetPokerRound(room);
    broadcastPokerState(room.id);
  }, delayMs);
}

function completePokerShowdown(room) {
  if (!room.started || room.stage === 'showdown') {
    return;
  }

  clearPokerTurnTimer(room);
  room.pendingActionSocketIds = new Set();
  room.activePlayerIndex = -1;
  room.activePlayerSocketId = null;
  room.stage = 'showdown';
  resolvePokerWinner(room);
  broadcastPokerState(room.id);
  schedulePokerReset(room);
}

function maybeAdvancePokerStage(room) {
  if (!room.started || room.stage === 'waiting' || room.stage === 'showdown') {
    return;
  }

  const activePlayers = getActivePokerPlayers(room);
  if (activePlayers.length <= 1) {
    completePokerShowdown(room);
    return;
  }

  if (!isPokerBettingRoundComplete(room)) {
    return;
  }

  if (room.stage === 'dealing' || room.stage === 'preflop') {
    room.board = [room.deck.pop(), room.deck.pop(), room.deck.pop()];
    resetPokerBettingRound(room, 'flop');
  } else if (room.stage === 'flop') {
    room.board.push(room.deck.pop());
    resetPokerBettingRound(room, 'turn');
  } else if (room.stage === 'turn') {
    room.board.push(room.deck.pop());
    resetPokerBettingRound(room, 'river');
  } else {
    completePokerShowdown(room);
    return;
  }

  broadcastPokerState(room.id);
}

function startPokerRound(roomId) {
  const room = getPokerRoom(roomId);
  const minStackToPlay = Math.max(room.bigBlind || POKER_BIG_BLIND, 1);
  const seatedPlayers = Array.from(room.players.values()).filter((player) => Boolean(player.seated) && Number(player.buyIn || 0) >= minStackToPlay);
  if (seatedPlayers.length < 2) {
    return;
  }

  if (room.started) {
    return;
  }

  const deck = createDeck();
  clearPokerTurnTimer(room);
  room.started = true;
  room.stage = 'dealing';
  room.deck = deck;
  room.board = [];
  room.actedSocketIds = new Set();
  room.pendingActionSocketIds = new Set();
  room.pot = 0;
  room.currentBet = 0;
  room.currentTableBet = 0;
  room.minRaise = Math.max(room.bigBlind || POKER_BIG_BLIND, 1);
  room.lastRaiseAmount = room.minRaise;
  room.activePlayerIndex = -1;
  room.activePlayerSocketId = null;
  room.currentTurnUserId = null;
  room.winnerSocketId = null;
  room.winnerLabel = '';
  room.turnOrder = Array.from(room.players.keys());
  room.dealerIndex = getNextActiveSeatIndex(room, room.dealerIndex);

  room.players.forEach((player) => {
    const inHand = Boolean(player.seated) && Number(player.buyIn || 0) >= minStackToPlay;
    player.ready = inHand;
    player.folded = !inHand;
    if (inHand) {
      player.hand = [room.deck.pop(), room.deck.pop()];
      player.roundBet = 0;
      player.actionText = 'in hand';
    } else {
      player.hand = [];
      player.roundBet = 0;
      player.actionText = 'waiting buy-in';
    }
  });

  room.stage = 'preflop';
  room.pendingActionSocketIds = new Set();
  room.actedSocketIds = new Set();

  const smallBlindIndex = getNextActiveSeatIndex(room, room.dealerIndex);
  const bigBlindIndex = getNextActiveSeatIndex(room, smallBlindIndex);

  const postBlind = (seatIndex, blindAmount, blindLabel) => {
    if (seatIndex < 0) {
      return 0;
    }

    const socketId = room.turnOrder[seatIndex];
    const player = room.players.get(socketId);
    if (!player || player.folded || !player.ready || player.hand.length === 0) {
      return 0;
    }

    const contribution = Math.min(Number(player.buyIn || 0), blindAmount);
    player.buyIn = Number(player.buyIn || 0) - contribution;
    player.roundBet = contribution;
    player.actionText = `${blindLabel} ${contribution}`;
    room.pot += contribution;
    return contribution;
  };

  const sbPosted = postBlind(smallBlindIndex, room.smallBlind || POKER_SMALL_BLIND, 'SB');
  const bbPosted = postBlind(bigBlindIndex, room.bigBlind || POKER_BIG_BLIND, 'BB');
  const tableBet = Math.max(sbPosted, bbPosted);
  room.currentBet = tableBet;
  room.currentTableBet = tableBet;

  room.players.forEach((player, socketId) => {
    if (player.folded || !player.ready || player.hand.length === 0) {
      return;
    }

    const stack = Number(player.buyIn || 0);
    if (stack <= 0) {
      player.actionText = 'all-in';
      return;
    }

    if (player.roundBet < tableBet) {
      player.actionText = 'to call';
    }

    room.pendingActionSocketIds.add(socketId);
  });

  const openerIndex = getNextActiveSeatIndex(room, bigBlindIndex);
  assignPokerTurn(room, openerIndex);

  broadcastPokerState(room.id);
}

function startCrashRound(roomId) {
  const room = getCrashRoom(roomId);
  if (room.phase !== 'waiting') {
    return;
  }

  if (getActiveCrashBetCount(room) === 0) {
    room.roundStartAt = 0;
    return;
  }

  room.resolvingCrash = false;
  room.phase = 'running';
  room.multiplier = 1;
  room.crashPoint = generateCrashPoint();
  room.roundStartAt = 0;
  room.lastTickBroadcastAt = 0;

  emitToCrashRoom(room.id, 'crash_round_started', {
    roomId: room.id,
    crashPointHidden: true,
  });

  broadcastCrashState(room.id);
}

function crashRoundNow(roomId) {
  const room = getCrashRoom(roomId);
  if (room.resolvingCrash || room.phase !== 'running') {
    return;
  }

  room.resolvingCrash = true;
  room.phase = 'crashed';
  room.history = [room.crashPoint, ...room.history].slice(0, 16);

  const playersAtCrash = publicCrashPlayers(room);
    Array.from(room.players.values()).forEach((player) => {
      if (player.cashedOut || player.roundId !== room.roundId) {
        return;
      }
      applyCashbackForLoss(player.socketId, player.username, Number(player.amount || 0), 'crash');
    });

  emitToCrashRoom(room.id, 'crash_crashed', {
    roomId: room.id,
    roundId: room.roundId,
    crashPoint: room.crashPoint,
    history: room.history,
    players: playersAtCrash,
  });

  broadcastCrashState(room.id);

  if (room.crashResetTimer) {
    clearTimeout(room.crashResetTimer);
  }

  room.crashResetTimer = setTimeout(() => {
    room.players.clear();
    room.multiplier = 1;
    room.phase = 'waiting';
    room.roundId += 1;
    room.resolvingCrash = false;
    room.roundStartAt = 0;
    room.crashResetTimer = null;
    broadcastCrashState(room.id);
    io.to(roomChannel(room.id)).emit('crash_players', publicCrashPlayers(room));
  }, CRASH_ROUND_CRASHED_MS);
}

function detachSocketFromRoom(socket, roomId) {
  if (!roomId) {
    return;
  }

  const room = crashRooms.get(roomId);
  if (!room) {
    return;
  }

  room.sockets.delete(socket.id);
  room.players.delete(socket.id);
  if (room.phase === 'waiting' && getActiveCrashBetCount(room) === 0) {
    room.roundStartAt = 0;
  }
  socket.leave(roomChannel(roomId));
  io.to(roomChannel(roomId)).emit('crash_players', publicCrashPlayers(room));

  if (room.id !== 'global' && room.sockets.size === 0) {
    crashRooms.delete(room.id);
    return;
  }

  broadcastCrashState(room.id);
  broadcastCrashRoomMembers(room.id);
}

function attachSocketToRoom(socket, roomId) {
  const sanitized = sanitizeRoomId(roomId);
  const previousRoomId = socket.data.crashRoomId;

  if (previousRoomId === sanitized) {
    return getCrashRoom(sanitized);
  }

  detachSocketFromRoom(socket, previousRoomId);

  const room = getCrashRoom(sanitized);
  room.sockets.add(socket.id);
  socket.data.crashRoomId = room.id;
  socket.join(roomChannel(room.id));
  broadcastCrashState(room.id);
  broadcastCrashRoomMembers(room.id);

  return room;
}

function detachPokerSocket(socket, roomId) {
  if (!roomId) {
    return;
  }

  const room = pokerRooms.get(roomId);
  if (!room) {
    return;
  }

  const leavingPlayer = room.players.get(socket.id);
  if (leavingPlayer && Number(leavingPlayer.buyIn || 0) > 0) {
    const profile = getSocketProfile(socket.id, leavingPlayer.username);
    if (Number.isFinite(Number(profile.balance))) {
      profile.balance = Number(profile.balance) + Number(leavingPlayer.buyIn || 0);
      socketProfiles.set(socket.id, profile);
    }
  }

  room.sockets.delete(socket.id);
  room.players.delete(socket.id);
  room.actedSocketIds.delete(socket.id);
  room.pendingActionSocketIds.delete(socket.id);
  room.turnOrder = room.turnOrder.filter((id) => id !== socket.id);
  socket.leave(pokerChannel(roomId));

  if (room.id !== 'global' && room.sockets.size === 0) {
    pokerRooms.delete(room.id);
    return;
  }

  if (room.started) {
    const activePlayers = getActivePokerPlayers(room);
    if (activePlayers.length <= 1) {
      completePokerShowdown(room);
    } else if (room.pendingActionSocketIds.size === 0) {
      maybeAdvancePokerStage(room);
    } else if (room.activePlayerSocketId === socket.id || !room.activePlayerSocketId) {
      assignPokerTurn(room, getNextPokerTurnIndex(room, room.activePlayerIndex));
      broadcastPokerState(room.id);
      return;
    }
  }

  broadcastPokerState(room.id);
}

function attachPokerSocket(socket, roomId, username) {
  const sanitized = sanitizeRoomId(roomId);
  const previousRoomId = socket.data.pokerRoomId;
  const pokerUserId = normalizePokerUserKey(socket.data.pokerUserId, username);

  removePokerGhostUsers(socket, pokerUserId);

  if (previousRoomId === sanitized) {
    const existingRoom = getPokerRoom(sanitized);

    Array.from(existingRoom.players.entries()).forEach(([socketId, roomPlayer]) => {
      if (socketId === socket.id) {
        return;
      }

      if (String(roomPlayer.userId || '') !== String(pokerUserId)) {
        return;
      }

      existingRoom.players.delete(socketId);
      existingRoom.sockets.delete(socketId);
      existingRoom.pendingActionSocketIds.delete(socketId);
      existingRoom.actedSocketIds.delete(socketId);
      existingRoom.turnOrder = existingRoom.turnOrder.filter((id) => id !== socketId);
    });

    if (!existingRoom.players.has(socket.id)) {
      existingRoom.sockets.add(socket.id);
      if (!existingRoom.turnOrder.includes(socket.id)) {
        existingRoom.turnOrder.push(socket.id);
      }
      existingRoom.players.set(socket.id, {
        socketId: socket.id,
        userId: pokerUserId,
        username,
        ready: false,
        seated: false,
        buyIn: 0,
        folded: true,
        hand: [],
        actionText: 'waiting buy-in',
      });
      broadcastPokerState(existingRoom.id);
    }

    broadcastPokerState(existingRoom.id);
    return existingRoom;
  }

  detachPokerSocket(socket, previousRoomId);

  const room = getPokerRoom(sanitized);

  Array.from(room.players.entries()).forEach(([socketId, roomPlayer]) => {
    if (socketId === socket.id) {
      return;
    }

    if (String(roomPlayer.userId || '') !== String(pokerUserId)) {
      return;
    }

    room.players.delete(socketId);
    room.sockets.delete(socketId);
    room.pendingActionSocketIds.delete(socketId);
    room.actedSocketIds.delete(socketId);
    room.turnOrder = room.turnOrder.filter((id) => id !== socketId);
  });

  room.sockets.add(socket.id);
  if (!room.turnOrder.includes(socket.id)) {
    room.turnOrder.push(socket.id);
  }
  room.players.set(socket.id, {
    socketId: socket.id,
    userId: pokerUserId,
    username,
    ready: false,
    seated: false,
    buyIn: 0,
    folded: true,
    hand: [],
    actionText: 'waiting buy-in',
  });
  socket.data.pokerRoomId = room.id;
  socket.data.pokerUserId = pokerUserId;
  socket.join(pokerChannel(room.id));

  broadcastPokerState(room.id);
  startPokerRound(room.id);
  return room;
}

function normalizeBlackjackUserKey(rawUserId, username) {
  const fromUserId = typeof rawUserId === 'string' ? rawUserId.trim() : '';
  if (fromUserId) {
    return fromUserId;
  }

  const fromName = typeof username === 'string' ? username.trim().toLowerCase() : '';
  return fromName || `guest-${Math.random().toString(36).slice(2, 8)}`;
}

function removeBlackjackGhostUsers(currentSocket, blackjackUserId) {
  blackjackRooms.forEach((room) => {
    let changed = false;

    Array.from(room.players.entries()).forEach(([socketId, player]) => {
      if (socketId === currentSocket.id) {
        return;
      }

      if (String(player.userId || '') !== String(blackjackUserId)) {
        return;
      }

      room.players.delete(socketId);
      room.sockets.delete(socketId);
      changed = true;

      const ghostSocket = io.sockets.sockets.get(socketId);
      if (ghostSocket) {
        ghostSocket.leave(blackjackChannel(room.id));
        ghostSocket.data.blackjackRoomId = null;
      }
    });

    if (changed) {
      broadcastBlackjackState(room.id);
    }
  });
}

function detachBlackjackSocket(socket, roomId) {
  if (!roomId) {
    return;
  }

  const room = blackjackRooms.get(roomId);
  if (!room) {
    return;
  }

  room.sockets.delete(socket.id);
  room.players.delete(socket.id);
  socket.leave(blackjackChannel(roomId));

  if (room.id !== 'global' && room.sockets.size === 0) {
    blackjackRooms.delete(room.id);
    return;
  }

  broadcastBlackjackState(room.id);
}

function attachBlackjackSocket(socket, roomId, username, blackjackUserId) {
  const sanitized = sanitizeRoomId(roomId);
  const previousRoomId = socket.data.blackjackRoomId;

  removeBlackjackGhostUsers(socket, blackjackUserId);

  if (previousRoomId === sanitized) {
    const existingRoom = getBlackjackRoom(sanitized);
    broadcastBlackjackState(existingRoom.id);
    return existingRoom;
  }

  detachBlackjackSocket(socket, previousRoomId);

  const room = getBlackjackRoom(sanitized);
  room.sockets.add(socket.id);
  room.players.set(socket.id, {
    socketId: socket.id,
    userId: blackjackUserId,
    username,
    hand: [],
    hands: [],
    activeHandIndex: 0,
    bet: 0,
    insuranceBet: 0,
    insuranceLocked: false,
    stood: false,
    busted: false,
    status: 'WAITING',
    resultText: '',
  });

  socket.data.blackjackRoomId = room.id;
  socket.join(blackjackChannel(room.id));
  broadcastBlackjackState(room.id);
  return room;
}

function detachRouletteSocket(socket, roomId) {
  if (!roomId) {
    return;
  }

  const room = rouletteRooms.get(roomId);
  if (!room) {
    return;
  }

  room.sockets.delete(socket.id);
  socket.leave(rouletteChannel(roomId));

  if (room.id !== 'global' && room.sockets.size === 0) {
    rouletteRooms.delete(room.id);
    return;
  }

  broadcastRouletteRoomMembers(room.id);
}

function attachRouletteSocket(socket, roomId) {
  const sanitized = sanitizeRoomId(roomId);
  const previousRoomId = socket.data.rouletteRoomId;

  if (previousRoomId === sanitized) {
    return getRouletteRoom(sanitized);
  }

  detachRouletteSocket(socket, previousRoomId);

  const room = getRouletteRoom(sanitized);
  room.sockets.add(socket.id);
  removeDuplicateRouletteUsers(room, onlineUsers.get(socket.id), socket.id);
  socket.data.rouletteRoomId = room.id;
  socket.join(rouletteChannel(room.id));
  broadcastRouletteRoomMembers(room.id);
  return room;
}

function broadcastRouletteRoomMembers(roomId) {
  const room = getRouletteRoom(roomId);
  io.to(rouletteChannel(room.id)).emit('roulette_room_members', {
    roomId: room.id,
    members: publicRouletteRoomMembers(room),
  });
}

function spinRouletteResult() {
  const winningIndex = Math.floor(Math.random() * ROULETTE_WHEEL_NUMBERS.length);
  const winningNumber = ROULETTE_WHEEL_NUMBERS[winningIndex];
  return {
    winningIndex,
    winningNumber,
    wheelSize: ROULETTE_WHEEL_NUMBERS.length,
  };
}

// ─── Global Random Event Engine ────────────────────────────────────────────
let currentActiveEvent = null;
let globalEventEndTimer = null;
let globalEventLoopTimer = null;
let globalRainDropTimer = null;
let nextGlobalEventAt = Date.now() + ((60 + Math.floor(Math.random() * 61)) * 60 * 1000);

const EVENT_TYPES = [
  {
    type: 'CASHBACK-MANIA',
    label: 'CASHBACK-MANIA',
    description: '10% Cashback on losing Crash/Coinflip bets.',
    multiplier: 1,
    color: '#22d3ee',
  },
  {
    type: 'MULTIPLIER-BOOST',
    label: 'MULTIPLIER-BOOST',
    description: '1.2x payout boost on Crash and Coinflip wins.',
    multiplier: 1.2,
    color: '#34d399',
  },
  {
    type: 'RAIN-EVENT',
    label: 'RAIN-EVENT',
    description: "IT'S RAINING NVC! Active users receive random drops.",
    multiplier: 1,
    color: '#38bdf8',
  },
];

function stopGlobalRainDrops() {
  if (globalRainDropTimer) {
    clearInterval(globalRainDropTimer);
    globalRainDropTimer = null;
  }
}

function startGlobalRainDrops() {
  stopGlobalRainDrops();

  globalRainDropTimer = setInterval(() => {
    if (!currentActiveEvent || currentActiveEvent.type !== 'RAIN-EVENT') {
      stopGlobalRainDrops();
      return;
    }

    const activeProfiles = Array.from(socketProfiles.values()).filter((profile) => profile && typeof profile.userId === 'string' && profile.userId.trim());
    const uniqueByUserId = new Map();
    activeProfiles.forEach((profile) => {
      const key = String(profile.userId).trim();
      if (key && !uniqueByUserId.has(key)) {
        uniqueByUserId.set(key, profile);
      }
    });

    if (uniqueByUserId.size === 0) {
      return;
    }

    const dropAmount = 20 + Math.floor(Math.random() * 81);
    uniqueByUserId.forEach((profile, userId) => {
      void sendNotification(
        userId,
        'SYSTEM',
        'Rain Event Drop',
        `You received ${dropAmount} NVC from RAIN-EVENT.`
      );

      const receiverSocketIds = getSocketIdsByUserId(userId);
      receiverSocketIds.forEach((receiverSocketId) => {
        io.to(receiverSocketId).emit('notification', {
          message: `RAIN-EVENT: +${dropAmount} NVC drop`,
        });
      });
    });
  }, 45000);
}

function stopGlobalEvent() {
  if (!currentActiveEvent) {
    return false;
  }

  const ended = currentActiveEvent;
  currentActiveEvent = null;

  if (globalEventEndTimer) {
    clearTimeout(globalEventEndTimer);
    globalEventEndTimer = null;
  }

  stopGlobalRainDrops();
  io.emit('global_event_ended', { type: ended?.type, endedAt: Date.now() });
  emitSystemMessage(`⏰ Event beendet: ${ended?.label}`);
  nextGlobalEventAt = Date.now() + ((60 + Math.floor(Math.random() * 61)) * 60 * 1000);
  return true;
}

function startGlobalEvent(eventDef, durationMinutes = null) {
  if (currentActiveEvent) {
    return { ok: false, error: 'Event already active.' };
  }

  const safeDurationMinutes = Number.isFinite(Number(durationMinutes))
    ? Math.max(1, Math.min(180, Math.floor(Number(durationMinutes))))
    : 5 + Math.floor(Math.random() * 6);
  const durationMs = safeDurationMinutes * 60 * 1000;
  const endTime = Date.now() + durationMs;

  currentActiveEvent = {
    type: eventDef.type,
    label: eventDef.label,
    description: eventDef.description,
    multiplier: eventDef.multiplier,
    color: eventDef.color,
    endTime,
    startedAt: Date.now(),
  };

  io.emit('global_event_started', currentActiveEvent);
  if (eventDef.type === 'RAIN-EVENT') {
    emitSystemMessage("IT'S RAINING NVC!");
    startGlobalRainDrops();
  }
  emitSystemMessage(`${eventDef.label}: ${eventDef.description} Endet in ${Math.round(durationMs / 60000)} Minuten!`);

  globalEventEndTimer = setTimeout(() => {
    stopGlobalEvent();
  }, durationMs);

  return { ok: true, event: currentActiveEvent };
}

function startRandomGlobalEvent() {
  if (currentActiveEvent) return;

  const eventDef = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  startGlobalEvent(eventDef, null);
}

function startGlobalEventManager() {
  if (globalEventLoopTimer) {
    clearInterval(globalEventLoopTimer);
  }

  globalEventLoopTimer = setInterval(() => {
    if (isShuttingDown || currentActiveEvent) {
      return;
    }

    if (Date.now() >= nextGlobalEventAt) {
      startRandomGlobalEvent();
    }
  }, 15000);
}

startGlobalEventManager();
// ─────────────────────────────────────────────────────────────────────────────

const crashEngineInterval = setInterval(() => {
  const rooms = Array.from(crashRooms.values());

  rooms.forEach((room) => {
    if (room.phase === 'waiting') {
      const activeBetCount = getActiveCrashBetCount(room);
      if (activeBetCount === 0) {
        room.roundStartAt = 0;
        return;
      }

      if (!room.roundStartAt) {
        room.roundStartAt = Date.now() + CRASH_ROUND_WAIT_MS;
        broadcastCrashState(room.id);
        return;
      }

      if (Date.now() >= room.roundStartAt) {
        startCrashRound(room.id);
      }
      return;
    }

    if (room.phase !== 'running') {
      return;
    }

    room.multiplier = Number((room.multiplier + 0.01 * (room.multiplier * 1.24)).toFixed(4));

    if (room.multiplier >= room.crashPoint) {
      crashRoundNow(room.id);
      return;
    }

    const now = Date.now();
    if (now - Number(room.lastTickBroadcastAt || 0) >= CRASH_BROADCAST_MS) {
      room.lastTickBroadcastAt = now;
      emitToCrashRoom(room.id, 'crash_tick', {
        roomId: room.id,
        roundId: room.roundId,
        multiplier: room.multiplier,
        players: publicCrashPlayers(room),
      });
    }

    const eligible = Array.from(room.players.values()).filter(
      (player) => player.autoCashOut >= 1 && !player.cashedOut && player.roundId === room.roundId
    );
    eligible.forEach((player) => {
      if (room.multiplier >= player.autoCashOut) {
        const basePayout = Number((player.amount * player.autoCashOut).toFixed(2));
        const payout = applyWinMultiplierBoost(basePayout);
        player.cashedOut = true;
        player.cashedAt = player.autoCashOut;

        const profile = getSocketProfile(player.socketId, player.username);
        if (Number.isFinite(Number(profile.balance))) {
          profile.balance = Number(profile.balance) + payout;
          socketProfiles.set(player.socketId, profile);
        }

        io.to(player.socketId).emit('crash_cashout_result', {
          ok: true,
          payout,
          multiplier: player.autoCashOut,
          mode: 'auto',
          roomId: room.id,
        });

        io.to(player.socketId).emit('crash_cashout_success', {
          payout,
          multiplier: player.autoCashOut,
          roomId: room.id,
        });

        emitToCrashRoom(room.id, 'crash_player_cashed_out', {
          username: player.username,
          multiplier: player.autoCashOut,
          payout,
          mode: 'auto',
          roomId: room.id,
        });

        emitSystemBigWin(player.username, payout, 'crash');
      }
    });
  });
}, CRASH_TICK_MS);

app.get('/health', (_req, res) => {
  const crashRoomStates = Array.from(crashRooms.values()).map((room) => ({
    id: room.id,
    phase: room.phase,
    multiplier: room.multiplier,
    players: room.players.size,
    sockets: room.sockets.size,
  }));

  const pokerRoomStates = Array.from(pokerRooms.values()).map((room) => ({
    id: room.id,
    stage: room.stage,
    players: room.players.size,
    sockets: room.sockets.size,
  }));

  const blackjackRoomStates = Array.from(blackjackRooms.values()).map((room) => ({
    id: room.id,
    stage: room.stage,
    players: room.players.size,
    sockets: room.sockets.size,
  }));

  const rouletteRoomStates = Array.from(rouletteRooms.values()).map((room) => ({
    id: room.id,
    sockets: room.sockets.size,
  }));

  res.json({
    status: 'ok',
    onlineUsers: onlineUsers.size,
    crashRooms: crashRoomStates,
    pokerRooms: pokerRoomStates,
    blackjackRooms: blackjackRoomStates,
    rouletteRooms: rouletteRoomStates,
  });
});

app.post('/internal/leaderboard/broadcast', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const amount = Math.floor(Number(req.body?.amount ?? 0));
  const username = typeof req.body?.username === 'string' ? req.body.username : undefined;
  const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'balance-change';

  io.emit('leaderboard_refresh', {
    amount,
    username,
    reason,
    at: Date.now(),
  });

  res.json({ ok: true });
});

app.post('/internal/chat/win', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const amount = Number.isFinite(Number(req.body?.amount)) ? Math.floor(Number(req.body.amount)) : 0;
  const source = typeof req.body?.source === 'string' ? req.body.source.trim().toLowerCase() : '';
  if (!username || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'Invalid payload' });
  }

    emitSystemBigWin(username, amount, source);
  return res.json({ ok: true });
});

app.post('/internal/global-event/start', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }
  if (currentActiveEvent) {
    return res.status(400).json({ ok: false, error: 'Event already active.' });
  }
  const result = startGlobalEvent(EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)], null);
  return res.json(result);
});

app.post('/internal/global-event/manual-start', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const eventType = typeof req.body?.eventType === 'string' ? req.body.eventType.trim().toUpperCase() : '';
  const durationMinutes = Math.floor(Number(req.body?.durationMinutes ?? 10));
  const eventDef = EVENT_TYPES.find((entry) => entry.type === eventType);
  if (!eventDef) {
    return res.status(400).json({ ok: false, error: 'Invalid eventType.' });
  }

  stopGlobalEvent();
  const result = startGlobalEvent(eventDef, durationMinutes);
  return res.json(result);
});

app.post('/internal/global-event/force-stop', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const stopped = stopGlobalEvent();
  return res.json({ ok: true, stopped });
});

app.get('/internal/global-event', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }
  return res.json({ ok: true, event: currentActiveEvent });
});

app.post('/internal/global-notification', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 240) : '';
  if (!message) {
    return res.status(400).json({ ok: false, error: 'Message is required.' });
  }

  io.emit('global_notification', {
    message,
    createdAt: Date.now(),
  });

  return res.json({ ok: true });
});

app.post('/internal/notifications/send', async (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  const type = typeof req.body?.type === 'string' ? req.body.type.trim().toUpperCase() : 'SYSTEM';
  const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : '';
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 400) : '';

  const result = await sendNotification(userId, type, title, message);
  if (!result.ok) {
    return res.status(400).json(result);
  }

  return res.json(result);
});

app.post('/internal/support/ticket-deleted', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const ticketId = typeof req.body?.ticketId === 'string' ? req.body.ticketId.trim() : '';
  const deletedBy = typeof req.body?.deletedBy === 'string' ? req.body.deletedBy.trim() : '';
  const deletedRole = typeof req.body?.deletedRole === 'string' ? req.body.deletedRole.trim().toUpperCase() : '';

  if (!ticketId) {
    return res.status(400).json({ ok: false, error: 'ticketId is required.' });
  }

  let delivered = 0;
  socketProfiles.forEach((profile, socketId) => {
    const role = normalizeRole(profile?.role, profile?.username || '');
    if (!hasRoleAtLeast(role, 'ADMIN')) {
      return;
    }

    io.to(socketId).emit('ticket_deleted', {
      ticketId,
      deletedBy,
      deletedRole,
      at: Date.now(),
    });
    delivered += 1;
  });

  return res.json({ ok: true, delivered });
});

app.post('/internal/admin-broadcast', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 240) : '';
  if (!message) {
    return res.status(400).json({ ok: false, error: 'Message is required.' });
  }

  io.emit('admin_broadcast', {
    message,
    createdAt: Date.now(),
    from: 'Daniel',
  });

  const activeUserIds = new Set();
  socketProfiles.forEach((profile) => {
    const userId = typeof profile?.userId === 'string' ? profile.userId.trim() : '';
    if (userId) {
      activeUserIds.add(userId);
    }
  });

  activeUserIds.forEach((userId) => {
    void sendNotification(userId, 'SYSTEM', 'System Announcement', message);
  });

  return res.json({ ok: true });
});

app.post('/internal/rain/start', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const amount = Math.floor(Number(req.body?.amount ?? 0));
  const duration = Math.floor(Number(req.body?.duration ?? 30));
  const participantsCount = Math.floor(Number(req.body?.participantsCount ?? 5));

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'Invalid amount.' });
  }

  const result = startRain(amount, duration, participantsCount, 'SYSTEM');
  if (!result.ok) {
    return res.status(400).json(result);
  }

  return res.json(result);
});

app.post('/internal/user/refresh', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  if (!username) {
    return res.status(400).json({ ok: false, error: 'Username is required.' });
  }

  const targets = getSocketIdsByUsername(username);
  targets.forEach((socketId) => {
    io.to(socketId).emit('wallet_refresh_required', {
      username,
      at: Date.now(),
    });
  });

  return res.json({ ok: true, delivered: targets.length });
});

app.get('/internal/stats/online', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  return res.json({ ok: true, onlineUsers: onlineUsers.size });
});

app.get('/internal/stats/live', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const countActiveRooms = (rooms) => {
    let count = 0;
    rooms.forEach((room) => {
      if (!room) {
        return;
      }

      if (room instanceof Set) {
        if (room.size > 0) {
          count += 1;
        }
        return;
      }

      if (Array.isArray(room.players) && room.players.length > 0) {
        count += 1;
      }
    });
    return count;
  };

  const activeTables =
    countActiveRooms(crashRooms) +
    countActiveRooms(pokerRooms) +
    countActiveRooms(blackjackRooms) +
    countActiveRooms(rouletteRooms) +
    countActiveRooms(genericRooms);

  return res.json({
    ok: true,
    onlineUsers: onlineUsers.size,
    activeTables,
  });
});

app.get('/internal/system/maintenance', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  return res.json({ ok: true, ...systemMaintenanceState });
});

app.post('/internal/system/maintenance', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const next = normalizeMaintenancePayload(req.body || {});
  applyMaintenanceState(next, { emit: true });
  return res.json({ ok: true, ...systemMaintenanceState });
});

app.post('/internal/user/banned-status', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const isBanned = Boolean(req.body?.isBanned);
  const banReason = typeof req.body?.banReason === 'string' ? req.body.banReason.trim() : '';
  const banExpiresAt = typeof req.body?.banExpiresAt === 'string' ? req.body.banExpiresAt : null;
  const forceLogoutMessage =
    typeof req.body?.forceLogoutMessage === 'string' && req.body.forceLogoutMessage.trim()
      ? req.body.forceLogoutMessage.trim()
      : 'You have been banned.';

  if (!userId && !username) {
    return res.status(400).json({ ok: false, error: 'userId or username is required.' });
  }

  socketProfiles.forEach((profile, socketId) => {
    const profileUserId = typeof profile.userId === 'string' ? profile.userId : '';
    const profileUsername = typeof profile.username === 'string' ? profile.username : '';
    if ((userId && profileUserId === userId) || (username && profileUsername === username)) {
      socketProfiles.set(socketId, {
        ...profile,
        userId: profileUserId || userId || null,
        isBanned,
      });
    }
  });

  chatHistory = chatHistory.map((message) => {
    const matchById = userId && message.userId === userId;
    const matchByUsername = username && message.username === username;
    if (!matchById && !matchByUsername) {
      return message;
    }

    const resolvedUserId = message.userId || userId || null;
    return {
      ...message,
      userId: resolvedUserId,
      isBanned,
      user: {
        ...(message.user || {}),
        id: resolvedUserId,
        isBanned,
      },
    };
  });

  io.emit('user_banned_status_changed', {
    userId: userId || null,
    username: username || null,
    isBanned,
    banReason: banReason || null,
    banExpiresAt,
  });

  if (isBanned) {
    const targetSocketIds = new Set([
      ...getSocketIdsByUserId(userId),
      ...getSocketIdsByUsername(username),
    ]);

    targetSocketIds.forEach((socketId) => {
      io.to(socketId).emit('force_logout', {
        message: forceLogoutMessage,
        at: Date.now(),
      });

      const liveSocket = io.sockets.sockets.get(socketId);
      if (liveSocket) {
        liveSocket.disconnect(true);
      }
    });
  }

  return res.json({ ok: true });
});

app.post('/internal/user/force-disconnect', (req, res) => {
  if (!isAuthorizedInternalRequest(req)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized internal request.' });
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  const message =
    typeof req.body?.message === 'string' && req.body.message.trim()
      ? req.body.message.trim()
      : typeof req.body?.reason === 'string' && req.body.reason.trim()
        ? req.body.reason.trim()
        : 'Disconnected by staff.';
  if (!username && !userId) {
    return res.status(400).json({ ok: false, error: 'username or userId is required.' });
  }

  const targets = Array.from(new Set([...getSocketIdsByUserId(userId), ...getSocketIdsByUsername(username)]));
  targets.forEach((socketId) => {
    io.to(socketId).emit('force_logout', {
      message,
      at: Date.now(),
    });

    const liveSocket = io.sockets.sockets.get(socketId);
    if (liveSocket) {
      liveSocket.disconnect(true);
    }
  });

  return res.json({ ok: true, disconnected: targets.length });
});

io.on('connection', (socket) => {
  const rawName = socket.handshake.query.username;
  const username = (typeof rawName === 'string' && rawName.trim()) || `Guest-${socket.id.slice(0, 6)}`;
  const pokerUserId = normalizePokerUserKey(socket.handshake.query.userId, username);
  const blackjackUserId = normalizeBlackjackUserKey(socket.handshake.query.userId, username);
  socket.data.pokerUserId = pokerUserId;
  socket.data.blackjackUserId = blackjackUserId;
  const initialXp = Number.isFinite(Number(socket.handshake.query.xp)) ? Number(socket.handshake.query.xp) : 0;
  const initialRole = typeof socket.handshake.query.role === 'string' ? socket.handshake.query.role : 'USER';
  const initialIsKing = socket.handshake.query.isKing === 'true' || socket.handshake.query.isKing === true;
  const initialUserId = typeof socket.handshake.query.userId === 'string' ? socket.handshake.query.userId : null;
  const initialIsBanned = socket.handshake.query.isBanned === 'true' || socket.handshake.query.isBanned === true;
  const initialClanTag =
    typeof socket.handshake.query.clanTag === 'string'
      ? socket.handshake.query.clanTag
      : typeof socket.handshake.query.clan === 'string'
        ? socket.handshake.query.clan
        : null;

  onlineUsers.set(socket.id, username);
  const initialSelectedRankTag = typeof socket.handshake.query.selectedRankTag === 'string' ? socket.handshake.query.selectedRankTag : undefined;
  const initialBalance = Number.isFinite(Number(socket.handshake.query.balance)) ? Number(socket.handshake.query.balance) : Number.MAX_SAFE_INTEGER;
  const trustedInitialRole = isTrustedOwnerUsername(username) ? 'OWNER' : initialRole;
  upsertSocketProfile(socket.id, username, initialXp, initialSelectedRankTag, initialBalance, trustedInitialRole, initialClanTag, initialIsKing, initialUserId, initialIsBanned);
  setUserActivity(socket.id, 'Hub');
  broadcastOnlineUsers();
  socket.join(COINFLIP_ROOM_ID);

  socket.emit('chat_history', chatHistory);
  socket.emit('system_maintenance_update', {
    isMaintenanceMode: Boolean(systemMaintenanceState.isMaintenanceMode),
    maintenanceEndTime: systemMaintenanceState.maintenanceEndTime,
  });
  socket.emit('coinflip_state', coinflipPublicState());
  if (currentActiveEvent) {
    socket.emit('global_event_started', currentActiveEvent);
  }
  if (activeRain) {
    socket.emit('rain_started', {
      rainId: activeRain.id,
      amount: activeRain.amount,
      duration: activeRain.duration,
      participantsCount: activeRain.participantsCount,
      endsAt: activeRain.endsAt,
      startedBy: activeRain.startedBy,
    });
  }

  const initialCrashRoomId = GLOBAL_CRASH_ROOM_ID;
  const crashRoom = attachSocketToRoom(socket, initialCrashRoomId);
  socket.emit('crash_room_joined', { ok: true, roomId: crashRoom.id });

  const initialPokerRoomId = sanitizeRoomId(socket.handshake.query.pokerRoomId);
  const pokerRoom = attachPokerSocket(socket, initialPokerRoomId, username);
  socket.emit('poker_room_joined', { ok: true, roomId: pokerRoom.id });

  const initialBlackjackRoomId = sanitizeRoomId(socket.handshake.query.blackjackRoomId);
  const blackjackRoom = attachBlackjackSocket(socket, initialBlackjackRoomId, username, blackjackUserId);
  socket.emit('blackjack_room_joined', { ok: true, roomId: blackjackRoom.id });

  const initialRouletteRoomId = sanitizeRoomId(socket.handshake.query.rouletteRoomId);
  const rouletteRoom = attachRouletteSocket(socket, initialRouletteRoomId);
  socket.emit('roulette_room_joined', { ok: true, roomId: rouletteRoom.id });

  socket.on('joinRoom', (payload, callback) => {
    const normalizedPayload = typeof payload === 'string' ? { roomId: payload } : payload;
    const game = typeof normalizedPayload?.game === 'string' ? normalizedPayload.game.trim().toLowerCase() : 'poker';
    const desired = sanitizeRoomId(normalizedPayload?.roomId);

    if (game === 'blackjack') {
      const nextRoom = attachBlackjackSocket(socket, desired, username, socket.data.blackjackUserId || blackjackUserId);
      setUserActivity(socket.id, 'Blackjack');
      callback?.({ ok: true, roomId: nextRoom.id });
      socket.emit('blackjack_room_joined', { ok: true, roomId: nextRoom.id });
      return;
    }

    if (game === 'roulette') {
      const nextRoom = attachRouletteSocket(socket, desired);
      setUserActivity(socket.id, 'Roulette');
      callback?.({ ok: true, roomId: nextRoom.id });
      socket.emit('roulette_room_joined', { ok: true, roomId: nextRoom.id });
      return;
    }

    const nextRoom = attachPokerSocket(socket, desired, username);
    setUserActivity(socket.id, 'Poker');
    callback?.({ ok: true, roomId: nextRoom.id });
    socket.emit('poker_room_joined', { ok: true, roomId: nextRoom.id });
  });

  socket.on('join_room', (payload, callback) => {
    const nextRoomId = sanitizeGenericRoomId(payload?.roomId);
    const previousRoomId = socket.data.genericRoomId;

    if (previousRoomId && previousRoomId !== nextRoomId) {
      socket.leave(previousRoomId);
      const previousMembers = genericRooms.get(previousRoomId);
      if (previousMembers) {
        previousMembers.delete(socket.id);
        if (previousMembers.size === 0) {
          genericRooms.delete(previousRoomId);
        }
      }
      emitGenericRoomUpdate(previousRoomId);
    }

    socket.join(nextRoomId);
    socket.data.genericRoomId = nextRoomId;

    if (!genericRooms.has(nextRoomId)) {
      genericRooms.set(nextRoomId, new Set());
    }
    genericRooms.get(nextRoomId).add(socket.id);

    emitGenericRoomUpdate(nextRoomId);
    callback?.({ ok: true, roomId: nextRoomId });
  });

  socket.on('join_crash_room', (payload, callback) => {
    const desired = sanitizeRoomId(payload?.roomId);
    const nextRoom = attachSocketToRoom(socket, desired);

    setUserActivity(socket.id, 'Crash');
    callback?.({ ok: true, roomId: nextRoom.id });
    socket.emit('crash_room_joined', { ok: true, roomId: nextRoom.id });
  });

  socket.on('join_poker_room', (payload, callback) => {
    console.log('Event received: join_poker_room', payload);
    const desired = sanitizeRoomId(payload?.roomId);
    const nextRoom = attachPokerSocket(socket, desired, username);

    setUserActivity(socket.id, "Poker");
    callback?.({ ok: true, roomId: nextRoom.id });
    socket.emit('poker_room_joined', { ok: true, roomId: nextRoom.id });
    broadcastPokerState(nextRoom.id);
  });

  socket.on('poker_create', (payload, callback) => {
    console.log('Event received: poker_create', payload);
    const nextRoom = createPokerRoomForSocket(socket, username);

    setUserActivity(socket.id, 'Poker');
    callback?.({ ok: true, roomId: nextRoom.id });
    socket.emit('poker_room_joined', { ok: true, roomId: nextRoom.id });
    socket.emit('poker_created', { roomId: nextRoom.id });
    broadcastPokerState(nextRoom.id);
  });

  socket.on('join_blackjack_room', (payload, callback) => {
    const desired = sanitizeRoomId(payload?.roomId);
    const nextRoom = attachBlackjackSocket(socket, desired, username, socket.data.blackjackUserId || blackjackUserId);

    setUserActivity(socket.id, 'Blackjack');
    callback?.({ ok: true, roomId: nextRoom.id });
    socket.emit('blackjack_room_joined', { ok: true, roomId: nextRoom.id });
  });

  socket.on('join_roulette_room', (payload, callback) => {
    const desired = sanitizeRoomId(payload?.roomId);
    const nextRoom = attachRouletteSocket(socket, desired);

    setUserActivity(socket.id, 'Roulette');
    callback?.({ ok: true, roomId: nextRoom.id });
    socket.emit('roulette_room_joined', { ok: true, roomId: nextRoom.id });
  });

  socket.on('roulette_win_announcement', (payload) => {
    const roomId = socket.data.rouletteRoomId;
    const amount = Math.floor(Number(payload?.amount ?? 0));

    if (!roomId || !Number.isFinite(amount) || amount <= 0) {
      return;
    }

    socket.to(rouletteChannel(roomId)).emit('roulette_win_announcement', {
      roomId,
      username,
      amount,
    });

    const isRealPlayer = !String(username).startsWith('Guest-');
    if (isRealPlayer) {
        emitSystemBigWin(username, amount, 'roulette');
    }
  });

  socket.on('friend_transfer_notification', (payload, callback) => {
    const receiverUsername = typeof payload?.receiverUsername === 'string' ? payload.receiverUsername.trim() : '';
    const receiverUserId = typeof payload?.receiverUserId === 'string' ? payload.receiverUserId.trim() : '';
    const message = typeof payload?.message === 'string' && payload.message.trim() ? payload.message.trim() : 'Du hast NVC erhalten!';

    if (!receiverUsername && !receiverUserId) {
      callback?.({ ok: false, error: 'receiverUsername or receiverUserId is required.' });
      return;
    }

    const receiverSocketIds = Array.from(new Set([
      ...getSocketIdsByUsername(receiverUsername),
      ...getSocketIdsByUserId(receiverUserId),
    ])).filter((socketId) => socketId !== socket.id);
    receiverSocketIds.forEach((receiverSocketId) => {
      io.to(receiverSocketId).emit('notification', { message });
    });

    callback?.({ ok: true, delivered: receiverSocketIds.length });
  });

  socket.on('friend_request', async (payload, callback) => {
    const receiverUsername = typeof payload?.receiverUsername === 'string' ? payload.receiverUsername.trim() : '';
    const senderUsername = typeof payload?.senderUsername === 'string' && payload.senderUsername.trim() ? payload.senderUsername.trim() : username;

    if (!receiverUsername) {
      callback?.({ ok: false, error: 'receiverUsername is required.' });
      return;
    }

    const result = await callFriendsSocketApi('friend_request', {
      senderUsername,
      receiverUsername,
    });

    if (!result.ok) {
      callback?.(result);
      return;
    }

    const receiverSocketIds = getSocketIdsByUsername(receiverUsername).filter((socketId) => socketId !== socket.id);
    receiverSocketIds.forEach((receiverSocketId) => {
      io.to(receiverSocketId).emit('friend_request_received', {
        senderUsername,
        receiverUsername,
      });
    });

    callback?.({ ok: true, request: result.request });
  });

  socket.on('accept_friend', async (payload, callback) => {
    const senderUsername = typeof payload?.senderUsername === 'string' ? payload.senderUsername.trim() : '';
    const accepterUsername = typeof payload?.accepterUsername === 'string' && payload.accepterUsername.trim() ? payload.accepterUsername.trim() : username;

    if (!senderUsername) {
      callback?.({ ok: false, error: 'senderUsername is required.' });
      return;
    }

    const result = await callFriendsSocketApi('accept_friend', {
      senderUsername,
      accepterUsername,
    });

    if (!result.ok) {
      callback?.(result);
      return;
    }

    const senderSocketIds = getSocketIdsByUsername(senderUsername).filter((socketId) => socketId !== socket.id);
    senderSocketIds.forEach((senderSocketId) => {
      io.to(senderSocketId).emit('friend_request_accepted', {
        senderUsername,
        accepterUsername,
      });
    });

    callback?.({ ok: true, friendship: result.friendship });
  });

  socket.on('create_ticket', async (payload, callback) => {
    const subject = typeof payload?.subject === 'string' ? payload.subject.trim() : '';
    const category = typeof payload?.category === 'string' ? payload.category.trim() : '';
    const content = typeof payload?.content === 'string' ? payload.content.trim() : '';

    if (!subject || !category || !content) {
      callback?.({ ok: false, error: 'subject, category and content are required.' });
      return;
    }

    const result = await callSupportSocketApi('create_ticket', {
      senderUsername: username,
      subject,
      category,
      content,
    });

    if (!result.ok) {
      callback?.(result);
      return;
    }

    io.emit('support_ticket_created', {
      ticketId: result.ticket?.id,
      createdBy: username,
    });

    callback?.({ ok: true, ticket: result.ticket });
  });

  socket.on('send_ticket_message', async (payload, callback) => {
    const ticketId = typeof payload?.ticketId === 'string' ? payload.ticketId.trim() : '';
    const content = typeof payload?.content === 'string' ? payload.content.trim() : '';

    if (!ticketId || !content) {
      callback?.({ ok: false, error: 'ticketId and content are required.' });
      return;
    }

    const result = await callSupportSocketApi('send_ticket_message', {
      senderUsername: username,
      ticketId,
      content,
    });

    if (!result.ok) {
      callback?.(result);
      return;
    }

    io.emit('support_ticket_message', {
      ticketId,
      senderUsername: username,
      status: result.status,
    });

    if (result.message?.isStaffReply && typeof result.ticketOwnerUsername === 'string' && result.ticketOwnerUsername.trim()) {
      const ownerSocketIds = getSocketIdsByUsername(result.ticketOwnerUsername).filter((socketId) => socketId !== socket.id);
      ownerSocketIds.forEach((socketId) => {
        io.to(socketId).emit('ticket_reply_received', {
          ticketId,
          message: `Support replied to ticket ${ticketId.slice(0, 8)}...`,
        });
      });

      if (typeof result.ticketUserId === 'string' && result.ticketUserId.trim()) {
        void sendNotification(
          result.ticketUserId,
          'SUPPORT_REPLY',
          'Support Update',
          `Support replied to your ticket: ${ticketId.slice(0, 8)}...`
        );
      }
    }

    callback?.({ ok: true, message: result.message, status: result.status });
  });

  socket.on('fetch_notifications', async (payload, callback) => {
    const profile = getSocketProfile(socket.id, username);
    const userId = typeof profile?.userId === 'string' ? profile.userId.trim() : '';
    if (!userId) {
      callback?.({ ok: false, error: 'User id is required.' });
      return;
    }

    const limit = Math.min(100, Math.max(1, Math.floor(Number(payload?.limit ?? 20))));
    const result = await callNotificationApi('fetch', { userId, limit });
    if (!result.ok) {
      callback?.({ ok: false, error: result.error || 'Failed to fetch notifications.' });
      return;
    }

    callback?.({ ok: true, notifications: result.notifications || [] });
  });

  socket.on('mark_notifications_read', async (payload, callback) => {
    const profile = getSocketProfile(socket.id, username);
    const userId = typeof profile?.userId === 'string' ? profile.userId.trim() : '';
    if (!userId) {
      callback?.({ ok: false, error: 'User id is required.' });
      return;
    }

    const ids = Array.isArray(payload?.ids)
      ? payload.ids.map((value) => String(value).trim()).filter(Boolean)
      : [];
    const markAll = Boolean(payload?.markAll);

    const result = await callNotificationApi('mark-read', {
      userId,
      ids,
      markAll,
    });

    if (!result.ok) {
      callback?.({ ok: false, error: result.error || 'Failed to mark notifications.' });
      return;
    }

    callback?.({ ok: true });
  });

  socket.on('delete_notifications', async (payload, callback) => {
    const profile = getSocketProfile(socket.id, username);
    const userId = typeof profile?.userId === 'string' ? profile.userId.trim() : '';
    if (!userId) {
      callback?.({ ok: false, error: 'User id is required.' });
      return;
    }

    const ids = Array.isArray(payload?.ids)
      ? payload.ids.map((value) => String(value).trim()).filter(Boolean)
      : [];
    const clearAll = Boolean(payload?.clearAll);

    const result = await callNotificationApi('delete', {
      userId,
      ids,
      clearAll,
    });

    if (!result.ok) {
      callback?.({ ok: false, error: result.error || 'Failed to delete notifications.' });
      return;
    }

    callback?.({ ok: true });
  });

  socket.on('update_ticket_status', async (payload, callback) => {
    const ticketId = typeof payload?.ticketId === 'string' ? payload.ticketId.trim() : '';
    const status = typeof payload?.status === 'string' ? payload.status.trim().toUpperCase() : '';

    if (!ticketId || !status) {
      callback?.({ ok: false, error: 'ticketId and status are required.' });
      return;
    }

    const result = await callSupportSocketApi('update_ticket_status', {
      senderUsername: username,
      ticketId,
      status,
    });

    if (!result.ok) {
      callback?.(result);
      return;
    }

    io.emit('support_ticket_status_updated', {
      ticketId,
      status: result.ticket?.status ?? status,
      updatedBy: username,
    });

    callback?.({ ok: true, ticket: result.ticket });
  });

  socket.on('get_online_friends', async (payload, callback) => {
    const requesterUsername = typeof payload?.username === 'string' && payload.username.trim() ? payload.username.trim() : username;
    if (!requesterUsername) {
      callback?.({ ok: false, error: 'username is required.' });
      return;
    }

    const uniquePresence = new Map();
    onlineUsers.forEach((onlineUsername, socketId) => {
      const cleanName = typeof onlineUsername === 'string' ? onlineUsername.trim() : '';
      if (!cleanName) {
        return;
      }

      const key = cleanName.toLowerCase();
      if (!uniquePresence.has(key)) {
        uniquePresence.set(key, {
          username: cleanName,
          online: true,
          activity: getUserActivity(socketId),
        });
      }
    });

    const result = await callFriendsSocketApi('get_online_friends', {
      username: requesterUsername,
      onlineUsers: Array.from(uniquePresence.values()),
    });

    if (!result.ok) {
      callback?.(result);
      return;
    }

    callback?.({ ok: true, friends: result.friends || [] });
  });

  const getRouletteTotalBetFromPayload = (payload) => {
    const directTotal = Math.floor(Number(payload?.totalBet ?? 0));
    if (Number.isFinite(directTotal) && directTotal > 0) {
      return directTotal;
    }

    if (!payload?.bets || typeof payload.bets !== 'object') {
      return 0;
    }

    return Object.values(payload.bets).reduce((sum, rawBet) => {
      const stake = Math.floor(Number(rawBet?.stake ?? 0));
      return sum + (Number.isFinite(stake) && stake > 0 ? stake : 0);
    }, 0);
  };

  const startRouletteSpinCycle = (payload, callback) => {
    const roomId = socket.data.rouletteRoomId;
    if (!roomId) {
      callback?.({ ok: false, error: 'Not in roulette room.' });
      return;
    }

    const room = rouletteRooms.get(roomId);
    if (!room || !room.sockets.has(socket.id)) {
      callback?.({ ok: false, error: 'Invalid roulette room state.' });
      return;
    }

    if (room.spinInProgress) {
      callback?.({ ok: false, error: 'Roulette already spinning. Wait for result.' });
      return;
    }

    const totalBet = getRouletteTotalBetFromPayload(payload);
    if (!Number.isFinite(totalBet) || totalBet <= 0) {
      callback?.({ ok: false, error: 'No valid bets submitted.' });
      return;
    }

    const profile = getSocketProfile(socket.id, username);
    if (!Number.isFinite(Number(profile.balance))) {
      callback?.({ ok: false, error: 'Balance not synced.' });
      return;
    }

    if (totalBet > Number(profile.balance)) {
      callback?.({ ok: false, error: 'Insufficient balance.' });
      return;
    }

    profile.balance = Number(profile.balance) - totalBet;
    socketProfiles.set(socket.id, profile);

    const result = spinRouletteResult();
    const roundId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const spinMs = 3800 + Math.floor(Math.random() * 1000);
    const startedAt = Date.now();

    room.spinInProgress = true;
    room.activeRoundId = roundId;

    const startedPayload = {
      roomId,
      roundId,
      startedAt,
      spinMs,
      initiatedBy: username,
      totalBet,
      serverBalance: profile.balance,
    };

    io.to(rouletteChannel(roomId)).emit('roulette_spin_started', startedPayload);
    io.to(rouletteChannel(roomId)).emit('roulette_started', startedPayload);

    callback?.({
      ok: true,
      roomId,
      roundId,
      spinMs,
      serverBalance: profile.balance,
    });

    setTimeout(() => {
      const activeRoom = rouletteRooms.get(roomId);
      if (!activeRoom || activeRoom.activeRoundId !== roundId) {
        return;
      }

      activeRoom.spinInProgress = false;
      activeRoom.activeRoundId = null;

      const resultPayload = {
        roomId,
        roundId,
        winningNumber: result.winningNumber,
        winningIndex: result.winningIndex,
        wheelSize: result.wheelSize,
        startedAt,
        spinMs,
        emittedAt: Date.now(),
        initiatedBy: username,
        totalBet,
        serverBalance: profile.balance,
      };

      io.to(rouletteChannel(roomId)).emit('roulette_result', resultPayload);
      io.to(rouletteChannel(roomId)).emit('roulette_spin_result', resultPayload);
    }, spinMs);
  };

  socket.on('roulette_spin_request', (payload, callback) => {
    startRouletteSpinCycle(payload, callback);
  });

  socket.on('roulette_spin', (payload, callback) => {
    startRouletteSpinCycle(payload, callback);
  });

  socket.on('roulette_place_bets', (payload, callback) => {
    startRouletteSpinCycle(payload, callback);
  });

  socket.on('profile_sync', (payload, callback) => {
    const existingProfile = getSocketProfile(socket.id, username);
    const xp = Number.isFinite(Number(payload?.xp)) ? Number(payload.xp) : 0;
    const balance = Number.isFinite(Number(payload?.balance)) ? Number(payload.balance) : Number.MAX_SAFE_INTEGER;
    const name = typeof payload?.username === 'string' && payload.username.trim() ? payload.username.trim() : username;
    const role = normalizeRole(payload?.role, name);
    const isKing = payload?.isKing === true;
    const clanTag =
      typeof payload?.clanTag === 'string'
        ? payload.clanTag
        : typeof payload?.clan === 'string'
          ? payload.clan
          : null;
    const selectedRankTag = typeof payload?.selectedRankTag === 'string' ? payload.selectedRankTag : undefined;
    const profile = upsertSocketProfile(
      socket.id,
      name,
      xp,
      selectedRankTag,
      balance,
      role,
      clanTag,
      isKing,
      existingProfile.userId,
      existingProfile.isBanned
    );
    callback?.({
      ok: true,
      level: profile.level,
      rankTag: profile.rankTag,
      rankColor: profile.rankColor,
      role: profile.role,
      clanTag: profile.clanTag,
      isKing: profile.isKing,
    });
  });

  socket.on('rain_start', (payload, callback) => {
    const permission = checkPermission(socket, 'OWNER', callback);
    if (!permission.ok) {
      return;
    }

    const amount = Math.floor(Number(payload?.amount ?? 0));
    const duration = Math.floor(Number(payload?.duration ?? 30));
    const participantsCount = Math.floor(Number(payload?.participantsCount ?? 5));
    const result = startRain(amount, duration, participantsCount, username);
    callback?.(result);
  });

  socket.on('coinflip_get_state', (_payload, callback) => {
    callback?.({ ok: true, ...coinflipPublicState() });
  });

  socket.on('coinflip_create', (payload, callback) => {
    const amount = Math.floor(Number(payload?.amount ?? 0));
    if (!Number.isFinite(amount) || amount <= 0) {
      callback?.({ ok: false, error: 'Invalid amount.' });
      return;
    }

    const alreadyOpen = coinflipState.openLobbies.some((lobby) => lobby.creatorSocketId === socket.id);
    if (alreadyOpen) {
      callback?.({ ok: false, error: 'You already have an open coinflip.' });
      return;
    }

    if (coinflipState.status === 'running') {
      callback?.({ ok: false, error: 'Coinflip already running. Try again shortly.' });
      return;
    }

    const profile = getSocketProfile(socket.id, username);
    if (!Number.isFinite(Number(profile.balance))) {
      callback?.({ ok: false, error: 'Balance not synced.' });
      return;
    }

    if (amount > Number(profile.balance)) {
      callback?.({ ok: false, error: 'Insufficient balance.' });
      return;
    }

    profile.balance = Number(profile.balance) - amount;
    socketProfiles.set(socket.id, profile);

    const lobby = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      amount,
      creatorSocketId: socket.id,
      creatorUsername: username,
      createdAt: Date.now(),
    };
    coinflipState.openLobbies.push(lobby);
    coinflipState.status = 'waiting';
    coinflipState.lastResult = null;
    emitCoinflipState();
    callback?.({ ok: true, lobby });
  });

  socket.on('coinflip_cancel', (payload, callback) => {
    const requestedLobbyId = typeof payload?.lobbyId === 'string' ? payload.lobbyId : '';
    if (!coinflipState.openLobbies.length) {
      callback?.({ ok: false, error: 'No open coinflip.' });
      return;
    }

    const lobbyIndex = requestedLobbyId
      ? coinflipState.openLobbies.findIndex((entry) => entry.id === requestedLobbyId)
      : coinflipState.openLobbies.findIndex((entry) => entry.creatorSocketId === socket.id);
    if (lobbyIndex < 0) {
      callback?.({ ok: false, error: 'No matching open coinflip.' });
      return;
    }

    const lobby = coinflipState.openLobbies[lobbyIndex];
    if (lobby.creatorSocketId !== socket.id) {
      callback?.({ ok: false, error: 'Only creator can cancel.' });
      return;
    }

    const refundAmount = lobby.amount;
    const profile = getSocketProfile(socket.id, username);
    profile.balance = Number(profile.balance) + refundAmount;
    socketProfiles.set(socket.id, profile);

    const canceledLobbyId = lobby.id;
    coinflipState.openLobbies.splice(lobbyIndex, 1);
    coinflipState.status = 'waiting';
    emitCoinflipState();
    io.to(COINFLIP_ROOM_ID).emit('coinflip_canceled', {
      lobbyId: canceledLobbyId,
      creatorUsername: username,
      refundAmount,
    });
    callback?.({ ok: true, refundAmount });
  });

  socket.on('coinflip_join', (payload, callback) => {
    if (coinflipState.status === 'running') {
      callback?.({ ok: false, error: 'Coinflip currently running. Wait for next round.' });
      return;
    }

    const requestedLobbyId = typeof payload?.lobbyId === 'string' ? payload.lobbyId : '';
    const lobby = requestedLobbyId
      ? coinflipState.openLobbies.find((entry) => entry.id === requestedLobbyId)
      : coinflipState.openLobbies[0];
    if (!lobby) {
      callback?.({ ok: false, error: 'No open coinflip available.' });
      return;
    }

    if (lobby.creatorSocketId === socket.id) {
      callback?.({ ok: false, error: 'You cannot join your own coinflip.' });
      return;
    }

    const joinerProfile = getSocketProfile(socket.id, username);
    if (!Number.isFinite(Number(joinerProfile.balance))) {
      callback?.({ ok: false, error: 'Balance not synced.' });
      return;
    }

    if (lobby.amount > Number(joinerProfile.balance)) {
      callback?.({ ok: false, error: 'Insufficient balance.' });
      return;
    }

    coinflipState.status = 'running';
    coinflipState.openLobbies = coinflipState.openLobbies.filter((entry) => entry.id !== lobby.id);
    emitCoinflipState();
    io.to(COINFLIP_ROOM_ID).emit('coinflip_running', {
      id: lobby.id,
      creatorUsername: lobby.creatorUsername,
      joinerUsername: username,
      amount: lobby.amount,
      startedAt: Date.now(),
    });

    joinerProfile.balance = Number(joinerProfile.balance) - lobby.amount;
    socketProfiles.set(socket.id, joinerProfile);

    const creatorProfile = getSocketProfile(lobby.creatorSocketId, lobby.creatorUsername);
    const winnerIsCreator = Math.random() < 0.5;
    const winnerUsername = winnerIsCreator ? lobby.creatorUsername : username;
    const winnerSocketId = winnerIsCreator ? lobby.creatorSocketId : socket.id;
    const loserUsername = winnerIsCreator ? username : lobby.creatorUsername;
    const pot = lobby.amount * 2;
    const basePayout = Math.floor(pot * (1 - COINFLIP_HOUSE_FEE_RATE));
    const payout = Math.floor(applyWinMultiplierBoost(basePayout));
    const fee = pot - payout;

    const winnerProfile = winnerIsCreator ? creatorProfile : joinerProfile;
    winnerProfile.balance = Number(winnerProfile.balance) + payout;
    socketProfiles.set(winnerSocketId, winnerProfile);

    setTimeout(() => {
      coinflipState.lastResult = {
        id: lobby.id,
        creatorUsername: lobby.creatorUsername,
        joinerUsername: username,
        winnerUsername,
        loserUsername,
        amount: lobby.amount,
        pot,
        payout,
        fee,
        resolvedAt: Date.now(),
      };
      coinflipState.status = 'waiting';

      io.to(COINFLIP_ROOM_ID).emit('coinflip_result', coinflipState.lastResult);
      emitCoinflipState();

      if (payout >= HIGH_ROLLER_THRESHOLD) {
        emitSystemBigWin(winnerUsername, payout, 'coinflip');
      }

      const loserSocketId = winnerIsCreator ? socket.id : lobby.creatorSocketId;
      applyCashbackForLoss(loserSocketId, loserUsername, Number(lobby.amount || 0), 'coinflip');
    }, 1200);

    callback?.({ ok: true });
  });

  socket.on('blackjack_start_round', (_payload, callback) => {
    const roomId = socket.data.blackjackRoomId;
    const result = startBlackjackRound(roomId);
    callback?.(result);
  });

  socket.on('blackjack_deal', (payload, callback) => {
    console.log('Event received: blackjack_deal', payload);
    const roomId = socket.data.blackjackRoomId;
    const amount = parseInt(String(payload?.amount ?? ''), 10);

    if (!Number.isFinite(amount) || amount <= 0) {
      callback?.({ ok: false, error: 'Invalid bet amount.' });
      return;
    }

    const profile = getSocketProfile(socket.id, username);
    if (Number.isFinite(Number(profile.balance)) && Number(profile.balance) < amount) {
      callback?.({ ok: false, error: 'Insufficient balance.' });
      return;
    }

    if (Number.isFinite(Number(profile.balance))) {
      profile.balance = Number(profile.balance) - amount;
      socketProfiles.set(socket.id, profile);
    }

    const room = getBlackjackRoom(roomId);
    if (room.stage === 'playing') {
      callback?.({ ok: false, error: 'Round already in progress.' });
      return;
    }

    const player = room.players.get(socket.id);
    if (!player) {
      if (Number.isFinite(Number(profile.balance))) {
        profile.balance = Number(profile.balance) + amount;
        socketProfiles.set(socket.id, profile);
      }
      callback?.({ ok: false, error: 'Not in blackjack room.' });
      return;
    }

    player.bet = amount;
    player.hands = [];
    player.activeHandIndex = 0;
    player.insuranceBet = 0;
    player.insuranceLocked = false;
    player.status = 'PLAYER_TURN';

    const result = startBlackjackRound(roomId);

    if (!result.ok) {
      player.bet = 0;
      if (Number.isFinite(Number(profile.balance))) {
        profile.balance = Number(profile.balance) + amount;
        socketProfiles.set(socket.id, profile);
      }
      callback?.(result);
      return;
    }

    io.to(socket.id).emit('blackjack_state', publicBlackjackState(room, socket.id));

    callback?.({ ok: true });
  });

  socket.on('blackjack_hit', (_payload, callback) => {
    const roomId = socket.data.blackjackRoomId;
    const room = getBlackjackRoom(roomId);
    callback?.(applyBlackjackHit(room, socket.id));
  });

  socket.on('blackjack_stand', (_payload, callback) => {
    const roomId = socket.data.blackjackRoomId;
    const room = getBlackjackRoom(roomId);
    callback?.(applyBlackjackStand(room, socket.id));
  });

  socket.on('blackjack_action', (payload, callback) => {
    console.log('Event received: blackjack_action', payload);
    const roomId = socket.data.blackjackRoomId;
    const room = getBlackjackRoom(roomId);
    const action = typeof payload?.action === 'string' ? payload.action.toLowerCase() : '';
    const game = publicBlackjackState(room, socket.id);

    if (game.status !== 'PLAYER_TURN') {
      callback?.({ ok: false, error: 'Not your turn.' });
      return;
    }

    if (action === 'hit') {
      callback?.(applyBlackjackHit(room, socket.id));
      return;
    }

    if (action === 'stand') {
      callback?.(applyBlackjackStand(room, socket.id));
      return;
    }

    if (action === 'double' || action === 'double_down') {
      callback?.(applyBlackjackDouble(room, socket.id));
      return;
    }

    if (action === 'split') {
      callback?.(applyBlackjackSplit(room, socket.id));
      return;
    }

    if (action === 'insurance') {
      callback?.(applyBlackjackInsurance(room, socket.id));
      return;
    }

    callback?.({ ok: false, error: 'Unknown blackjack action.' });
  });

  socket.on('poker_set_ready', (payload, callback) => {
    const roomId = socket.data.pokerRoomId;
    const room = getPokerRoom(roomId);
    const player = room.players.get(socket.id);

    if (!player) {
      callback?.({ ok: false, error: 'Not in poker room.' });
      return;
    }

    if (room.started) {
      callback?.({ ok: false, error: 'Hand in progress.' });
      return;
    }

    player.ready = Boolean(payload?.ready);
    player.actionText = player.ready ? 'ready' : 'waiting';
    broadcastPokerState(room.id);
    startPokerRound(room.id);
    callback?.({ ok: true });
  });

  socket.on('poker_buy_in', (payload, callback) => {
    console.log('Event received: poker_buy_in', payload);
    const roomId = socket.data.pokerRoomId;
    const room = getPokerRoom(roomId);
    const player = room.players.get(socket.id);

    if (!player) {
      callback?.({ ok: false, error: 'Not in poker room.' });
      return;
    }

    const amount = parseInt(String(payload?.amount ?? ''), 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      callback?.({ ok: false, error: 'Invalid buy-in amount.' });
      return;
    }

    const profile = getSocketProfile(socket.id, username);
    if (!Number.isFinite(Number(profile.balance)) || Number(profile.balance) < amount) {
      callback?.({ ok: false, error: 'Insufficient balance for buy-in.' });
      return;
    }

    profile.balance = Number(profile.balance) - amount;
    socketProfiles.set(socket.id, profile);

    player.buyIn = Number(player.buyIn || 0) + amount;
    player.seated = true;
    player.ready = true;
    player.folded = false;
    player.actionText = `seated ${player.buyIn}`;

    broadcastPokerState(room.id);
    startPokerRound(room.id);
    callback?.({ ok: true, amount });
  });

  socket.on('poker_action', (payload, callback) => {
    console.log('Event received: poker_action', payload);
    const roomId = socket.data.pokerRoomId;
    const room = getPokerRoom(roomId);
    const player = room.players.get(socket.id);

    if (!player) {
      callback?.({ ok: false, error: 'Not in poker room.' });
      return;
    }

    if (!room.started || room.stage === 'waiting' || room.stage === 'showdown') {
      callback?.({ ok: false, error: 'No active hand.' });
      return;
    }

    if (!player.seated || Number(player.buyIn || 0) <= 0) {
      callback?.({ ok: false, error: 'Sit down with buy-in first.' });
      return;
    }

    if (room.activePlayerSocketId !== socket.id) {
      callback?.({ ok: false, error: 'Not your turn.' });
      return;
    }

    const action = typeof payload?.action === 'string' ? payload.action : 'check';
    const currentBet = Number(room.currentTableBet || room.currentBet || 0);
    const playerRoundBet = Number(player.roundBet || 0);

    if (action === 'fold') {
      player.folded = true;
      player.actionText = 'folded';
      room.pendingActionSocketIds.delete(socket.id);
      room.actedSocketIds.add(socket.id);
    } else if (action === 'check') {
      if (playerRoundBet !== currentBet) {
        callback?.({ ok: false, error: 'Cannot check. Call or fold required.' });
        return;
      }
      player.actionText = 'check';
      room.pendingActionSocketIds.delete(socket.id);
      room.actedSocketIds.add(socket.id);
    } else if (action === 'call') {
      const diff = Math.max(0, currentBet - playerRoundBet);
      if (diff > Number(player.buyIn || 0)) {
        callback?.({ ok: false, error: 'Insufficient stack to call.' });
        return;
      }

      if (diff <= 0) {
        callback?.({ ok: false, error: 'Nothing to call. Use check.' });
        return;
      }

      player.buyIn = Number(player.buyIn || 0) - diff;
      player.roundBet = playerRoundBet + diff;
      room.pot = Number(room.pot || 0) + diff;
      player.actionText = `call ${currentBet}`;
      if (Number(player.buyIn || 0) <= 0) {
        player.actionText = `call ${currentBet} (all-in)`;
      }
      room.pendingActionSocketIds.delete(socket.id);
      room.actedSocketIds.add(socket.id);
    } else if (action === 'raise') {
      const requestedRaise = Math.floor(Number(payload?.amount ?? 0));
      const minRaiseUnit = Math.max(Number(room.lastRaiseAmount || 0), Number(room.bigBlind || POKER_BIG_BLIND), POKER_BIG_BLIND);
      const minimumTarget = currentBet + minRaiseUnit;
      if (!Number.isFinite(requestedRaise) || requestedRaise < minimumTarget) {
        callback?.({ ok: false, error: `Raise must be at least ${minimumTarget}.` });
        return;
      }

      if (requestedRaise <= playerRoundBet) {
        callback?.({ ok: false, error: 'Raise must increase your current bet.' });
        return;
      }

      const raiseCost = requestedRaise - playerRoundBet;
      if (raiseCost > Number(player.buyIn || 0)) {
        callback?.({ ok: false, error: 'Insufficient stack for raise.' });
        return;
      }

      player.buyIn = Number(player.buyIn || 0) - raiseCost;
      player.roundBet = requestedRaise;
      room.pot = Number(room.pot || 0) + raiseCost;
      room.currentBet = requestedRaise;
      room.currentTableBet = requestedRaise;
      room.lastRaiseAmount = Math.max(1, requestedRaise - currentBet);
      room.minRaise = Math.max(room.minRaise || 0, room.lastRaiseAmount, Number(room.bigBlind || POKER_BIG_BLIND));
      player.actionText = `raise ${requestedRaise}`;
      if (Number(player.buyIn || 0) <= 0) {
        player.actionText = `raise ${requestedRaise} (all-in)`;
      }

      room.pendingActionSocketIds = new Set(
        room.turnOrder.filter((socketId) => {
          if (socketId === player.socketId) {
            return false;
          }

          const target = room.players.get(socketId);
          return Boolean(target && !target.folded && target.ready && target.hand.length > 0 && Number(target.buyIn || 0) > 0);
        })
      );

      room.players.forEach((otherPlayer) => {
        if (
          otherPlayer.socketId !== player.socketId
          && !otherPlayer.folded
          && otherPlayer.ready
          && otherPlayer.hand.length > 0
          && Number(otherPlayer.buyIn || 0) > 0
        ) {
          otherPlayer.actionText = 'to call';
        }
      });

      room.actedSocketIds = new Set([socket.id]);
    } else {
      callback?.({ ok: false, error: 'Unknown action.' });
      return;
    }

    const alive = getActivePokerPlayers(room);
    if (alive.length <= 1) {
      completePokerShowdown(room);
      callback?.({ ok: true });
      return;
    }

    if (isPokerBettingRoundComplete(room)) {
      maybeAdvancePokerStage(room);
      callback?.({ ok: true });
      return;
    }

    assignPokerTurn(room, getNextPokerTurnIndex(room, room.activePlayerIndex));
    broadcastPokerState(room.id);
    callback?.({ ok: true });
  });

  socket.on('send_chat_message', (payload) => {
    const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
    if (!text) {
      return;
    }

    const profile = getSocketProfile(socket.id, username);
    chatActiveUsers.set(username, Date.now());

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      username,
      text: text.slice(0, 280),
      createdAt: Date.now(),
      role: profile.role,
      userId: profile.userId,
      isBanned: Boolean(profile.isBanned),
      user: {
        id: profile.userId,
        isBanned: Boolean(profile.isBanned),
      },
      isKing: Boolean(profile.isKing),
      clanTag: profile.clanTag,
      rankTag: profile.rankTag,
      rankColor: profile.rankColor,
      level: profile.level,
    };

    chatHistory = [...chatHistory, message].slice(-80);
    io.emit('chat_message', message);

    const mentionMatches = text.match(/@([a-zA-Z0-9_]+)/g) ?? [];
    const mentionedUsernames = Array.from(
      new Set(
        mentionMatches
          .map((mention) => mention.slice(1).trim())
          .filter(Boolean)
      )
    );

    mentionedUsernames.forEach((mentionedUsername) => {
      const receiverSocketIds = getSocketIdsByUsername(mentionedUsername).filter((socketId) => socketId !== socket.id);
      receiverSocketIds.forEach((receiverSocketId) => {
        io.to(receiverSocketId).emit('chat_mention', {
          sender: username,
          message: message.text,
          mentioned: mentionedUsername,
          createdAt: message.createdAt,
        });
      });
    });
  });

  socket.on('fetch_user_profile', async (payload, callback) => {
    const targetUserId = typeof payload?.targetUserId === 'string' ? payload.targetUserId.trim() : '';
    const targetUsername = typeof payload?.targetUsername === 'string' ? payload.targetUsername.trim() : '';

    if (!targetUserId && !targetUsername) {
      callback?.({ ok: false, error: 'targetUserId or targetUsername is required.' });
      return;
    }

    const result = await callFriendsSocketApi('get_public_profile', {
      requesterUsername: username,
      targetUserId,
      targetUsername,
    });

    if (!result.ok || !result.profile) {
      callback?.({ ok: false, error: result.error || 'Profile unavailable.' });
      return;
    }

    socket.emit('user_profile_data', result.profile);
    callback?.({ ok: true, profile: result.profile });
  });

  socket.on('admin_broadcast', (payload, callback) => {
    const permission = checkPermission(socket, 'MODERATOR', callback);
    if (!permission.ok) {
      return;
    }

    const message = typeof payload?.message === 'string' ? payload.message.trim().slice(0, 180) : '';
    if (!message) {
      callback?.({ ok: false, error: 'Message is required.' });
      return;
    }

    io.emit('admin_broadcast', {
      message,
      createdAt: Date.now(),
      from: permission.profile.username,
    });

    const activeUserIds = new Set();
    socketProfiles.forEach((profile) => {
      const userId = typeof profile?.userId === 'string' ? profile.userId.trim() : '';
      if (userId) {
        activeUserIds.add(userId);
      }
    });
    activeUserIds.forEach((userId) => {
      void sendNotification(userId, 'SYSTEM', 'System Announcement', message);
    });

    callback?.({ ok: true });
  });

  socket.on('admin_trigger_global_event', (payload, callback) => {
    const permission = checkPermission(socket, 'ADMIN', callback);
    if (!permission.ok) {
      return;
    }

    const eventType = typeof payload?.eventType === 'string' ? payload.eventType.trim().toUpperCase() : '';
    const durationMinutes = Math.max(1, Math.min(180, Math.floor(Number(payload?.durationMinutes ?? 10))));
    const eventDef = EVENT_TYPES.find((entry) => entry.type === eventType);
    if (!eventDef) {
      callback?.({ ok: false, error: 'Invalid event type.' });
      return;
    }

    stopGlobalEvent();
    const result = startGlobalEvent(eventDef, durationMinutes);
    callback?.(result);
  });

  socket.on('admin_force_stop_global_events', (_payload, callback) => {
    const permission = checkPermission(socket, 'ADMIN', callback);
    if (!permission.ok) {
      return;
    }

    const stopped = stopGlobalEvent();
    callback?.({ ok: true, stopped });
  });

  socket.on('crash_place_bet', (payload, callback) => {
    setUserActivity(socket.id, 'Crash');
    const requestedRoomId = sanitizeRoomId(payload?.roomId);
    const roomId = socket.data.crashRoomId || GLOBAL_CRASH_ROOM_ID;

    if (requestedRoomId !== roomId) {
      console.warn(`[crash_place_bet] room mismatch user=${username} requested=${requestedRoomId} socketRoom=${roomId}`);
      callback?.({ ok: false, error: 'Room mismatch. Join the selected crash room first.' });
      return;
    }

    const roomState = getCrashRoom(roomId);
    const parsedAmount = Number(payload?.amount ?? 0);
    const autoCashOut = Number(payload?.autoCashOut ?? 0);

    if (!roomState.sockets.has(socket.id)) {
      attachSocketToRoom(socket, roomId);
    }

    if (!roomState.sockets.has(socket.id)) {
      console.warn(`[crash_place_bet] socket room sync failed user=${username} room=${roomId} socketId=${socket.id}`);
      callback?.({ ok: false, error: 'Socket room sync failed.' });
      return;
    }

    if (roomState.phase !== 'waiting' || roomState.resolvingCrash) {
      console.warn(`[crash_place_bet] rejected not waiting user=${username} room=${roomId} phase=${roomState.phase}`);
      callback?.({ ok: false, error: 'Round already running.' });
      return;
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      console.warn(`[crash_place_bet] invalid amount user=${username} room=${roomId} amount=${payload?.amount}`);
      callback?.({ ok: false, error: 'Invalid amount.' });
      return;
    }

    const safeAmount = Math.floor(Number(parsedAmount));
    const profile = getSocketProfile(socket.id, username);
    if (!Number.isFinite(Number(profile.balance)) || Number(profile.balance) < safeAmount) {
      callback?.({ ok: false, error: 'Insufficient balance.' });
      return;
    }

    const existingBet = roomState.players.get(socket.id);
    if (existingBet && !existingBet.cashedOut) {
      console.warn(`[crash_place_bet] duplicate bet user=${username} room=${roomId} amount=${existingBet.amount}`);
      callback?.({ ok: false, error: 'Bet already placed for this round.' });
      return;
    }

    profile.balance = Number(profile.balance) - safeAmount;
    socketProfiles.set(socket.id, profile);

    roomState.players.set(socket.id, {
      socketId: socket.id,
      username,
      amount: safeAmount,
      autoCashOut: Number.isFinite(autoCashOut) ? autoCashOut : 0,
      roundId: roomState.roundId,
      cashedOut: false,
      cashedAt: null,
    });

    const persistedPlayer = roomState.players.get(socket.id);
    const failedToPersist =
      !persistedPlayer ||
      persistedPlayer.amount !== safeAmount ||
      persistedPlayer.roundId !== roomState.roundId;

    if (failedToPersist) {
      console.warn(`[crash_place_bet] live room persist failed user=${username} room=${roomId}`);
      profile.balance = Number(profile.balance) + safeAmount;
      socketProfiles.set(socket.id, profile);
      roomState.players.delete(socket.id);
      callback?.({ ok: false, error: 'Bet could not be registered in live room state.' });
      return;
    }

    console.log(`User ${username} placed ${safeAmount} in Room ${roomId}`);

    io.to(socket.id).emit('crash_bet_registered', {
      ok: true,
      roomId,
      amount: safeAmount,
    });

    // Broadcast the full crash state immediately so clients sync active bets without delay.
    broadcastCrashState(roomState.id);

    emitToCrashRoom(roomState.id, 'crash_players', publicCrashPlayers(roomState));

    if (roomState.phase === 'waiting' && !roomState.roundStartAt) {
      roomState.roundStartAt = Date.now() + CRASH_ROUND_WAIT_MS;
      broadcastCrashState(roomState.id);
    }

    callback?.({ ok: true, roomId });
  });

  socket.on('crash_cancel_bet', (_payload, callback) => {
    const roomId = socket.data.crashRoomId || GLOBAL_CRASH_ROOM_ID;
    const roomState = getCrashRoom(roomId);

    if (roomState.phase !== 'waiting') {
      callback?.({ ok: false, error: 'Cannot cancel after round start.' });
      return;
    }

    const canceledPlayer = roomState.players.get(socket.id);
    const hadBet = roomState.players.delete(socket.id);
    if (hadBet && canceledPlayer && Number(canceledPlayer.amount) > 0) {
      const profile = getSocketProfile(socket.id, username);
      if (Number.isFinite(Number(profile.balance))) {
        profile.balance = Number(profile.balance) + Number(canceledPlayer.amount);
        socketProfiles.set(socket.id, profile);
      }
    }
    console.warn(`[crash_cancel_bet] user=${username} room=${roomId} canceled=${hadBet}`);

    if (roomState.phase === 'waiting' && getActiveCrashBetCount(roomState) === 0) {
      roomState.roundStartAt = 0;
      broadcastCrashState(roomState.id);
    }

    emitToCrashRoom(roomState.id, 'crash_players', publicCrashPlayers(roomState));

    callback?.({ ok: true, canceled: hadBet });
  });

  socket.on('crash_cashout', (_payload, callback) => {
    const roomId = socket.data.crashRoomId || GLOBAL_CRASH_ROOM_ID;
    const roomState = getCrashRoom(roomId);

    if (roomState.phase !== 'running' || roomState.resolvingCrash) {
      callback?.({ ok: false, error: 'Round is not running.' });
      return;
    }

    const player = roomState.players.get(socket.id);
    if (!player || player.cashedOut || player.roundId !== roomState.roundId) {
      callback?.({ ok: false, error: 'No active crash bet.' });
      return;
    }

    player.cashedOut = true;
    player.cashedAt = roomState.multiplier;

    const basePayout = Number((player.amount * roomState.multiplier).toFixed(2));
    const payout = applyWinMultiplierBoost(basePayout);
    const profile = getSocketProfile(socket.id, username);
    if (Number.isFinite(Number(profile.balance))) {
      profile.balance = Number(profile.balance) + payout;
      socketProfiles.set(socket.id, profile);
    }

    io.to(socket.id).emit('crash_cashout_result', {
      ok: true,
      payout,
      multiplier: roomState.multiplier,
      mode: 'manual',
      roomId,
    });

    io.to(socket.id).emit('crash_cashout_success', {
      payout,
      multiplier: roomState.multiplier,
      roomId,
    });

    emitToCrashRoom(roomState.id, 'crash_player_cashed_out', {
      username: player.username,
      multiplier: roomState.multiplier,
      payout,
      mode: 'manual',
      roomId,
    });

    emitSystemBigWin(player.username, payout, 'crash');

    callback?.({ ok: true, payout, multiplier: roomState.multiplier, mode: 'manual', roomId });
  });

  socket.on('disconnect', () => {
    setUserActivity(socket.id, 'Offline');

    const disconnectLobbies = coinflipState.openLobbies.filter((lobby) => lobby.creatorSocketId === socket.id);
    if (disconnectLobbies.length > 0) {
      const profile = getSocketProfile(socket.id, username);
      let refundedTotal = 0;

      disconnectLobbies.forEach((lobby) => {
        refundedTotal += Number(lobby.amount || 0);
        io.to(COINFLIP_ROOM_ID).emit('coinflip_canceled', {
          lobbyId: lobby.id,
          creatorUsername: lobby.creatorUsername,
          refundAmount: Number(lobby.amount || 0),
          reason: 'disconnect_refund',
        });
      });

      coinflipState.openLobbies = coinflipState.openLobbies.filter((lobby) => lobby.creatorSocketId !== socket.id);
      coinflipState.status = 'waiting';

      if (refundedTotal > 0 && Number.isFinite(Number(profile.balance))) {
        profile.balance = Number(profile.balance) + refundedTotal;
        socketProfiles.set(socket.id, profile);
      }

      console.log(`[coinflip] auto-refund on disconnect user=${username} socketId=${socket.id} lobbies=${disconnectLobbies.length} refunded=${refundedTotal}`);
      emitCoinflipState();
    }

    onlineUsers.delete(socket.id);
    socketProfiles.delete(socket.id);
    const hasOtherSessions = Array.from(onlineUsers.values()).some((onlineUsername) => onlineUsername === username);
    if (!hasOtherSessions) {
      chatActiveUsers.delete(username);
    }
    userActivities.delete(socket.id);
    userActivityStartedAt.delete(socket.id);
    broadcastOnlineUsers();
    detachSocketFromRoom(socket, socket.data.crashRoomId);
    detachPokerSocket(socket, socket.data.pokerRoomId);
    detachBlackjackSocket(socket, socket.data.blackjackRoomId);
    detachRouletteSocket(socket, socket.data.rouletteRoomId);

    const genericRoomId = socket.data.genericRoomId;
    if (genericRoomId) {
      const roomMembers = genericRooms.get(genericRoomId);
      if (roomMembers) {
        roomMembers.delete(socket.id);
        if (roomMembers.size === 0) {
          genericRooms.delete(genericRoomId);
        }
      }
      emitGenericRoomUpdate(genericRoomId);
    }
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Neon Vault game server running on http://${HOST}:${PORT}`);
});

void loadMaintenanceStateFromApp().catch(() => null);
startMaintenanceTimer();

function settleCrashRoomsForShutdown() {
  crashRooms.forEach((room) => {
    if (room.crashResetTimer) {
      clearTimeout(room.crashResetTimer);
      room.crashResetTimer = null;
    }

    if (room.phase === 'running') {
      room.phase = 'crashed';
      room.resolvingCrash = false;
      room.crashPoint = Number(room.multiplier || room.crashPoint || 1);
      room.history = [room.crashPoint, ...room.history].slice(0, 16);
      emitToCrashRoom(room.id, 'crash_crashed', {
        roomId: room.id,
        roundId: room.roundId,
        crashPoint: room.crashPoint,
        history: room.history,
        players: publicCrashPlayers(room),
      });
    }

    room.roundStartAt = 0;
    broadcastCrashState(room.id);
  });
}

function settleRouletteRoomsForShutdown() {
  rouletteRooms.forEach((room) => {
    io.to(rouletteChannel(room.id)).emit('roulette_server_shutdown', {
      roomId: room.id,
      message: 'Server restarting. Reconnecting shortly...',
      at: Date.now(),
    });
    broadcastRouletteRoomMembers(room.id);
  });
}

function settlePokerRoomsForShutdown() {
  pokerRooms.forEach((room) => {
    clearPokerTurnTimer(room);
    broadcastPokerState(room.id);
  });
}

function gracefulShutdown(signal) {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`[shutdown] Received ${signal}. Starting graceful shutdown...`);

  clearInterval(crashEngineInterval);
  if (maintenanceTimer) { clearInterval(maintenanceTimer); maintenanceTimer = null; }
  stopRainTimers();
  if (globalEventEndTimer) { clearTimeout(globalEventEndTimer); globalEventEndTimer = null; }
  if (globalEventLoopTimer) { clearInterval(globalEventLoopTimer); globalEventLoopTimer = null; }
  if (globalRainDropTimer) { clearInterval(globalRainDropTimer); globalRainDropTimer = null; }

  settleCrashRoomsForShutdown();
  settleRouletteRoomsForShutdown();
  settlePokerRoomsForShutdown();

  io.emit('server_shutdown', {
    reason: 'restart',
    reconnecting: true,
    signal,
    at: Date.now(),
  });

  const forceExitTimer = setTimeout(() => {
    console.error('[shutdown] Timed out waiting for graceful shutdown. Forcing exit.');
    process.exit(1);
  }, 12000);
  forceExitTimer.unref();

  server.close(() => {
    io.close(() => {
      clearTimeout(forceExitTimer);
      console.log('[shutdown] Graceful shutdown complete.');
      process.exit(0);
    });
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
