import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { user } from "@/lib/db/auth-schema";

import { withTestDatabase } from "./helpers/db";

function visible(result: { token: string | null; user: { email: string; name: string; emailVerified: boolean } }) {
  return { token: result.token, email: result.user.email, name: result.user.name, emailVerified: result.user.emailVerified };
}

describe("unverified accounts", () => {
  it("sends verification on sign-in, resends for an unverified sign-up, and stays quiet for a verified email", async () => {
    process.env.BETTER_AUTH_SECRET = "test-secret-test-secret-test-secret";
    process.env.BETTER_AUTH_URL = "http://localhost:3000";
    await withTestDatabase(async (db) => {
      const { auth } = await import("@/lib/server/auth");
      const { drainTestOutbox } = await import("@/lib/server/email");
      drainTestOutbox();
      const email = "ada@example.com";
      const body = { name: "Ada", email, password: "password123", callbackURL: "/" };

      const created = await auth.api.signUpEmail({ body });
      const firstMail = drainTestOutbox();
      expect(firstMail).toHaveLength(1);
      expect(firstMail[0]?.subject).toMatch(/verify/i);

      const again = await auth.api.signUpEmail({ body });
      const resent = drainTestOutbox();
      expect(resent).toHaveLength(1);
      expect(visible(again)).toEqual(visible(created));

      await db.update(user).set({ emailVerified: true }).where(eq(user.email, email));
      const verified = await auth.api.signUpEmail({ body });
      expect(drainTestOutbox()).toEqual([]);
      expect(visible(verified)).toEqual(visible(again));

      await db.update(user).set({ emailVerified: false }).where(eq(user.email, email));
      await expect(auth.api.signInEmail({ body: { email, password: "password123", callbackURL: "/" } })).rejects.toThrow();
      expect(drainTestOutbox()).toHaveLength(1);

      const resend = await auth.api.sendVerificationEmail({ body: { email, callbackURL: "/" } });
      expect(resend).toEqual({ status: true });
      expect(drainTestOutbox()).toHaveLength(1);
    });
  });
});
