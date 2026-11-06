import { AccountForm } from "@/components/account-form";
import { TopBar } from "@/components/top-bar";
import { getCurrentUser } from "@/lib/server/session";
import { resolveDocumentTheme } from "@/lib/server/theme";

export default async function AccountPage() {
  const [user, theme] = await Promise.all([getCurrentUser(), resolveDocumentTheme()]);
  return (
    <>
      {user ? <TopBar user={user} /> : null}
      <AccountForm name={user?.name ?? ""} email={user?.email ?? ""} theme={theme} signedIn={Boolean(user)} />
    </>
  );
}
