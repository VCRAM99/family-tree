import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";

import { account, rateLimit, session, user, verification } from "@/lib/db/schema";

import { getDb } from "./db";
import { deliverEmail } from "./email";
import { brandedEmail } from "./email-templates";

function appUrl(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

const productionOrigin = "https://familytree.varunsr.com";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: appUrl(),
  trustedOrigins: [productionOrigin, appUrl()],
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  database: drizzleAdapter(getDb(), {
    provider: "pg",
    transaction: true,
    schema: { user, session, account, verification, rateLimit },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    autoSignIn: false,
    sendResetPassword: async ({ user: accountUser, url }) => {
      const message = brandedEmail({
        subject: "Reset your Family Tree password",
        eyebrow: "Family Tree",
        title: "Reset your password",
        paragraphs: ["Use the link below to choose a new password. If you did not ask for this, you can ignore this email."],
        action: { label: "Choose a new password", href: url },
      });
      deliverEmail("reset", { to: accountUser.email, ...message });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user: accountUser, url }) => {
      const message = brandedEmail({
        subject: "Verify your Family Tree email",
        eyebrow: "Family Tree",
        title: "Verify your email",
        paragraphs: ["Confirm this address to finish creating your account."],
        action: { label: "Verify email", href: url },
      });
      deliverEmail("verification", { to: accountUser.email, ...message });
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 10, max: 3 },
      "/sign-up/email": { window: 60, max: 5 },
      "/request-password-reset": { window: 60, max: 3 },
      "/send-verification-email": { window: 60, max: 3 },
    },
  },
  databaseHooks: {
    user: {
      update: {
        after: async (accountUser) => {
          if (!accountUser.emailVerified) return;
          const { claimPendingInvites } = await import("./invites");
          await claimPendingInvites(accountUser.id).catch((error: unknown) => {
            console.error("[invites] could not attach pending invites", error);
          });
        },
      },
    },
  },
  plugins: [nextCookies()],
});

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};
