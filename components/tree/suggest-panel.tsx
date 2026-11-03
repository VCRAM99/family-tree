"use client";

import { useState, useTransition } from "react";

import { suggestAction } from "@/app/view-actions";
import { Button } from "@/components/button";

export function SuggestPanel({
  treeId,
  personId,
  allowSuggestions,
  socialsEnabled,
  signedIn,
  returnPath,
}: {
  treeId: string;
  personId: string;
  allowSuggestions: boolean;
  socialsEnabled: boolean;
  signedIn: boolean;
  returnPath: string;
}) {
  const [mode, setMode] = useState<"person" | "contact" | "correction" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!allowSuggestions) return null;

  const signIn = `/?next=${encodeURIComponent(returnPath)}`;

  function submit(formData: FormData) {
    if (!mode) return;
    setMessage(null);
    startTransition(async () => {
      const result = await suggestAction(treeId, {
        type: mode === "person" ? "new_person" : mode === "contact" ? "contact_update" : "correction",
        targetPersonId: personId,
        payload:
          mode === "person"
            ? {
                firstName: String(formData.get("firstName") ?? ""),
                lastName: String(formData.get("lastName") ?? ""),
                relation: String(formData.get("relation") ?? ""),
                parentRole: String(formData.get("parentRole") ?? ""),
              }
            : mode === "contact"
              ? {
                  phoneWhatsapp: String(formData.get("phoneWhatsapp") ?? ""),
                  email: String(formData.get("email") ?? ""),
                  instagram: String(formData.get("instagram") ?? ""),
                  facebook: String(formData.get("facebook") ?? ""),
                  currentLocation: String(formData.get("currentLocation") ?? ""),
                }
              : {
                  patch: {
                    firstName: String(formData.get("firstName") ?? ""),
                    bio: String(formData.get("bio") ?? ""),
                  },
                },
      });
      setMessage(result.error ?? "Suggestion sent. An admin can review it.");
      if (!result.error) setMode(null);
    });
  }

  return (
    <section className="rounded-[2rem] border border-border bg-surface p-5">
      <h2 className="font-display text-3xl">Suggestions</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">Propose a change. An admin decides whether it becomes part of the tree.</p>
      {!signedIn ? (
        <a href={signIn} className="mt-4 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm text-surface">
          Sign in to suggest
        </a>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <Button tooltip="Suggest a relative of this person" variant="secondary" onClick={() => setMode("person")}>
            Suggest a person
          </Button>
          {socialsEnabled ? (
            <Button tooltip="Offer your phone, email, or social links for this person" variant="secondary" onClick={() => setMode("contact")}>
              Add my contact info
            </Button>
          ) : null}
          <Button tooltip="Propose a correction to this person's details" variant="secondary" onClick={() => setMode("correction")}>
            Suggest a correction
          </Button>
        </div>
      )}
      {mode && signedIn ? (
        <form
          className="mt-4 flex flex-col gap-3"
          action={(formData) => {
            submit(formData);
          }}
        >
          {mode === "person" ? (
            <>
              <input name="firstName" required placeholder="First name" className="h-11 rounded-2xl border border-border bg-background px-3" />
              <input name="lastName" placeholder="Last name" className="h-11 rounded-2xl border border-border bg-background px-3" />
              <select name="relation" className="h-11 rounded-2xl border border-border bg-background px-3" defaultValue="child">
                <option value="parent">Parent</option>
                <option value="child">Child</option>
                <option value="sibling">Sibling</option>
                <option value="spouse">Spouse</option>
              </select>
              <select name="parentRole" className="h-11 rounded-2xl border border-border bg-background px-3" defaultValue="father">
                <option value="father">Father, if this is a parent</option>
                <option value="mother">Mother, if this is a parent</option>
              </select>
            </>
          ) : null}
          {mode === "contact" ? (
            <>
              <input name="phoneWhatsapp" placeholder="Phone / WhatsApp" className="h-11 rounded-2xl border border-border bg-background px-3" />
              <input name="email" placeholder="Email" className="h-11 rounded-2xl border border-border bg-background px-3" />
              <input name="instagram" placeholder="Instagram" className="h-11 rounded-2xl border border-border bg-background px-3" />
              <input name="facebook" placeholder="Facebook" className="h-11 rounded-2xl border border-border bg-background px-3" />
              <input name="currentLocation" placeholder="Current place" className="h-11 rounded-2xl border border-border bg-background px-3" />
            </>
          ) : null}
          {mode === "correction" ? (
            <>
              <input name="firstName" placeholder="Corrected first name" className="h-11 rounded-2xl border border-border bg-background px-3" />
              <textarea name="bio" placeholder="Corrected biography" rows={3} className="rounded-2xl border border-border bg-background px-3 py-2" />
            </>
          ) : null}
          <Button tooltip="Send this suggestion to the tree admins" type="submit" disabled={pending}>
            {pending ? "Sending" : "Send suggestion"}
          </Button>
        </form>
      ) : null}
      {message ? <p className="mt-3 text-sm text-muted">{message}</p> : null}
    </section>
  );
}
