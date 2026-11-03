import { notFound } from "next/navigation";

import { PublishTreeTheme } from "@/components/theme-provider";
import { TopBar } from "@/components/top-bar";
import { getTreeRole } from "@/lib/server/authz";
import { requireUser } from "@/lib/server/session";
import { getTreeTheme } from "@/lib/server/trees";

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
  const theme = await getTreeTheme(id);

  return (
    <>
      <PublishTreeTheme theme={theme} />
      <TopBar user={user} />
      {children}
    </>
  );
}
