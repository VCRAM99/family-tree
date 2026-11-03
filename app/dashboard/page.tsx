import { DashboardView } from "@/components/dashboard-view";
import { listMyInvites } from "@/lib/server/invites";
import { requireUser } from "@/lib/server/session";
import { listMyTrees } from "@/lib/server/trees";

export default async function DashboardPage() {
  const user = await requireUser();
  const [trees, invites] = await Promise.all([listMyTrees(user.id), listMyInvites(user.id)]);
  return <DashboardView trees={trees} invites={invites} />;
}
