import { TopBar } from "@/components/top-bar";
import { requireUser } from "@/lib/server/session";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <TopBar user={user} />
      {children}
    </>
  );
}
