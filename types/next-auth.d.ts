import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
      balance: number;
      xp: number;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    username: string;
    role: string;
    balance: number;
    xp: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    username?: string;
    role?: string;
    balance?: number;
    xp?: number;
  }
}
