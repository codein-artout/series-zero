/** Minimal Auth.js adapter over our Prisma models (users, accounts, verification tokens). */
import { randomUUID } from "node:crypto";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { prisma } from "@/lib/db/client";

type Row = { id: string; email: string | null; emailVerified: Date | null; name: string | null; image: string | null };

const toUser = (u: Row): AdapterUser => ({ id: u.id, email: u.email ?? `${u.id}@guest.local`, emailVerified: u.emailVerified, name: u.name, image: u.image });

export function szAdapter(): Adapter {
  return {
    async createUser(user) {
      const db = await prisma();
      const u = await db.user.create({ data: { id: `user_${randomUUID()}`, email: user.email?.toLowerCase(), emailVerified: user.emailVerified ?? null, name: user.name ?? null, image: user.image ?? null } });
      return toUser(u);
    },
    async getUser(id) {
      const db = await prisma();
      const u = await db.user.findUnique({ where: { id } });
      return u ? toUser(u) : null;
    },
    async getUserByEmail(email) {
      const db = await prisma();
      const u = await db.user.findUnique({ where: { email: email.toLowerCase() } });
      return u ? toUser(u) : null;
    },
    async getUserByAccount({ provider, providerAccountId }) {
      const db = await prisma();
      const a = await db.account.findUnique({ where: { provider_providerAccountId: { provider, providerAccountId } } });
      if (!a) return null;
      const u = await db.user.findUnique({ where: { id: a.userId } });
      return u ? toUser(u) : null;
    },
    async updateUser(user) {
      const db = await prisma();
      const u = await db.user.update({ where: { id: user.id }, data: { email: user.email?.toLowerCase(), emailVerified: user.emailVerified ?? undefined, name: user.name ?? undefined } });
      return toUser(u);
    },
    async linkAccount(account) {
      const db = await prisma();
      await db.account.create({ data: { id: randomUUID(), userId: account.userId, type: account.type, provider: account.provider, providerAccountId: account.providerAccountId } });
      return account;
    },
    async createVerificationToken(t) {
      const db = await prisma();
      await db.verificationToken.create({ data: t });
      return t;
    },
    async useVerificationToken({ identifier, token }) {
      const db = await prisma();
      const t = await db.verificationToken.findUnique({ where: { token } });
      if (!t || t.identifier !== identifier) return null;
      await db.verificationToken.delete({ where: { token } });
      return t;
    },
  };
}
