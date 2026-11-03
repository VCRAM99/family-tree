"use client";

import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

import { Button } from "@/components/button";

export function SignOutButton() {
  const router = useRouter();

  return (
    <Button
      tooltip="Sign out of Family Tree"
      tooltipSide="bottom"
      variant="ghost"
      className="h-9 px-3"
      onClick={() => {
        void authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              router.push("/");
              router.refresh();
            },
          },
        });
      }}
    >
      Sign out
    </Button>
  );
}
