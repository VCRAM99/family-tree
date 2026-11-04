"use client";

import { useEffect, useState, useTransition } from "react";

import { checkPublicTagAction, regenerateShareCodeAction, saveSettingsAction } from "@/app/tree/[id]/settings/actions";
import { AdminManager, type AdminRow } from "@/components/admin-manager";
import { Button } from "@/components/button";
import { Tooltip } from "@/components/tooltip";
import { useThemePreview } from "@/components/theme-provider";
import { MAX_NODE_EXTRA_LINES, NODE_EXTRA_FIELDS, type CustomFieldDef, type CustomFieldType } from "@/lib/domain";
import { PERSON_FIELD_LABELS, PERSON_FIELDS, THEME_IDS, THEME_LABELS, type PersonField, type ThemeId } from "@/lib/themes";

export type SettingsTree = {
  id: string;
  name: string;
  description: string | null;
  visibility: "private" | "unlisted" | "public";
  publicTag: string | null;
  shareCode: string;
  allowSuggestions: boolean;
  socialsEnabled: boolean;
  photosEnabled: boolean;
  hideLivingDetails: boolean;
  notifySuggestions: boolean;
  visibleFields: PersonField[];
  theme: ThemeId;
  customFieldDefs: CustomFieldDef[];
  role: "owner" | "admin";
};

const swatch: Record<ThemeId, [string, string, string, string]> = {
  system: ["#f6f4f0", "#1c1917", "#3a6ea5", "#c45b7c"],
  light: ["#f6f4f0", "#1c1917", "#3a6ea5", "#c45b7c"],
  dark: ["#121110", "#f4f0e8", "#8eb4dd", "#f0a8bf"],
  papyrus: ["#f3e6c8", "#3a2a1a", "#3d6d8a", "#a85a6a"],
  "dark-paper": ["#16130f", "#f3ead7", "#7ea4c8", "#e09aaf"],
  "sepia-archive": ["#f4efe4", "#3e3426", "#4d6480", "#8d5a66"],
  blueprint: ["#0d2744", "#e7f0ff", "#8ec5ff", "#f3b4c8"],
  "sage-botanical": ["#eef2e6", "#243026", "#3e6f8a", "#a85d78"],
};

export function SettingsForm({ tree, admins = [] }: { tree: SettingsTree; admins?: AdminRow[] }) {
  const setPreview = useThemePreview();
  const isOwner = tree.role === "owner";
  const [name, setName] = useState(tree.name);
  const [description, setDescription] = useState(tree.description ?? "");
  const [visibility, setVisibility] = useState(tree.visibility);
  const [publicTag, setPublicTag] = useState(tree.publicTag ?? "");
  const [tagMessage, setTagMessage] = useState<string | null>(null);
  const [tagAvailable, setTagAvailable] = useState<boolean | null>(null);
  const [shareCode, setShareCode] = useState(tree.shareCode.trim());
  const [copied, setCopied] = useState(false);
  const [allowSuggestions, setAllowSuggestions] = useState(tree.allowSuggestions);
  const [socialsEnabled, setSocialsEnabled] = useState(tree.socialsEnabled);
  const [photosEnabled, setPhotosEnabled] = useState(tree.photosEnabled);
  const [hideLivingDetails, setHideLivingDetails] = useState(tree.hideLivingDetails);
  const [notifySuggestions, setNotifySuggestions] = useState(tree.notifySuggestions);
  const [visibleFields, setVisibleFields] = useState<PersonField[]>(tree.visibleFields);
  const [theme, setTheme] = useState<ThemeId>(tree.theme);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>(tree.customFieldDefs);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    return () => setPreview(null);
  }, [setPreview]);

  useEffect(() => {
    if (!isOwner || visibility !== "public") return;
    const handle = window.setTimeout(() => {
      void checkPublicTagAction(tree.id, publicTag).then((result) => {
        if ("error" in result) {
          setTagMessage(result.error);
          setTagAvailable(false);
          return;
        }
        setTagMessage(result.message);
        setTagAvailable(result.available);
      });
    }, 250);
    return () => window.clearTimeout(handle);
  }, [isOwner, publicTag, tree.id, visibility]);

  function updateCustom(key: string, patch: Partial<CustomFieldDef>) {
    setCustomFieldDefs((current) => current.map((field) => (field.key === key ? { ...field, ...patch } : field)));
  }

  function toggleField(field: PersonField) {
    setVisibleFields((current) => {
      if (current.includes(field)) return current.filter((item) => item !== field);
      const extra = NODE_EXTRA_FIELDS.includes(field as (typeof NODE_EXTRA_FIELDS)[number]);
      const extraCount = current.filter((item) => NODE_EXTRA_FIELDS.includes(item as (typeof NODE_EXTRA_FIELDS)[number])).length;
      if (extra && extraCount >= MAX_NODE_EXTRA_LINES) return current;
      return [...current, field];
    });
  }

  return (
    <form
      className="mx-auto grid w-full max-w-5xl gap-12 px-6 pb-24 sm:px-10 lg:grid-cols-[minmax(0,1fr)_18rem]"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        setSaved(false);
        startTransition(async () => {
          const result = await saveSettingsAction(tree.id, {
            name,
            description,
            visibility,
            publicTag,
            allowSuggestions,
            socialsEnabled,
            photosEnabled,
            hideLivingDetails,
            notifySuggestions,
            visibleFields,
            theme,
            customFieldDefs,
          });
          if (result.error) setError(result.error);
          else setSaved(true);
        });
      }}
    >
      <div>
        <p className="pt-6 text-xs tracking-[0.22em] text-muted uppercase">Settings</p>
        <h1 className="mt-3 font-display text-5xl tracking-tight">{tree.name}</h1>

        <section className="mt-10 flex flex-col gap-4">
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-muted">Name</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="h-12 rounded-2xl border border-border bg-surface px-4" />
          </label>
          <label className="flex flex-col gap-2 text-sm">
            <span className="text-muted">Description</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="rounded-2xl border border-border bg-surface px-4 py-3" />
          </label>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-3xl">Visibility</h2>
          <p className="mt-2 text-sm text-muted">Only the owner can change who is able to find this tree.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {(["private", "unlisted", "public"] as const).map((option) => (
              <Button
                key={option}
                tooltip={
                  isOwner
                    ? option === "private"
                      ? "Only owners and admins can open this tree"
                      : option === "unlisted"
                        ? "Anyone with the share code can view it"
                        : "Publish with a public tag"
                    : "Only the owner can change visibility"
                }
                variant={visibility === option ? "primary" : "secondary"}
                disabled={!isOwner}
                onClick={() => setVisibility(option)}
              >
                {option === "private" ? "Private" : option === "unlisted" ? "Unlisted" : "Public"}
              </Button>
            ))}
          </div>
          {visibility === "public" ? (
            <label className="mt-5 flex flex-col gap-2 text-sm">
              <span className="text-muted">Public tag</span>
              <input
                value={publicTag}
                disabled={!isOwner}
                onChange={(event) => setPublicTag(event.target.value.toLowerCase())}
                placeholder="ramanathan"
                className="h-12 rounded-2xl border border-border bg-surface px-4 disabled:opacity-50"
              />
              {visibility === "public" && tagMessage ? (
                <span className={tagAvailable ? "text-add" : "text-danger"}>{tagMessage}</span>
              ) : null}
            </label>
          ) : null}
        </section>

        <section className="mt-12">
          <h2 className="font-display text-3xl">Share code</h2>
          <p className="mt-2 font-mono text-2xl tracking-[0.3em]">{shareCode}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              tooltip="Copy the share code"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(shareCode).then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                });
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              tooltip="Generate a new code. The previous code stops working."
              variant="ghost"
              onClick={() => {
                startTransition(async () => {
                  const result = await regenerateShareCodeAction(tree.id);
                  if (result.error) setError(result.error);
                  else if (result.shareCode) setShareCode(result.shareCode);
                });
              }}
            >
              Regenerate
            </Button>
          </div>
        </section>

        <section className="mt-12 flex flex-col gap-3">
          <h2 className="font-display text-3xl">Permissions</h2>
          <Toggle label="Allow suggestions" tooltip="Let signed-in visitors propose changes" checked={allowSuggestions} onChange={setAllowSuggestions} />
          <Toggle label="Social links" tooltip="Show Instagram, Facebook, and similar fields when a viewer is allowed to see them" checked={socialsEnabled} onChange={setSocialsEnabled} />
          <Toggle label="Photos" tooltip="Allow photos on people in this tree" checked={photosEnabled} onChange={setPhotosEnabled} />
          <Toggle label="Hide living people’s details" tooltip="Keep contact and location details off public views of living people" checked={hideLivingDetails} onChange={setHideLivingDetails} />
          <Toggle label="Email me about suggestions" tooltip="Send the owner an email when someone suggests a change" checked={notifySuggestions} onChange={setNotifySuggestions} />
        </section>

        {isOwner ? <AdminManager treeId={tree.id} admins={admins} /> : null}

        <section className="mt-12">
          <h2 className="font-display text-3xl">Visible fields</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            The tree card always shows the name and years. Choose at most two extra lines, such as a place or an occupation.
          </p>
          <ul className="mt-5 grid gap-2 sm:grid-cols-2">
            {PERSON_FIELDS.map((field) => (
              <li key={field}>
                <label className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={visibleFields.includes(field)}
                    onChange={() => toggleField(field)}
                  />
                  {PERSON_FIELD_LABELS[field]}
                </label>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-12">
          <h2 className="font-display text-3xl">Custom fields</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
            Extra details that show on each person’s card. Text, date, or a list of choices.
          </p>
          <ul className="mt-5 flex flex-col gap-3">
            {customFieldDefs.map((field) => (
              <li key={field.key} className="grid gap-3 rounded-2xl border border-border bg-surface p-4 sm:grid-cols-[1fr_9rem_auto]">
                <input
                  aria-label="Field label"
                  value={field.label}
                  onChange={(event) => updateCustom(field.key, { label: event.target.value })}
                  placeholder="Label"
                  className="h-12 rounded-2xl border border-border bg-background px-4"
                />
                <select
                  aria-label="Field type"
                  value={field.type === "text" || field.type === "date" || field.type === "select" ? field.type : field.type}
                  onChange={(event) => updateCustom(field.key, { type: event.target.value as CustomFieldType })}
                  className="h-12 rounded-2xl border border-border bg-background px-3"
                >
                  <option value="text">Text</option>
                  <option value="date">Date</option>
                  <option value="select">Select</option>
                  {field.type !== "text" && field.type !== "date" && field.type !== "select" ? (
                    <option value={field.type}>{field.type}</option>
                  ) : null}
                </select>
                <Button tooltip="Remove this custom field" variant="ghost" onClick={() => setCustomFieldDefs((current) => current.filter((item) => item.key !== field.key))}>
                  Remove
                </Button>
                {field.type === "select" ? (
                  <input
                    aria-label="Choices"
                    value={(field.options ?? []).join(", ")}
                    placeholder="Choices, separated by commas"
                    onChange={(event) =>
                      updateCustom(field.key, {
                        options: event.target.value
                          .split(",")
                          .map((option) => option.trim())
                          .filter((option) => option.length > 0),
                      })
                    }
                    className="h-12 rounded-2xl border border-border bg-background px-4 sm:col-span-3"
                  />
                ) : null}
              </li>
            ))}
          </ul>
          <Button
            tooltip="Add a custom field"
            variant="secondary"
            className="mt-4"
            onClick={() =>
              setCustomFieldDefs((current) => [
                ...current,
                { key: `field_${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`, label: "", type: "text" },
              ])
            }
          >
            Add field
          </Button>
        </section>

        {isOwner ? (
          <section className="mt-10 flex flex-col gap-3">
            <h2 className="font-display text-3xl">Export</h2>
            <p className="text-sm text-muted">Download this tree as JSON. Importing that file creates a new tree and does not replace this one.</p>
            <div className="flex flex-wrap gap-2">
              <Tooltip content="Download people, relationships, and settings as JSON">
                <a href={`/api/trees/${tree.id}/export`} className="inline-flex h-11 items-center rounded-full border border-border bg-surface px-5 text-sm">
                  Download JSON
                </a>
              </Tooltip>
              <Tooltip content="Download the JSON export including photo files">
                <a
                  href={`/api/trees/${tree.id}/export?photos=1`}
                  className="inline-flex h-11 items-center rounded-full border border-border bg-surface px-5 text-sm"
                >
                  Download with photos
                </a>
              </Tooltip>
            </div>
          </section>
        ) : null}

        {error ? <p className="mt-8 text-sm text-danger">{error}</p> : null}
        {saved ? <p className="mt-8 text-sm text-muted">Saved.</p> : null}
        <Button tooltip="Save visibility, fields, and theme" type="submit" className="mt-6" disabled={pending}>
          {pending ? "Saving" : "Save settings"}
        </Button>
      </div>

      <aside className="lg:pt-28">
        <h2 className="font-display text-3xl">Theme</h2>
        <p className="mt-2 text-sm text-muted">The tree’s theme replaces the system appearance while you are inside it.</p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {THEME_IDS.map((option) => {
            const [background, ink, father, mother] = swatch[option];
            return (
              <Button
                key={option}
                tooltip={`Preview the ${THEME_LABELS[option]} theme`}
                variant="ghost"
                className={`h-auto w-full flex-col items-stretch rounded-2xl border px-3 py-3 ${theme === option ? "border-accent" : "border-border"}`}
                onClick={() => {
                  setTheme(option);
                  setPreview(option);
                }}
              >
                <span className="flex h-12 overflow-hidden rounded-xl" style={{ background }}>
                  <span className="m-2 h-3 w-3 rounded-full" style={{ background: father }} />
                  <span className="m-2 h-3 w-3 rounded-full" style={{ background: mother }} />
                  <span className="m-2 ml-auto h-3 w-8 rounded-full" style={{ background: ink }} />
                </span>
                <span className="mt-2 text-left text-xs text-text">{THEME_LABELS[option]}</span>
              </Button>
            );
          })}
        </div>
      </aside>
    </form>
  );
}

function Toggle({
  label,
  tooltip,
  checked,
  onChange,
}: {
  label: string;
  tooltip: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface px-4 py-3">
      <span className="text-sm">{label}</span>
      <Button
        tooltip={tooltip}
        variant={checked ? "primary" : "secondary"}
        className="h-9 min-w-16"
        onClick={() => onChange(!checked)}
      >
        {checked ? "On" : "Off"}
      </Button>
    </div>
  );
}
