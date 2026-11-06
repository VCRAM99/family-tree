import { Suspense } from "react";
import Link from "next/link";

import { TreeExperience } from "@/components/tree/tree-experience";
import { Tooltip } from "@/components/tooltip";
import type { PersonField } from "@/lib/domain";
import { PERSON_FIELDS } from "@/lib/domain";
import { defaultPersonId } from "@/lib/family-graph";
import type { PublicTreeView } from "@/lib/server/public-tree";
import type { SessionUser } from "@/lib/server/auth";

export function PublicTreeScreen({
  view,
  basePath,
  user,
  viewerPersonId,
  requestedPersonId,
}: {
  view: PublicTreeView;
  basePath: string;
  user: SessionUser | null;
  viewerPersonId: string | null;
  requestedPersonId: string | null;
}) {
  const visibleFields = view.summary.visibleFields.filter((field): field is PersonField =>
    (PERSON_FIELDS as readonly string[]).includes(field),
  );
  const signIn = `/?next=${encodeURIComponent(basePath)}`;

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
        <div>
          <p className="text-xs tracking-[0.22em] text-muted uppercase">{view.summary.visibility === "public" ? "Public" : "Unlisted"}</p>
          <p className="font-display text-2xl tracking-tight">{view.summary.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <Tooltip content="Back to your trees" side="bottom">
              <Link href="/dashboard" className="inline-flex h-11 items-center rounded-full border border-border px-4 text-sm">
                Your trees
              </Link>
            </Tooltip>
          ) : (
            <Tooltip content="Sign in to mark yourself and send suggestions" side="bottom">
              <Link href={signIn} className="inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-surface">
                Sign in
              </Link>
            </Tooltip>
          )}
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense>
          <TreeExperience
            id={view.summary.id}
            name={view.summary.name}
            photosEnabled={view.summary.photosEnabled}
            socialsEnabled={view.summary.socialsEnabled}
            customFieldDefs={view.summary.customFieldDefs}
            canEdit={false}
            visibleFields={visibleFields}
            viewerPersonId={viewerPersonId}
            initialPersonId={defaultPersonId(view.graph, viewerPersonId, requestedPersonId)}
            graph={view.graph}
            basePath={basePath}
            publicMode
            allowSuggestions={view.summary.allowSuggestions}
            signedIn={Boolean(user)}
          />
        </Suspense>
      </div>
    </div>
  );
}
