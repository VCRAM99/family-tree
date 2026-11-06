import { permanentRedirect } from "next/navigation";

import { legacyCodePath } from "@/lib/viewer-url";

export default async function LegacyCodePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  permanentRedirect(legacyCodePath(code));
}
