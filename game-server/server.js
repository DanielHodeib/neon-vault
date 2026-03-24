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

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

const app = express();

const allowedOrigins = new Set([CLIENT_ORIGIN, ...CLIENT_ORIGINS, 'http://localhost:3000', 'http://127.0.0.1:3000']);

function isLanHost(hostname) {
  return /^(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
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
let chatHistory = [];
const crashRooms = new Map();
const pokerRooms = new Map();
const blackjackRooms = new Map();

function generateCrashPoint() {
  const random = Math.random();
  const shaped = 1.05 + Math.pow(random, 0.52) * 8.7;
  return Number(shaped.toFixed(2));
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
    history: [],
    players: new Map(),
    sockets: new Set(),
    roundStartAt: Date.now() + 5000,
  };

  crashRooms.set(id, room);
  return room;
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
    board: [],
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

function publicBlackjackState(room) {
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
  io.to(blackjackChannel(room.id)).emit('blackjack_state', publicBlackjackState(room));
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

function broadcastOnlineUsers() {
  io.emit('online_users', Array.from(onlineUsers.values()));
}

function setUserActivity(socketId, activity) {
  userActivities.set(socketId, activity);
}

function getUserActivity(socketId) {
  return userActivities.get(socketId) || 'Hub';
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

function broadcastCrashState(roomId) {
  const room = getCrashRoom(roomId);
  io.to(roomChannel(room.id)).emit('crash_state', {
    roomId: room.id,
    phase: room.phase,
    multiplier: room.multiplier,
    crashPoint: room.phase === 'crashed' ? room.crashPoint : null,
    history: room.history,
    players: publicCrashPlayers(room),
    roundStartAt: room.roundStartAt,
  });
}

function broadcastCrashRoomMembers(roomId) {
  const room = getCrashRoom(roomId);
  io.to(roomChannel(room.id)).emit('crash_room_members', {
    roomId: room.id,
    members: publicCrashRoomMembers(room),
  });
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
  room.board = [];
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
}

function startPokerRound(roomId) {
  const room = getPokerRoom(roomId);
  const players = Array.from(room.players.values());
  if (players.length < 2) {
    return;
  }

  if (!players.every((player) => player.ready)) {
    return;
  }

  const deck = createDeck();
  room.started = true;
  room.stage = 'preflop';
  room.board = [];
  room.winnerSocketId = null;
  room.winnerLabel = '';

  room.players.forEach((player) => {
    player.folded = false;
    player.hand = [deck.pop(), deck.pop()];
    player.actionText = 'in hand';
  });

  broadcastPokerState(room.id);

  setTimeout(() => {
    room.stage = 'flop';
    room.board = [deck.pop(), deck.pop(), deck.pop()];
    broadcastPokerState(room.id);
  }, 1400);

  setTimeout(() => {
    room.stage = 'turn';
    room.board.push(deck.pop());
    broadcastPokerState(room.id);
  }, 2800);

  setTimeout(() => {
    room.stage = 'river';
    room.board.push(deck.pop());
    broadcastPokerState(room.id);
  }, 4200);

  setTimeout(() => {
    room.stage = 'showdown';
    resolvePokerWinner(room);
    broadcastPokerState(room.id);
  }, 5600);

  setTimeout(() => {
    resetPokerRound(room);
    broadcastPokerState(room.id);
  }, 8600);
}

function startCrashRound(roomId) {
  const room = getCrashRoom(roomId);
  room.phase = 'running';
  room.multiplier = 1;
  room.crashPoint = generateCrashPoint();

  io.to(roomChannel(room.id)).emit('crash_round_started', {
    roomId: room.id,
    crashPointHidden: true,
  });

  broadcastCrashState(room.id);
}

function crashRoundNow(roomId) {
  const room = getCrashRoom(roomId);
  room.phase = 'crashed';
  room.history = [room.crashPoint, ...room.history].slice(0, 16);

  io.to(roomChannel(room.id)).emit('crash_crashed', {
    roomId: room.id,
    crashPoint: room.crashPoint,
    history: room.history,
    players: publicCrashPlayers(room),
  });

  room.players.clear();
  room.multiplier = 1;
  room.roundStartAt = Date.now() + 5000;
  broadcastCrashState(room.id);
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
  socket.leave(pokerChannel(roomId));

  if (room.id !== 'global' && room.sockets.size === 0) {
    pokerRooms.delete(room.id);
    return;
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
    folded: false,
    hand: [],
    actionText: 'waiting',
  });
  socket.data.pokerRoomId = room.id;
  socket.join(pokerChannel(room.id));
  broadcastPokerState(room.id);
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

setInterval(() => {
  crashRooms.forEach((room, roomId) => {
    if (room.phase === 'waiting') {
      if (Date.now() >= room.roundStartAt) {
        startCrashRound(roomId);
      }
      return;
    }

    if (room.phase !== 'running') {
      return;
    }

    room.multiplier = Number((room.multiplier + 0.01 * (room.multiplier * 1.24)).toFixed(4));

    io.to(roomChannel(roomId)).emit('crash_tick', {
      roomId,
      multiplier: room.multiplier,
      players: publicCrashPlayers(room),
    });

    if (room.multiplier >= room.crashPoint) {
      crashRoundNow(roomId);
      return;
    }

    const eligible = Array.from(room.players.values()).filter((player) => player.autoCashOut > 1.01 && !player.cashedOut);
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
          roomId,
        });

        io.to(roomChannel(roomId)).emit('crash_player_cashed_out', {
          username: player.username,
          multiplier: player.autoCashOut,
          payout,
          mode: 'auto',
          roomId,
        });
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

  res.json({
    status: 'ok',
    onlineUsers: onlineUsers.size,
    crashRooms: crashRoomStates,
    pokerRooms: pokerRoomStates,
    blackjackRooms: blackjackRoomStates,
  });
});

io.on('connection', (socket) => {
  const rawName = socket.handshake.query.username;
  const username = (typeof rawName === 'string' && rawName.trim()) || `Guest-${socket.id.slice(0, 6)}`;

  onlineUsers.set(socket.id, username);
  setUserActivity(socket.id, 'Hub');
  broadcastOnlineUsers();

  socket.emit('chat_history', chatHistory);

  const initialCrashRoomId = sanitizeRoomId(socket.handshake.query.crashRoomId);
  const crashRoom = attachSocketToRoom(socket, initialCrashRoomId);
  socket.emit('crash_room_joined', { ok: true, roomId: crashRoom.id });

  const initialPokerRoomId = sanitizeRoomId(socket.handshake.query.pokerRoomId);
  const pokerRoom = attachPokerSocket(socket, initialPokerRoomId, username);
  socket.emit('poker_room_joined', { ok: true, roomId: pokerRoom.id });

  const initialBlackjackRoomId = sanitizeRoomId(socket.handshake.query.blackjackRoomId);
  const blackjackRoom = attachBlackjackSocket(socket, initialBlackjackRoomId, username);
  socket.emit('blackjack_room_joined', { ok: true, roomId: blackjackRoom.id });

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
  });

  socket.on('join_blackjack_room', (payload, callback) => {
    const desired = sanitizeRoomId(payload?.roomId);
    const nextRoom = attachBlackjackSocket(socket, desired, username);

    setUserActivity(socket.id, 'Blackjack');
    callback?.({ ok: true, roomId: nextRoom.id });
    socket.emit('blackjack_room_joined', { ok: true, roomId: nextRoom.id });
  });

  socket.on('blackjack_start_round', (_payload, callback) => {
    const roomId = socket.data.blackjackRoomId;
    const result = startBlackjackRound(roomId);
    callback?.(result);
  });

  socket.on('blackjack_hit', (_payload, callback) => {
    const roomId = socket.data.blackjackRoomId;
    const room = getBlackjackRoom(roomId);
    const player = room.players.get(socket.id);

    if (!player) {
      callback?.({ ok: false, error: 'Not in blackjack room.' });
      return;
    }

    if (room.stage !== 'playing') {
      callback?.({ ok: false, error: 'No active round.' });
      return;
    }

    if (player.stood || player.busted) {
      callback?.({ ok: false, error: 'Player already done.' });
      return;
    }

    player.hand.push(room.deck.pop());
    player.busted = blackjackHandValue(player.hand) > 21;
    if (player.busted) {
      player.resultText = 'Bust';
    }

    broadcastBlackjackState(room.id);
    maybeResolveBlackjackRound(room);
    callback?.({ ok: true });
  });

  socket.on('blackjack_stand', (_payload, callback) => {
    const roomId = socket.data.blackjackRoomId;
    const room = getBlackjackRoom(roomId);
    const player = room.players.get(socket.id);

    if (!player) {
      callback?.({ ok: false, error: 'Not in blackjack room.' });
      return;
    }

    if (room.stage !== 'playing') {
      callback?.({ ok: false, error: 'No active round.' });
      return;
    }

    if (player.stood || player.busted) {
      callback?.({ ok: false, error: 'Player already done.' });
      return;
    }

    player.stood = true;
    player.resultText = 'Stand';
    broadcastBlackjackState(room.id);
    maybeResolveBlackjackRound(room);
    callback?.({ ok: true });
  });

  socket.on('poker_set_ready', (payload, callback) => {
    const roomId = socket.data.pokerRoomId;
    const room = getPokerRoom(roomId);
    const player = room.players.get(socket.id);

    if (!player) {
      callback?.({ ok: false, error: 'Not in poker room.' });
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

    const remaining = Array.from(room.players.values()).filter((p) => !p.folded);
    if (remaining.length <= 1) {
      room.stage = 'showdown';
      resolvePokerWinner(room);
    }

    broadcastPokerState(room.id);
    callback?.({ ok: true });
  });

  socket.on('send_chat_message', (payload) => {
    const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
    if (!text) {
      return;
    }

    const message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      username,
      text: text.slice(0, 280),
      createdAt: Date.now(),
    };

    chatHistory = [...chatHistory, message].slice(-80);
    io.emit('chat_message', message);
  });

  socket.on('crash_place_bet', (payload, callback) => {
    setUserActivity(socket.id, 'Crash');
    const roomId = socket.data.crashRoomId;
    const roomState = getCrashRoom(roomId);
    const amount = Number(payload?.amount ?? 0);
    const autoCashOut = Number(payload?.autoCashOut ?? 0);

    if (roomState.phase !== 'waiting') {
      callback?.({ ok: false, error: 'Round already running.' });
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      callback?.({ ok: false, error: 'Invalid amount.' });
      return;
    }

    roomState.players.set(socket.id, {
      socketId: socket.id,
      username,
      amount: Math.floor(amount),
      autoCashOut: Number.isFinite(autoCashOut) ? autoCashOut : 0,
      cashedOut: false,
      cashedAt: null,
    });

    io.to(roomChannel(roomId)).emit('crash_players', publicCrashPlayers(roomState));
    callback?.({ ok: true, roomId });
  });

  socket.on('crash_cashout', (_payload, callback) => {
    const roomId = socket.data.crashRoomId;
    const roomState = getCrashRoom(roomId);

    if (roomState.phase !== 'running') {
      callback?.({ ok: false, error: 'Round is not running.' });
      return;
    }

    const player = roomState.players.get(socket.id);
    if (!player || player.cashedOut) {
      callback?.({ ok: false, error: 'No active crash bet.' });
      return;
    }

    player.cashedOut = true;
    player.cashedAt = roomState.multiplier;

    const payout = Number((player.amount * roomState.multiplier).toFixed(2));

    io.to(roomChannel(roomId)).emit('crash_player_cashed_out', {
      username: player.username,
      multiplier: roomState.multiplier,
      payout,
      mode: 'manual',
      roomId,
    });

    callback?.({ ok: true, payout, multiplier: roomState.multiplier, mode: 'manual', roomId });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    userActivities.delete(socket.id);
    broadcastOnlineUsers();
    detachSocketFromRoom(socket, socket.data.crashRoomId);
    detachPokerSocket(socket, socket.data.pokerRoomId);
    detachBlackjackSocket(socket, socket.data.blackjackRoomId);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Neon Vault game server running on http://${HOST}:${PORT}`);
});
