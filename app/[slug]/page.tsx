import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { headers } from "next/headers";

import { PublicTreeScreen } from "@/components/public-tree-screen";
import { getPublicTreeByTag, getTreeByCode } from "@/lib/server/public-tree";
import { getCurrentUser } from "@/lib/server/session";
import { readViewerIdentity } from "@/lib/server/viewer-identity";
import { resolveSlug, viewerPath } from "@/lib/viewer-url";

async function requestIp() {
  const headerStore = await headers();
  return headerStore.get("x-forwarded-for")?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || "local";
}

const loadByCode = cache(async (code: string) => getTreeByCode(code, await requestIp()));
const loadByTag = cache(async (tag: string) => getPublicTreeByTag(tag, await requestIp()));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const kind = resolveSlug(slug);
  if (kind === "share_code") {
    const view = await loadByCode(slug);
    if (!view) return { title: "Tree not found", robots: { index: false, follow: false } };
    return {
      title: view.summary.name,
      description: "A private family archive.",
      robots: { index: false, follow: false },
    };
  }
  if (kind === "public_tag") {
    const view = await loadByTag(slug);
    if (!view) return { title: "Tree not found", robots: { index: false, follow: false } };
    return {
      title: view.summary.name,
      description: view.summary.description ?? `The ${view.summary.name} family tree.`,
      robots: { index: true, follow: true },
    };
  }
  return { title: "Tree not found", robots: { index: false, follow: false } };
}

export default async function ViewerSlugPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ person?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const kind = resolveSlug(slug);
  if (kind !== "share_code" && kind !== "public_tag") notFound();
  const view = kind === "share_code" ? await loadByCode(slug) : await loadByTag(slug);
  if (!view) notFound();
  const slugValue = kind === "share_code" ? slug.trim().toUpperCase() : view.summary.publicTag;
  if (!slugValue) notFound();
  const user = await getCurrentUser();
  const identity = user ? await readViewerIdentity(user.id, view.summary.id).catch(() => null) : null;
  return (
    <PublicTreeScreen
      view={view}
      basePath={viewerPath(slugValue)}
      user={user}
      viewerPersonId={identity?.personId ?? null}
      requestedPersonId={typeof query.person === "string" ? query.person : null}
    />
  );
}
