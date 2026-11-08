import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins/magic-link";
import { getEnv } from "@/config/env";
import { getDb } from "@/db/client";
import { accounts, sessions, users, verifications } from "@/db/schema";
import { sendEmail } from "./email";
import { magicLinkTemplate, resetPasswordTemplate, verifyEmailTemplate } from "./email/templates";

/**
 * Anmeldung mit Better Auth (Modul M3b, Entscheidung F-16):
 * - E-Mail + Passwort, E-Mail muss bestätigt sein, bevor man sich anmelden kann
 * - E-Mail-Link ohne Passwort (legt bei Bedarf ein Konto an; die E-Mail gilt damit als bestätigt)
 * - Passwort vergessen
 * Sitzungen liegen in der eigenen Datenbank, das Cookie ist signiert (BETTER_AUTH_SECRET).
 */
function createAuth() {
  const env = getEnv();
  return betterAuth({
    appName: "melomio",
    baseURL: env.APP_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_BASE_URL],
    // Höchstens 3 Anmelde-/Registrierungsversuche pro 10 Sekunden und Gerät (Standardregeln von Better Auth)
    rateLimit: { enabled: env.AUTH_RATE_LIMIT === "on" },
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: { users, sessions, accounts, verifications },
    }),
    user: { modelName: "users" },
    session: {
      modelName: "sessions",
      expiresIn: 60 * 60 * 24 * 30, // 30 Tage angemeldet bleiben
      updateAge: 60 * 60 * 24, // Sitzung höchstens einmal pro Tag verlängern
    },
    account: { modelName: "accounts" },
    verification: { modelName: "verifications" },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          userId: user.id,
          template: "reset-password",
          ...resetPasswordTemplate({ name: user.name, url }),
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          userId: user.id,
          template: "verify-email",
          ...verifyEmailTemplate({ name: user.name, url }),
        });
      },
    },
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        sendMagicLink: async ({ email, url }) => {
          await sendEmail({ to: email, template: "magic-link", ...magicLinkTemplate({ url }) });
        },
      }),
      nextCookies(), // muss das letzte Plugin sein
    ],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** Die Anmelde-Instanz wird erst beim ersten Gebrauch erzeugt (nicht schon beim Bauen der App). */
export function getAuth() {
  instance ??= createAuth();
  return instance;
}
