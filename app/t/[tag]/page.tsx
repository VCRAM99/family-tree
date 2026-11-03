import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { headers } from "next/headers";

import { PublicTreeScreen } from "@/components/public-tree-screen";
import { getPublicTreeByTag } from "@/lib/server/public-tree";
import { getCurrentUser } from "@/lib/server/session";
import { readViewerIdentity } from "@/lib/server/viewer-identity";

async function requestIp() {
  const headerStore = await headers();
  return headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || "local";
}

const loadTree = cache(async (tag: string) => getPublicTreeByTag(tag, await requestIp()));

export async function generateMetadata({ params }: { params: Promise<{ tag: string }> }): Promise<Metadata> {
  const { tag } = await params;
  const view = await loadTree(tag);
  if (!view) return { title: "Tree not found" };
  return {
    title: view.summary.name,
    description: view.summary.description ?? `The ${view.summary.name} family tree.`,
    robots: { index: true, follow: true },
  };
}

export default async function PublicTagPage({
  params,
  searchParams,
}: {
  params: Promise<{ tag: string }>;
  searchParams: Promise<{ person?: string }>;
}) {
  const [{ tag }, query] = await Promise.all([params, searchParams]);
  const view = await loadTree(tag);
  if (!view || !view.summary.publicTag) notFound();
  const user = await getCurrentUser();
  const identity = user ? await readViewerIdentity(user.id, view.summary.id).catch(() => null) : null;
  return (
    <PublicTreeScreen
      view={view}
      basePath={`/t/${view.summary.publicTag}`}
      user={user}
      viewerPersonId={identity?.personId ?? null}
      requestedPersonId={typeof query.person === "string" ? query.person : null}
    />
  );
}
