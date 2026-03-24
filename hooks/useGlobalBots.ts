'use client';

import { useEffect, useMemo, useState } from 'react';

type VipRank = 'Bronze' | 'Silver' | 'Gold' | 'Neon';

type BotEventType = 'bet' | 'win' | 'chat';

export interface BotProfile {
  id: string;
  name: string;
  vipRank: VipRank;
  favoriteGame: 'Crash' | 'Slots' | 'Blackjack' | 'Roulette' | "Hold'em";
}

export interface BotEvent {
  id: string;
  type: BotEventType;
  botId: string;
  botName: string;
  vipRank: VipRank;
  game: BotProfile['favoriteGame'];
  message: string;
  amount?: number;
  multiplier?: number;
  createdAt: number;
}

const BOT_PROFILES: BotProfile[] = [
  { id: '1', name: 'CryptoKing', vipRank: 'Neon', favoriteGame: 'Crash' },
  { id: '2', name: 'ApeFrenzy', vipRank: 'Gold', favoriteGame: 'Slots' },
  { id: '3', name: 'ShadowMint', vipRank: 'Silver', favoriteGame: 'Blackjack' },
  { id: '4', name: 'ZeroLatency', vipRank: 'Neon', favoriteGame: 'Roulette' },
  { id: '5', name: 'MoonCircuit', vipRank: 'Gold', favoriteGame: "Hold'em" },
  { id: '6', name: 'LuckyByte', vipRank: 'Bronze', favoriteGame: 'Slots' },
  { id: '7', name: 'NovaWhale', vipRank: 'Neon', favoriteGame: 'Crash' },
  { id: '8', name: 'ColdWallet77', vipRank: 'Silver', favoriteGame: 'Roulette' },
  { id: '9', name: 'TiltProof', vipRank: 'Bronze', favoriteGame: 'Blackjack' },
  { id: '10', name: 'MintMirage', vipRank: 'Gold', favoriteGame: 'Crash' },
];

const CHAT_LINES = [
  'Slots are paying today!',
  'Crash lobby feels hot right now.',
  'Dealer is showing a six, I am staying calm.',
  'Anyone else farming quests tonight?',
  'That wheel looked suspiciously clean.',
  'VIP faucet just carried my session.',
  'Provably fair hash looks blessed.',
  'Holding for a bigger multiplier this round.',
];

const FEED_LIMIT = 24;

function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOne<T>(items: T[]) {
  return items[Math.floor(Math.random() * items.length)];
}

function getVipColor(rank: VipRank) {
  switch (rank) {
    case 'Neon':
      return 'text-cyan-300';
    case 'Gold':
      return 'text-amber-300';
    case 'Silver':
      return 'text-slate-300';
    case 'Bronze':
    default:
      return 'text-orange-300';
  }
}

function createBotEvent(): BotEvent {
  const bot = pickOne(BOT_PROFILES);
  const roll = Math.random();
  const createdAt = Date.now();

  if (roll < 0.38) {
    const amount = randomBetween(50, 2_500);
    return {
      id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'bet',
      botId: bot.id,
      botName: bot.name,
      vipRank: bot.vipRank,
      game: bot.favoriteGame,
      amount,
      message: `entered ${bot.favoriteGame} with ${amount.toLocaleString()} NVC`,
      createdAt,
    };
  }

  if (roll < 0.72) {
    const multiplier = Number((Math.random() * 12 + 1.2).toFixed(2));
    const amount = Math.round(randomBetween(120, 4_000) * multiplier);
    return {
      id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'win',
      botId: bot.id,
      botName: bot.name,
      vipRank: bot.vipRank,
      game: bot.favoriteGame,
      amount,
      multiplier,
      message: `cashed out ${amount.toLocaleString()} NVC at ${multiplier}x`,
      createdAt,
    };
  }

  return {
    id: `${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'chat',
    botId: bot.id,
    botName: bot.name,
    vipRank: bot.vipRank,
    game: bot.favoriteGame,
    message: pickOne(CHAT_LINES),
    createdAt,
  };
}

export function useGlobalBots() {
  const [events, setEvents] = useState<BotEvent[]>([]);

  useEffect(() => {
    let timeoutId: number | null = null;

    const queueNextEvent = (delay: number) => {
      timeoutId = window.setTimeout(() => {
        setEvents((current) => {
          if (current.length === 0) {
            return Array.from({ length: 8 }, () => createBotEvent()).sort(
              (a, b) => b.createdAt - a.createdAt
            );
          }

          return [createBotEvent(), ...current].slice(0, FEED_LIMIT);
        });
        queueNextEvent(randomBetween(1_000, 3_000));
      }, delay);
    };

    queueNextEvent(0);

    return () => {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const botColors = useMemo(
    () =>
      BOT_PROFILES.reduce<Record<string, string>>((acc, bot) => {
        acc[bot.id] = getVipColor(bot.vipRank);
        return acc;
      }, {}),
    []
  );

  return {
    bots: BOT_PROFILES,
    events,
    botColors,
  };
}
