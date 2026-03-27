CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  passwordHash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'USER',
  balance TEXT NOT NULL DEFAULT '10000.00',
  xp INTEGER NOT NULL DEFAULT 0,
  daily_stats_date TEXT NOT NULL DEFAULT '',
  daily_bets INTEGER NOT NULL DEFAULT 0,
  daily_wins INTEGER NOT NULL DEFAULT 0,
  daily_faucet_claimed INTEGER NOT NULL DEFAULT 0,
  daily_quest_claimed INTEGER NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  soundEnabled INTEGER NOT NULL DEFAULT 1,
  theme TEXT NOT NULL DEFAULT 'slate',
  selected_rank_tag TEXT NOT NULL DEFAULT 'BRONZE',
  public_profile INTEGER NOT NULL DEFAULT 1,
  bio TEXT NOT NULL DEFAULT '',
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quest_progress (
  user_id TEXT PRIMARY KEY,
  daily_date TEXT NOT NULL,
  daily_slots_rounds INTEGER NOT NULL DEFAULT 0,
  daily_claimed INTEGER NOT NULL DEFAULT 0,
  weekly_date TEXT NOT NULL,
  weekly_slots_rounds INTEGER NOT NULL DEFAULT 0,
  weekly_bet_actions INTEGER NOT NULL DEFAULT 0,
  weekly_win_actions INTEGER NOT NULL DEFAULT 0,
  weekly_claimed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  blocked_user_id TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, blocked_user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (blocked_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS blocks_blocked_user_id_idx ON blocks(blocked_user_id);

CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, friend_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (friend_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS friendships_friend_id_idx ON friendships(friend_id);
