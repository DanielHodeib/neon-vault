import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';

import { prisma } from '@/lib/prisma';

function isBanExpired(date: Date | null) {
  return Boolean(date) && Number(date?.getTime()) <= Date.now();
}

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
          select: {
            id: true,
            username: true,
            passwordHash: true,
            role: true,
            balance: true,
            xp: true,
            isBanned: true,
            banExpiresAt: true,
          },
        });

        if (!user) {
          return null;
        }

        const validPassword = await bcrypt.compare(password, user.passwordHash);
        if (!validPassword) {
          return null;
        }

        if (user.isBanned) {
          if (isBanExpired(user.banExpiresAt ?? null)) {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                isBanned: false,
                banExpiresAt: null,
                banReason: null,
              },
            });
          } else {
            return null;
          }
        }

        return {
          id: user.id,
          name: user.username,
          username: user.username,
          role: user.role,
          balance: Number(user.balance),
          xp: user.xp,
        } as {
          id: string;
          name: string;
          username: string;
          role: string;
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
          role: string;
          balance: number;
          xp: number;
        };

        token.userId = typedUser.id;
        token.username = typedUser.username;
        token.role = typedUser.role;
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
        session.user.role = (token.role as string) ?? 'USER';
        session.user.balance = (token.balance as number) ?? 0;
        session.user.xp = (token.xp as number) ?? 0;
      }

      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});
