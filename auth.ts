import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

import { prisma } from '@/lib/prisma';

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  trustHost: true,
  providers: [
    Credentials({
      name: 'Username & Password',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const username = credentials?.username?.toString().trim();
        const password = credentials?.password?.toString();

        if (!username || !password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { username },
        });

        if (!user) {
          return null;
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
          return null;
        }

        const banRows = (await prisma.$queryRawUnsafe(
          `SELECT is_banned FROM users WHERE id = ? LIMIT 1`,
          user.id
        )) as Array<{ is_banned: number | boolean | null }>;
        const bannedValue = banRows[0]?.is_banned;
        const isBanned = bannedValue === true || bannedValue === 1;
        if (isBanned) {
          return null;
        }

        return {
          id: user.id,
          name: user.username,
          username: user.username,
          balance: user.balance,
          xp: user.xp,
        } as {
          id: string;
          name: string;
          username: string;
          balance: number;
          xp: number;
        };
      },
    }),
  ],
  pages: {
    signIn: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const typedUser = user as {
          id: string;
          username: string;
          balance: number;
          xp: number;
        };

        token.userId = typedUser.id;
        token.username = typedUser.username;
        token.balance = typedUser.balance;
        token.xp = typedUser.xp;
      }

      if (!token.userId && token.sub) {
        token.userId = token.sub;
      }

      if (!token.username && typeof token.name === 'string') {
        token.username = token.name;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = ((token.userId as string) ?? (token.sub as string) ?? '');
        session.user.name =
          ((token.username as string) ??
            (typeof token.name === 'string' ? token.name : '') ??
            session.user.name ??
            '');
        session.user.balance = (token.balance as number) ?? 0;
        session.user.xp = (token.xp as number) ?? 0;
      }

      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});
