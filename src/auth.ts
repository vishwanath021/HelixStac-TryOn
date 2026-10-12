import NextAuth, { CredentialsSignin, type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { createHash } from "node:crypto";
import { z } from "zod";
import { checkUserTotp } from "@/lib/account-totp";
import { numberEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { requestClientIp, sharedRateLimit } from "@/lib/ratelimit";
import { revokeUserSessions, sessionIsCurrent } from "@/lib/session-revocation";

class LoginLimited extends CredentialsSignin {
  code = "rate_limit";
}

class TotpRequired extends CredentialsSignin {
  code = "totp_required";
}

class TotpInvalid extends CredentialsSignin {
  code = "totp_invalid";
}

const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const secureCookies = process.env.NODE_ENV === "production";

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
  totp: z.string().max(40).optional(),
});

async function assertTotp(user: { id: string; totpEnabled: boolean; totpSecretCipher: string; recoveryCodeHashes: string }, code: string) {
  const result = await checkUserTotp(user, code);
  if (result === "missing") throw new TotpRequired();
  if (result === "invalid") throw new TotpInvalid();
}

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
    sessionVersion: user.sessionVersion,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  cookies: {
    sessionToken: {
      name: secureCookies ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: secureCookies },
    },
  },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "credentials",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authenticator code", type: "text" },
      },
      authorize: async (credentials, request) => {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        const ip = request ? requestClientIp(request) : "unknown";
        const windowMs = 15 * 60 * 1000;
        const byIp = await sharedRateLimit(`login:ip:${ip}`, numberEnv("LOGIN_IP_LIMIT", 30), windowMs);
        const byEmail = await sharedRateLimit(`login:${email}`, numberEnv("LOGIN_LIMIT", 8), windowMs);
        if (!byIp.ok || !byEmail.ok) throw new LoginLimited();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        const ok = await compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        await assertTotp(user, parsed.data.totp || "");
        return userToSession(email);
      },
    }),
    Credentials({
      id: "magic",
      name: "Magic link",
      credentials: {
        token: { label: "Token", type: "text" },
        totp: { label: "Authenticator code", type: "text" },
      },
      authorize: async (credentials) => {
        const token = typeof credentials?.token === "string" ? credentials.token : "";
        const totp = typeof credentials?.totp === "string" ? credentials.totp : "";
        if (token.length < 20) return null;
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const link = await prisma.magicLink.findUnique({ where: { tokenHash } });
        if (!link || link.used || link.expiresAt.getTime() < Date.now()) return null;
        const user = await prisma.user.findUnique({ where: { email: link.email.toLowerCase() } });
        if (!user) return null;
        await assertTotp(user, totp);
        await prisma.magicLink.update({ where: { id: link.id }, data: { used: true } });
        return userToSession(link.email.toLowerCase());
      },
    }),
  ],
  events: {
    async signOut(message) {
      if (!("token" in message) || !message.token) return;
      const id = String(message.token.id || message.token.sub || "");
      if (id) await revokeUserSessions(id);
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const extra = user as typeof user & { isSuperAdmin?: boolean; tenantId?: string; role?: string; sessionVersion?: number };
        token.id = user.id;
        token.isSuperAdmin = extra.isSuperAdmin ?? false;
        token.tenantId = extra.tenantId;
        token.role = extra.role;
        token.sessionVersion = extra.sessionVersion ?? 0;
      }
      if (token.id) {
        try {
          const fresh = await prisma.user.findUnique({ where: { id: String(token.id) } });
          if (!fresh || !sessionIsCurrent(token.sessionVersion, fresh.sessionVersion)) {
            token.id = "";
            token.sub = "";
            token.isSuperAdmin = false;
            token.role = undefined;
            token.tenantId = undefined;
            return token;
          }
          const preferred = typeof token.tenantId === "string" ? token.tenantId : "";
          const membership = preferred
            ? await prisma.membership.findUnique({ where: { userId_tenantId: { userId: fresh.id, tenantId: preferred } } })
            : await prisma.membership.findFirst({ where: { userId: fresh.id }, orderBy: { role: "asc" } });
          token.sessionVersion = fresh.sessionVersion;
          token.isSuperAdmin = fresh.isSuperAdmin;
          token.role = membership?.role;
          token.tenantId = membership?.tenantId;
          token.email = fresh.email;
        } catch {
          // Keep the last claims when the database is briefly unreachable.
        }
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
