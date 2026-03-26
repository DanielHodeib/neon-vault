const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 4001);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const ROOM_PREFIX = 'crash:';
const POKER_ROOM_PREFIX = 'poker:';
const BLACKJACK_ROOM_PREFIX = 'blackjack:';
const ROULETTE_ROOM_PREFIX = 'roulette:';
const COINFLIP_ROOM_ID = 'coinflip:global';
const CRASH_ROUND_WAIT_MS = 4000;
const CRASH_ROUND_CRASHED_MS = 1500;
const GLOBAL_CRASH_ROOM_ID = 'global';
const CHAT_ACTIVITY_WINDOW_MS = 10 * 60 * 1000;
const COINFLIP_HOUSE_FEE_RATE = 0.05;
const ROULETTE_WHEEL_NUMBERS = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

const app = express();

const allowedOrigins = new Set([CLIENT_ORIGIN, ...CLIENT_ORIGINS, 'http://localhost:3000', 'http://127.0.0.1:3000']);

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

const coinflipState = {
  openLobby: null,
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

function normalizeRole(rawRole) {
  const role = typeof rawRole === 'string' ? rawRole.trim().toUpperCase() : '';
  return role || 'USER';
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
  rawIsKing = false
) {
  const rank = rankFromXp(rawXp, rawBalance);
  const balance = Number.isFinite(Number(rawBalance)) ? Math.max(0, Math.floor(Number(rawBalance))) : 0;
  const displayed = rankFromSelection(rank.level, balance, selectedRankTag);
  const profile = {
    username,
    role: normalizeRole(rawRole),
    clanTag: normalizeClanTag(rawClanTag),
    balance,
    isKing: Boolean(rawIsKing),
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

  return upsertSocketProfile(socketId, usernameFallback, 0, undefined, Number.MAX_SAFE_INTEGER, 'USER', null, false);
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
    system: true,
  };

  chatHistory = [...chatHistory, message].slice(-80);
  io.emit('chat_message', message);
}

function coinflipPublicState() {
  return {
    openLobby: coinflipState.openLobby,
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

function getBlackjackPlayerStatus(room, socketId) {
  const player = room.players.get(socketId);
  if (room.stage !== 'playing') {
    return 'ROUND_OVER';
  }

  if (!player) {
    return 'WAITING';
  }

  return player.stood || player.busted ? 'WAITING' : 'PLAYER_TURN';
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
    dealerCards: visibleDealerCards,
    dealerValue: revealDealer ? blackjackHandValue(room.dealerHand) : blackjackHandValue(room.dealerHand.slice(0, 1)),
    players: Array.from(room.players.values()).map((player) => ({
      socketId: player.socketId,
      username: player.username,
      hand: player.hand,
      value: blackjackHandValue(player.hand),
      stood: player.stood,
      busted: player.busted,
      resultText: player.resultText,
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
  while (blackjackHandValue(room.dealerHand) < 17) {
    room.dealerHand.push(room.deck.pop());
  }

  const dealerValue = blackjackHandValue(room.dealerHand);
  room.players.forEach((player) => {
    const value = blackjackHandValue(player.hand);

    if (value > 21) {
      player.resultText = 'Bust';
      return;
    }

    if (dealerValue > 21 || value > dealerValue) {
      player.resultText = 'Win';
      return;
    }

    if (value === dealerValue) {
      player.resultText = 'Push';
      return;
    }

    player.resultText = 'Lose';
  });

  room.stage = 'result';
  room.message = 'Round complete';
  broadcastBlackjackState(room.id);
}

function maybeResolveBlackjackRound(room) {
  const activePlayers = Array.from(room.players.values());
  if (activePlayers.length === 0) {
    return;
  }

  const done = activePlayers.every((player) => player.stood || player.busted);
  if (!done) {
    return;
  }

  resolveBlackjackRound(room);
}

function startBlackjackRound(roomId) {
  const room = getBlackjackRoom(roomId);
  if (room.players.size === 0) {
    return { ok: false, error: 'No players in room.' };
  }

  room.deck = createDeck();
  room.dealerHand = [room.deck.pop(), room.deck.pop()];
  room.stage = 'playing';
  room.message = 'Players turn';

  room.players.forEach((player) => {
    player.hand = [room.deck.pop(), room.deck.pop()];
    player.stood = false;
    player.busted = blackjackHandValue(player.hand) > 21;
    player.resultText = '';
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

  if (player.stood || player.busted) {
    return { ok: false, error: 'Player already done.' };
  }

  player.hand.push(room.deck.pop());
  player.busted = blackjackHandValue(player.hand) > 21;
  if (player.busted) {
    player.resultText = 'Bust';
  }

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

  if (player.stood || player.busted) {
    return { ok: false, error: 'Player already done.' };
  }

  player.stood = true;
  player.resultText = 'Stand';
  broadcastBlackjackState(room.id);
  maybeResolveBlackjackRound(room);
  return { ok: true };
}

function createPokerRoomForSocket(socket, username) {
  const roomId = `pk-${Math.random().toString(36).slice(2, 8)}`;
  const room = attachPokerSocket(socket, roomId, username);
  io.to(socket.id).emit('poker_state', publicPokerState(room, socket.id));
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

function publicPokerState(room, targetSocketId) {
  const players = Array.from(room.players.values()).map((player) => ({
    socketId: player.socketId,
    username: player.username,
    ready: player.ready,
    folded: player.folded,
    hand: player.socketId === targetSocketId || room.stage === 'showdown' ? player.hand : ['??', '??'],
    actionText: player.actionText,
    isWinner: player.socketId === room.winnerSocketId,
  }));

  return {
    roomId: room.id,
    started: room.started,
    stage: room.stage,
    board: room.board,
    players,
    winnerLabel: room.winnerLabel,
  };
}

function broadcastPokerState(roomId) {
  const room = getPokerRoom(roomId);
  room.sockets.forEach((socketId) => {
    io.to(socketId).emit('poker_state', publicPokerState(room, socketId));
  });
}

function resetPokerRound(room) {
  room.started = false;
  room.stage = 'waiting';
  room.deck = [];
  room.board = [];
  room.actedSocketIds = new Set();
  room.winnerSocketId = null;
  room.winnerLabel = '';
  room.players.forEach((player) => {
    player.ready = false;
    player.folded = false;
    player.hand = [];
    player.actionText = 'waiting';
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
  room.winnerSocketId = winner.socketId;
  room.winnerLabel = `${winner.username} wins`;

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

  room.stage = 'showdown';
  resolvePokerWinner(room);
  broadcastPokerState(room.id);
  schedulePokerReset(room);
}

function maybeAdvancePokerStage(room) {
  if (!room.started || room.stage === 'waiting' || room.stage === 'showdown') {
    return;
  }

  const activePlayers = Array.from(room.players.values()).filter((player) => !player.folded);
  if (activePlayers.length <= 1) {
    completePokerShowdown(room);
    return;
  }

  const allActed = activePlayers.every((player) => room.actedSocketIds.has(player.socketId));
  if (!allActed) {
    return;
  }

  if (room.stage === 'preflop') {
    room.stage = 'flop';
    room.board = [room.deck.pop(), room.deck.pop(), room.deck.pop()];
  } else if (room.stage === 'flop') {
    room.stage = 'turn';
    room.board.push(room.deck.pop());
  } else if (room.stage === 'turn') {
    room.stage = 'river';
    room.board.push(room.deck.pop());
  } else {
    completePokerShowdown(room);
    return;
  }

  room.actedSocketIds = new Set();
  room.players.forEach((player) => {
    if (!player.folded) {
      player.actionText = 'in hand';
    }
  });
  broadcastPokerState(room.id);
}

function startPokerRound(roomId) {
  const room = getPokerRoom(roomId);
  const players = Array.from(room.players.values());
  if (players.length < 2) {
    return;
  }

  if (room.started) {
    return;
  }

  const deck = createDeck();
  room.started = true;
  room.stage = 'preflop';
  room.deck = deck;
  room.board = [];
  room.actedSocketIds = new Set();
  room.winnerSocketId = null;
  room.winnerLabel = '';

  room.players.forEach((player) => {
    player.ready = true;
    player.folded = false;
    player.hand = [room.deck.pop(), room.deck.pop()];
    player.actionText = 'in hand';
  });

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

  room.sockets.delete(socket.id);
  room.players.delete(socket.id);
  room.actedSocketIds.delete(socket.id);
  socket.leave(pokerChannel(roomId));

  if (room.id !== 'global' && room.sockets.size === 0) {
    pokerRooms.delete(room.id);
    return;
  }

  if (room.started) {
    maybeAdvancePokerStage(room);
  }

  broadcastPokerState(room.id);
}

function attachPokerSocket(socket, roomId, username) {
  const sanitized = sanitizeRoomId(roomId);
  const previousRoomId = socket.data.pokerRoomId;

  if (previousRoomId === sanitized) {
    return getPokerRoom(sanitized);
  }

  detachPokerSocket(socket, previousRoomId);

  const room = getPokerRoom(sanitized);
  room.sockets.add(socket.id);
  room.players.set(socket.id, {
    socketId: socket.id,
    username,
    ready: false,
    folded: room.started,
    hand: [],
    actionText: room.started ? 'waiting next hand' : 'waiting',
  });
  socket.data.pokerRoomId = room.id;
  socket.join(pokerChannel(room.id));

  // Immediately push poker_state to the full room when a player joins.
  io.to(pokerChannel(room.id)).emit('poker_state', publicPokerState(room, socket.id));
  broadcastPokerState(room.id);
  startPokerRound(room.id);
  return room;
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

function attachBlackjackSocket(socket, roomId, username) {
  const sanitized = sanitizeRoomId(roomId);
  const previousRoomId = socket.data.blackjackRoomId;

  if (previousRoomId === sanitized) {
    return getBlackjackRoom(sanitized);
  }

  detachBlackjackSocket(socket, previousRoomId);

  const room = getBlackjackRoom(sanitized);
  room.sockets.add(socket.id);
  room.players.set(socket.id, {
    socketId: socket.id,
    username,
    hand: [],
    stood: false,
    busted: false,
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

setInterval(() => {
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

    emitToCrashRoom(room.id, 'crash_tick', {
      roomId: room.id,
      roundId: room.roundId,
      multiplier: room.multiplier,
      players: publicCrashPlayers(room),
    });

    const eligible = Array.from(room.players.values()).filter(
      (player) => player.autoCashOut >= 1 && !player.cashedOut && player.roundId === room.roundId
    );
    eligible.forEach((player) => {
      if (room.multiplier >= player.autoCashOut) {
        const payout = Number((player.amount * player.autoCashOut).toFixed(2));
        player.cashedOut = true;
        player.cashedAt = player.autoCashOut;

        io.to(player.socketId).emit('crash_cashout_result', {
          ok: true,
          payout,
          multiplier: player.autoCashOut,
          mode: 'auto',
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
}, 90);

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
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const amount = Number.isFinite(Number(req.body?.amount)) ? Math.floor(Number(req.body.amount)) : 0;
  const source = typeof req.body?.source === 'string' ? req.body.source.trim().toLowerCase() : '';
  if (!username || amount <= 0) {
    return res.status(400).json({ ok: false, error: 'Invalid payload' });
  }

    emitSystemBigWin(username, amount, source);
  return res.json({ ok: true });
});

app.post('/internal/global-notification', (req, res) => {
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

app.post('/internal/admin-broadcast', (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 240) : '';
  if (!message) {
    return res.status(400).json({ ok: false, error: 'Message is required.' });
  }

  io.emit('admin_broadcast', {
    message,
    createdAt: Date.now(),
    from: 'Daniel',
  });

  return res.json({ ok: true });
});

app.post('/internal/rain/start', (req, res) => {
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

io.on('connection', (socket) => {
  const rawName = socket.handshake.query.username;
  const username = (typeof rawName === 'string' && rawName.trim()) || `Guest-${socket.id.slice(0, 6)}`;
  const initialXp = Number.isFinite(Number(socket.handshake.query.xp)) ? Number(socket.handshake.query.xp) : 0;
  const initialRole = typeof socket.handshake.query.role === 'string' ? socket.handshake.query.role : 'USER';
  const initialIsKing = socket.handshake.query.isKing === 'true' || socket.handshake.query.isKing === true;
  const initialClanTag =
    typeof socket.handshake.query.clanTag === 'string'
      ? socket.handshake.query.clanTag
      : typeof socket.handshake.query.clan === 'string'
        ? socket.handshake.query.clan
        : null;

  onlineUsers.set(socket.id, username);
  const initialSelectedRankTag = typeof socket.handshake.query.selectedRankTag === 'string' ? socket.handshake.query.selectedRankTag : undefined;
  const initialBalance = Number.isFinite(Number(socket.handshake.query.balance)) ? Number(socket.handshake.query.balance) : Number.MAX_SAFE_INTEGER;
  upsertSocketProfile(socket.id, username, initialXp, initialSelectedRankTag, initialBalance, initialRole, initialClanTag, initialIsKing);
  setUserActivity(socket.id, 'Hub');
  broadcastOnlineUsers();
  socket.join(COINFLIP_ROOM_ID);

  socket.emit('chat_history', chatHistory);
  socket.emit('coinflip_state', coinflipPublicState());
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
  const blackjackRoom = attachBlackjackSocket(socket, initialBlackjackRoomId, username);
  socket.emit('blackjack_room_joined', { ok: true, roomId: blackjackRoom.id });

  const initialRouletteRoomId = sanitizeRoomId(socket.handshake.query.rouletteRoomId);
  const rouletteRoom = attachRouletteSocket(socket, initialRouletteRoomId);
  socket.emit('roulette_room_joined', { ok: true, roomId: rouletteRoom.id });

  socket.on('joinRoom', (payload, callback) => {
    const normalizedPayload = typeof payload === 'string' ? { roomId: payload } : payload;
    const game = typeof normalizedPayload?.game === 'string' ? normalizedPayload.game.trim().toLowerCase() : 'poker';
    const desired = sanitizeRoomId(normalizedPayload?.roomId);

    if (game === 'blackjack') {
      const nextRoom = attachBlackjackSocket(socket, desired, username);
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
    const desired = sanitizeRoomId(payload?.roomId);
    const nextRoom = attachPokerSocket(socket, desired, username);

    setUserActivity(socket.id, "Poker");
    callback?.({ ok: true, roomId: nextRoom.id });
    socket.emit('poker_room_joined', { ok: true, roomId: nextRoom.id });
    socket.emit('poker_state', publicPokerState(nextRoom, socket.id));
  });

  socket.on('poker_create', (_payload, callback) => {
    const nextRoom = createPokerRoomForSocket(socket, username);

    setUserActivity(socket.id, 'Poker');
    callback?.({ ok: true, roomId: nextRoom.id });
    socket.emit('poker_room_joined', { ok: true, roomId: nextRoom.id });
  });

  socket.on('join_blackjack_room', (payload, callback) => {
    const desired = sanitizeRoomId(payload?.roomId);
    const nextRoom = attachBlackjackSocket(socket, desired, username);

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
    const message = typeof payload?.message === 'string' && payload.message.trim() ? payload.message.trim() : 'Du hast NVC erhalten!';

    if (!receiverUsername) {
      callback?.({ ok: false, error: 'receiverUsername is required.' });
      return;
    }

    const receiverSocketIds = getSocketIdsByUsername(receiverUsername).filter((socketId) => socketId !== socket.id);
    receiverSocketIds.forEach((receiverSocketId) => {
      io.to(receiverSocketId).emit('notification', { message });
    });

    callback?.({ ok: true, delivered: receiverSocketIds.length });
  });

  socket.on('roulette_spin_request', (_payload, callback) => {
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

    const result = spinRouletteResult();
    const roundId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    io.to(rouletteChannel(roomId)).emit('roulette_spin_result', {
      roomId,
      roundId,
      winningNumber: result.winningNumber,
      winningIndex: result.winningIndex,
      wheelSize: result.wheelSize,
      emittedAt: Date.now(),
      initiatedBy: username,
    });

    callback?.({
      ok: true,
      roomId,
      roundId,
      winningNumber: result.winningNumber,
      winningIndex: result.winningIndex,
      wheelSize: result.wheelSize,
    });
  });

  socket.on('profile_sync', (payload, callback) => {
    const xp = Number.isFinite(Number(payload?.xp)) ? Number(payload.xp) : 0;
    const balance = Number.isFinite(Number(payload?.balance)) ? Number(payload.balance) : Number.MAX_SAFE_INTEGER;
    const name = typeof payload?.username === 'string' && payload.username.trim() ? payload.username.trim() : username;
    const role = typeof payload?.role === 'string' ? payload.role : 'USER';
    const isKing = payload?.isKing === true;
    const clanTag =
      typeof payload?.clanTag === 'string'
        ? payload.clanTag
        : typeof payload?.clan === 'string'
          ? payload.clan
          : null;
    const selectedRankTag = typeof payload?.selectedRankTag === 'string' ? payload.selectedRankTag : undefined;
    const profile = upsertSocketProfile(socket.id, name, xp, selectedRankTag, balance, role, clanTag, isKing);
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
    const profile = getSocketProfile(socket.id, username);
    const isAdmin = String(profile.role).toUpperCase() === 'ADMIN';
    if (!isAdmin) {
      callback?.({ ok: false, error: 'Only admins can start rain.' });
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

    if (coinflipState.openLobby) {
      callback?.({ ok: false, error: 'An open coinflip already exists.' });
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

    coinflipState.openLobby = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      amount,
      creatorSocketId: socket.id,
      creatorUsername: username,
      createdAt: Date.now(),
    };
    coinflipState.lastResult = null;
    emitCoinflipState();
    callback?.({ ok: true, lobby: coinflipState.openLobby });
  });

  socket.on('coinflip_cancel', (_payload, callback) => {
    if (!coinflipState.openLobby) {
      callback?.({ ok: false, error: 'No open coinflip.' });
      return;
    }

    if (coinflipState.openLobby.creatorSocketId !== socket.id) {
      callback?.({ ok: false, error: 'Only creator can cancel.' });
      return;
    }

    const refundAmount = coinflipState.openLobby.amount;
    const profile = getSocketProfile(socket.id, username);
    profile.balance = Number(profile.balance) + refundAmount;
    socketProfiles.set(socket.id, profile);

    const canceledLobbyId = coinflipState.openLobby.id;
    coinflipState.openLobby = null;
    emitCoinflipState();
    io.to(COINFLIP_ROOM_ID).emit('coinflip_canceled', {
      lobbyId: canceledLobbyId,
      creatorUsername: username,
      refundAmount,
    });
    callback?.({ ok: true, refundAmount });
  });

  socket.on('coinflip_join', (_payload, callback) => {
    const lobby = coinflipState.openLobby;
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

    joinerProfile.balance = Number(joinerProfile.balance) - lobby.amount;
    socketProfiles.set(socket.id, joinerProfile);

    const creatorProfile = getSocketProfile(lobby.creatorSocketId, lobby.creatorUsername);
    const winnerIsCreator = Math.random() < 0.5;
    const winnerUsername = winnerIsCreator ? lobby.creatorUsername : username;
    const winnerSocketId = winnerIsCreator ? lobby.creatorSocketId : socket.id;
    const loserUsername = winnerIsCreator ? username : lobby.creatorUsername;
    const pot = lobby.amount * 2;
    const payout = Math.floor(pot * (1 - COINFLIP_HOUSE_FEE_RATE));
    const fee = pot - payout;

    const winnerProfile = winnerIsCreator ? creatorProfile : joinerProfile;
    winnerProfile.balance = Number(winnerProfile.balance) + payout;
    socketProfiles.set(winnerSocketId, winnerProfile);

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
    coinflipState.openLobby = null;

    io.to(COINFLIP_ROOM_ID).emit('coinflip_result', coinflipState.lastResult);
    emitCoinflipState();

    if (payout >= HIGH_ROLLER_THRESHOLD) {
      emitSystemBigWin(winnerUsername, payout, 'coinflip');
    }

    callback?.({ ok: true, result: coinflipState.lastResult });
  });

  socket.on('blackjack_start_round', (_payload, callback) => {
    const roomId = socket.data.blackjackRoomId;
    const result = startBlackjackRound(roomId);
    callback?.(result);
  });

  socket.on('blackjack_deal', (payload, callback) => {
    const roomId = socket.data.blackjackRoomId;
    const result = startBlackjackRound(roomId);

    if (!result.ok) {
      callback?.(result);
      return;
    }

    const room = getBlackjackRoom(roomId);
    const player = room.players.get(socket.id);
    if (player) {
      const amount = Math.floor(Number(payload?.amount ?? 0));
      player.bet = Number.isFinite(amount) && amount > 0 ? amount : 0;
    }

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
    const roomId = socket.data.blackjackRoomId;
    const room = getBlackjackRoom(roomId);
    const action = typeof payload?.action === 'string' ? payload.action.toLowerCase() : '';

    if (action === 'hit') {
      callback?.(applyBlackjackHit(room, socket.id));
      return;
    }

    if (action === 'stand') {
      callback?.(applyBlackjackStand(room, socket.id));
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

  socket.on('poker_action', (payload, callback) => {
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

    const action = typeof payload?.action === 'string' ? payload.action : 'check';

    if (action === 'fold') {
      player.folded = true;
      player.actionText = 'folded';
    } else if (action === 'call') {
      player.actionText = 'call';
    } else {
      player.actionText = 'check';
    }

    room.actedSocketIds.add(socket.id);
    broadcastPokerState(room.id);
    maybeAdvancePokerStage(room);
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

  socket.on('admin_broadcast', (payload, callback) => {
    const profile = getSocketProfile(socket.id, username);
    const isDanielAdmin = profile.username === 'Daniel' && String(profile.role).toUpperCase() === 'ADMIN';
    if (!isDanielAdmin) {
      callback?.({ ok: false, error: 'Unauthorized broadcast sender.' });
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
      from: 'Daniel',
    });

    callback?.({ ok: true });
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

    const existingBet = roomState.players.get(socket.id);
    if (existingBet && !existingBet.cashedOut) {
      console.warn(`[crash_place_bet] duplicate bet user=${username} room=${roomId} amount=${existingBet.amount}`);
      callback?.({ ok: false, error: 'Bet already placed for this round.' });
      return;
    }

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

    const hadBet = roomState.players.delete(socket.id);
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

    const payout = Number((player.amount * roomState.multiplier).toFixed(2));

    io.to(socket.id).emit('crash_cashout_result', {
      ok: true,
      payout,
      multiplier: roomState.multiplier,
      mode: 'manual',
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

    if (coinflipState.openLobby && coinflipState.openLobby.creatorSocketId === socket.id) {
      const canceledLobbyId = coinflipState.openLobby.id;
      coinflipState.openLobby = null;
      emitCoinflipState();
      io.to(COINFLIP_ROOM_ID).emit('coinflip_canceled', {
        lobbyId: canceledLobbyId,
        creatorUsername: username,
        refundAmount: 0,
      });
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
