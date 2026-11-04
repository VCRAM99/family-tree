import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { headers } from "next/headers";

import { PublicTreeScreen } from "@/components/public-tree-screen";
import { getTreeByCode } from "@/lib/server/public-tree";
import { getCurrentUser } from "@/lib/server/session";
import { readViewerIdentity } from "@/lib/server/viewer-identity";

async function requestIp() {
  const headerStore = await headers();
  return headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || "local";
}

const loadTree = cache(async (code: string) => getTreeByCode(code, await requestIp()));

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const view = await loadTree(code);
  if (!view) return { title: "Tree not found", robots: { index: false, follow: false } };
  return {
    title: view.summary.name,
    description: "A private family archive.",
    robots: { index: false, follow: false },
    openGraph: {
      title: "Family Tree",
      description: "A private family archive.",
    },
  };
}

export default async function UnlistedCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ person?: string }>;
}) {
  const [{ code }, query] = await Promise.all([params, searchParams]);
  const view = await loadTree(code);
  if (!view) notFound();
  const user = await getCurrentUser();
  const identity = user ? await readViewerIdentity(user.id, view.summary.id).catch(() => null) : null;
  return (
    <PublicTreeScreen
        view={view}
        basePath={`/v/${code.trim().toUpperCase()}`}
        user={user}
        viewerPersonId={identity?.personId ?? null}
      requestedPersonId={typeof query.person === "string" ? query.person : null}
    />
  );
}
