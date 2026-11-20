'use client';

import type { Role } from '@prisma/client';
import { type LucideIcon } from 'lucide-react';

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };

export type Notification = { id: string; title: string; message: string; link: string | null; friendId: string | null; isRead: boolean; createdAt: string };

export type User = { username: string; avatarUrl: string | null; frame: string | null; level: number; role: Role; theme: string };
