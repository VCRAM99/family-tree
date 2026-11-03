import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth, type SessionUser } from "./auth";

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return user;
}
