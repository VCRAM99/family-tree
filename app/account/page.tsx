import { AccountForm } from "@/components/account-form";
import { TopBar } from "@/components/top-bar";
import { requireUser } from "@/lib/server/session";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <TopBar user={user} />
      <AccountForm name={user.name} email={user.email} />
    </>
  );
}
