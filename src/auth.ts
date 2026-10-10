import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { numberEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/ratelimit";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      isSuperAdmin: boolean;
      tenantId?: string;
      role?: string;
    } & DefaultSession["user"];
  }
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

async function userToSession(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  const membership = await prisma.membership.findFirst({ where: { userId: user.id }, orderBy: { role: "asc" } });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: user.isSuperAdmin,
    tenantId: membership?.tenantId,
    role: membership?.role,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        const limit = rateLimit(`login:${email}`, numberEnv("LOGIN_LIMIT", 8), 15 * 60 * 1000);
        if (!limit.ok) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        const ok = await compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return userToSession(email);
      },
    }),
    Credentials({
      id: "magic",
      name: "Magic link",
      credentials: { token: { label: "Token", type: "text" } },
      authorize: async (credentials) => {
        const token = typeof credentials?.token === "string" ? credentials.token : "";
        if (token.length < 20) return null;
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const link = await prisma.magicLink.findUnique({ where: { tokenHash } });
        if (!link || link.used || link.expiresAt.getTime() < Date.now()) return null;
        await prisma.magicLink.update({ where: { id: link.id }, data: { used: true } });
        return userToSession(link.email.toLowerCase());
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const extra = user as typeof user & { isSuperAdmin?: boolean; tenantId?: string; role?: string };
        token.id = user.id;
        token.isSuperAdmin = extra.isSuperAdmin ?? false;
        token.tenantId = extra.tenantId;
        token.role = extra.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.id || token.sub || "");
      session.user.isSuperAdmin = Boolean(token.isSuperAdmin);
      session.user.tenantId = token.tenantId as string | undefined;
      session.user.role = token.role as string | undefined;
      return session;
    },
  },
});
