# Neon Vault Game Server

## Start

1. `cd game-server`
2. `npm install`
3. `npm run dev`

Server defaults to `http://localhost:5000`.

## Env

- `PORT` (default: `5000`)
- `CLIENT_ORIGIN` (default: `http://localhost:3000`)

## Features

- Global Socket.io connection hub
- Online user presence (`online_users`)
- Global chat (`chat_message`, `chat_history`)
- Centralized multiplayer Crash round engine
  - Waiting phase
  - Shared multiplier ticks (`crash_tick`)
  - Crash event (`crash_crashed`)
  - Bet registration (`crash_place_bet`)
  - Manual and auto cashout
