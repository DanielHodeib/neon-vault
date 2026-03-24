import { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      balance: number;
      xp: number;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    username: string;
    balance: number;
    xp: number;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string;
    username?: string;
    balance?: number;
    xp?: number;
  }
}
