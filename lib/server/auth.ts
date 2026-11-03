import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { nextCookies } from "better-auth/next-js";

import { account, rateLimit, session, user, verification } from "@/lib/db/schema";

import { getDb } from "./db";
import { sendEmail } from "./email";

function appUrl(): string {
  return process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: appUrl(),
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
      void sendEmail({
        to: accountUser.email,
        subject: "Reset your Family Tree password",
        text: `Reset your password:\n${url}\n\nIf you did not ask for this, you can ignore this email.`,
      }).catch((error: unknown) => {
        console.error("[email] reset password failed", error);
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user: accountUser, url }) => {
      void sendEmail({
        to: accountUser.email,
        subject: "Verify your Family Tree email",
        text: `Verify your email:\n${url}\n`,
      }).catch((error: unknown) => {
        console.error("[email] verification failed", error);
      });
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
  plugins: [nextCookies()],
});

export type SessionUser = {
  id: string;
  name: string;
  email: string;
};
