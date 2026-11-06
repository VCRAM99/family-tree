import { notFound } from "next/navigation";

import { TopBar } from "@/components/top-bar";
import { getTreeRole } from "@/lib/server/authz";
import { pendingSuggestionCount } from "@/lib/server/suggestions";
import { requireUser } from "@/lib/server/session";

export default async function TreeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const role = await getTreeRole(user.id, id);
  if (!role) notFound();
  const suggestionCount = await pendingSuggestionCount(user.id, id);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <TopBar user={user} suggestions={{ href: `/tree/${id}/suggestions`, count: suggestionCount }} />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
