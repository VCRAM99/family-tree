import { permanentRedirect } from "next/navigation";

import { legacyTagPath } from "@/lib/viewer-url";

export default async function LegacyTagPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  permanentRedirect(legacyTagPath(tag));
}
