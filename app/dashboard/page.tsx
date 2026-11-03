import { DashboardView } from "@/components/dashboard-view";
import { requireUser } from "@/lib/server/session";
import { listMyTrees } from "@/lib/server/trees";

export default async function DashboardPage() {
  const user = await requireUser();
  const trees = await listMyTrees(user.id);
  return <DashboardView trees={trees} />;
}
