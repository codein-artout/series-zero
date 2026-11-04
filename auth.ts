/**
 * Auth.js v5: email magic link (the link is printed to the server console in dev; no mail is sent)
 * and a one-click guest account. JWT sessions.
 */
import { randomUUID } from "node:crypto";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db/client";
import { szAdapter } from "@/lib/server/auth-adapter";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: szAdapter(),
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET ?? "dev-only-secret-change-me",
  trustHost: true,
  pages: { signIn: "/signin", verifyRequest: "/signin?sent=1" },
  providers: [
    {
      id: "email",
      type: "email",
      name: "Email",
      maxAge: 24 * 60 * 60,
      from: "no-reply@series-zero.local",
      async sendVerificationRequest({ identifier, url }: { identifier: string; url: string }) {
        // Dev transport: log only. Nothing is ever emailed in v1.
        console.log(`\n[auth] Magic link for ${identifier}:\n${url}\n`);
      },
      options: {},
    } as never,
    Credentials({
      id: "guest",
      name: "Guest",
      credentials: {},
      async authorize() {
        const db = await prisma();
        const id = `user_${randomUUID()}`;
        const u = await db.user.create({ data: { id, name: `Guest ${id.slice(5, 9).toUpperCase()}`, isGuest: true } });
        return { id: u.id, name: u.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) (session.user as { id?: string }).id = String(token.uid);
      return session;
    },
  },
});
