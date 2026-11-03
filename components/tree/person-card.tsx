"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

import { removePersonPhotoAction, uploadPersonPhoto } from "@/app/photos/actions";
import { Button } from "@/components/button";
import { SelectField, TextField } from "@/components/tree/fields";
import { Tooltip } from "@/components/tooltip";
import type { CustomFieldDef } from "@/lib/domain";
import type { DatePrecision, GraphPerson, Sex } from "@/lib/family-graph";
import { fullName, preferredDisplayName } from "@/lib/family-graph";
import { preparePersonPhoto } from "@/lib/image";
import type { KinshipRelationship } from "@/lib/kinship";
import { kinshipLabel } from "@/lib/kinship";
import { ageLabel, facebookHref, formatLifeDate, instagramHref, whatsAppHref } from "@/lib/person-format";
import type { PersonPatch } from "@/lib/person-edits";
import type { AutosaveStatus } from "@/lib/autosave";
import { useAutosave } from "@/lib/use-autosave";
import { contactError } from "@/lib/validation";

const sexes: { value: Sex; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "other", label: "Other" },
  { value: "unknown", label: "Unknown" },
];

export function PersonCard({
  person,
  editing,
  photosEnabled,
  socialsEnabled,
  customFieldDefs,
  viewerPersonId,
  relationships,
  focusLayout,
  onPersist,
  onStatus,
  onToggleMe,
  onDelete,
  onPhoto,
}: {
  person: GraphPerson;
  editing: boolean;
  photosEnabled: boolean;
  socialsEnabled: boolean;
  customFieldDefs: CustomFieldDef[];
  viewerPersonId: string | null;
  relationships: KinshipRelationship[];
  focusLayout: boolean;
  onPersist: (patch: PersonPatch) => Promise<void>;
  onStatus: (status: AutosaveStatus) => void;
  onToggleMe: () => void;
  onDelete: () => void;
  onPhoto: (hasPhoto: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const name = preferredDisplayName(person);
  const legal = fullName(person);
  const birth = formatLifeDate(person.birthDate, person.birthDatePrecision);
  const death = formatLifeDate(person.deathDate, person.deathDatePrecision);
  const age = ageLabel(person);
  const life = [birth, death].filter(Boolean).join(" – ");
  const isMe = viewerPersonId === person.id;

  return (
    <motion.article
      layoutId={focusLayout ? `person-${person.id}` : undefined}
      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 34 }}
      className="rounded-[2rem] border border-border bg-surface p-6 sm:p-10"
    >
      <div className="flex flex-col gap-8 sm:flex-row">
        <PhotoBlock person={person} editing={editing} enabled={photosEnabled} onPhoto={onPhoto} />
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="grid gap-4">
              <TextField
                label="First name"
                value={person.firstName}
                editing
                autoFocus={person.pending}
                validate={(value) => (value.trim() ? null : "A first name is required.")}
                onSave={(value) => onPersist({ firstName: value })}
                onStatus={onStatus}
              />
              <TextField label="Preferred name" value={person.preferredName ?? ""} editing onSave={(value) => onPersist({ preferredName: value })} onStatus={onStatus} />
              <TextField label="Middle name" value={person.middleName ?? ""} editing onSave={(value) => onPersist({ middleName: value })} onStatus={onStatus} />
              <TextField label="Last name" value={person.lastName ?? ""} editing onSave={(value) => onPersist({ lastName: value })} onStatus={onStatus} />
              <TextField label="Birth surname" value={person.birthSurname ?? ""} editing onSave={(value) => onPersist({ birthSurname: value })} onStatus={onStatus} />
            </div>
          ) : (
            <>
              <h1 className="font-display text-5xl tracking-tight sm:text-6xl">{name || "Unnamed"}</h1>
              {legal && legal !== name ? <p className="mt-2 text-lg text-muted">{legal}</p> : null}
              {person.birthSurname ? <p className="mt-2 text-sm text-muted">Birth surname {person.birthSurname}</p> : null}
            </>
          )}

          {!editing && person.livingOnly ? <p className="mt-4 text-lg">Living</p> : null}
          {!editing && !person.livingOnly && (life || age) ? (
            <p className="mt-4 text-lg">
              {life}
              {life && age ? <span className="text-muted"> · </span> : null}
              {age ? <span className="text-muted">{age}</span> : null}
            </p>
          ) : null}

          <RelationshipChip relationships={relationships} isMe={isMe} viewerSet={Boolean(viewerPersonId)} />

          <div className="mt-5">
            <Button
              tooltip={isMe ? "Clear “this is me” for your account" : "Mark this person as you"}
              variant={isMe ? "primary" : "secondary"}
              onClick={onToggleMe}
            >
              {isMe ? "This is me" : "This is me"}
            </Button>
          </div>
        </div>
      </div>

      {person.livingOnly && !editing ? null : (
      <>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <SelectField
          label="Sex"
          value={person.sex}
          editing={editing}
          options={sexes}
          onSave={(value) => onPersist({ sex: value as Sex })}
          onStatus={onStatus}
        />
        <DateField
          label="Birth"
          date={person.birthDate}
          precision={person.birthDatePrecision}
          editing={editing}
          onStatus={onStatus}
          onSave={(date, precision) => onPersist({ birthDate: date, birthDatePrecision: precision })}
        />
        {editing ? (
          <div>
            <span className="text-xs tracking-wide text-muted uppercase">Status</span>
            <div className="mt-2 flex h-12 w-full overflow-hidden rounded-2xl border border-border" role="group" aria-label="Status">
              <Button
                tooltip="Mark this person as living"
                variant={!person.isDeceased ? "primary" : "ghost"}
                className="h-12 flex-1 rounded-none px-3"
                onClick={() => void onPersist({ isDeceased: false, deathDate: null, deathDatePrecision: null })}
              >
                Living
              </Button>
              <Button
                tooltip="Mark this person as deceased"
                variant={person.isDeceased ? "primary" : "ghost"}
                className="h-12 flex-1 rounded-none px-3"
                onClick={() => void onPersist({ isDeceased: true })}
              >
                Deceased
              </Button>
            </div>
            <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${person.isDeceased ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="min-h-0 overflow-hidden" inert={person.isDeceased ? undefined : true}>
                <div className="pt-6">
                  <DateField
                    label="Death"
                    date={person.deathDate}
                    precision={person.deathDatePrecision}
                    editing={editing}
                    onStatus={onStatus}
                    onSave={(date, precision) => onPersist({ deathDate: date, deathDatePrecision: precision, isDeceased: Boolean(date) || person.isDeceased })}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : person.isDeceased && !death ? (
          <p className="text-muted">Deceased</p>
        ) : null}
        <TextField label="Birth place" value={person.birthPlace ?? ""} editing={editing} onSave={(value) => onPersist({ birthPlace: value })} onStatus={onStatus} />
        <TextField label="Native place" value={person.nativePlace ?? ""} editing={editing} onSave={(value) => onPersist({ nativePlace: value })} onStatus={onStatus} />
        <TextField label="Current place" value={person.currentLocation ?? ""} editing={editing} onSave={(value) => onPersist({ currentLocation: value })} onStatus={onStatus} />
        <TextField label="Occupation" value={person.occupation ?? ""} editing={editing} onSave={(value) => onPersist({ occupation: value })} onStatus={onStatus} />
      </div>

      <div className="mt-6">
        <TextField label="Biography" value={person.bio ?? ""} editing={editing} multiline onSave={(value) => onPersist({ bio: value })} onStatus={onStatus} />
      </div>

      {customFieldDefs.length > 0 ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          {customFieldDefs.map((field) => (
            <CustomValue key={field.key} field={field} person={person} editing={editing} onPersist={onPersist} onStatus={onStatus} />
          ))}
        </div>
      ) : null}

      {socialsEnabled || editing ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          {editing ? (
            <>
              <TextField
                label="Phone / WhatsApp"
                value={person.phoneWhatsapp ?? ""}
                editing
                validate={(value) => contactError({ phoneWhatsapp: value.trim() || null, email: null, instagram: null, facebook: null })}
                onSave={(value) => onPersist({ phoneWhatsapp: value })}
                onStatus={onStatus}
              />
              <TextField
                label="Email"
                value={person.email ?? ""}
                editing
                validate={(value) => contactError({ phoneWhatsapp: null, email: value.trim() || null, instagram: null, facebook: null })}
                onSave={(value) => onPersist({ email: value })}
                onStatus={onStatus}
              />
              <TextField
                label="Instagram"
                value={person.instagram ?? ""}
                editing
                validate={(value) => contactError({ phoneWhatsapp: null, email: null, instagram: value.trim() || null, facebook: null })}
                onSave={(value) => onPersist({ instagram: value })}
                onStatus={onStatus}
              />
              <TextField
                label="Facebook"
                value={person.facebook ?? ""}
                editing
                validate={(value) => contactError({ phoneWhatsapp: null, email: null, instagram: null, facebook: value.trim() || null })}
                onSave={(value) => onPersist({ facebook: value })}
                onStatus={onStatus}
              />
            </>
          ) : socialsEnabled ? (
            <ContactLinks person={person} />
          ) : null}
        </div>
      ) : null}
      </>
      )}

      {editing && !person.pending ? (
        <div className="mt-10">
          <Button tooltip="Delete this person and their relationships" variant="danger" onClick={onDelete}>
            Delete person
          </Button>
        </div>
      ) : null}
    </motion.article>
  );
}

function RelationshipChip({
  relationships,
  isMe,
  viewerSet,
}: {
  relationships: KinshipRelationship[];
  isMe: boolean;
  viewerSet: boolean;
}) {
  if (isMe) {
    return <p className="mt-5 inline-flex rounded-full bg-accent/10 px-3 py-1 text-sm text-accent">You</p>;
  }
  if (!viewerSet || relationships.length === 0) return null;
  const [primary, ...rest] = relationships;
  if (!primary) return null;
  const label = title(kinshipLabel(primary));
  const also = rest.map((relationship) => title(kinshipLabel(relationship)));
  const tip = relationships
    .map((relationship) => {
      const name = title(kinshipLabel(relationship));
      return relationship.pathDescription === relationship.term ? name : `${name} — ${relationship.pathDescription}`;
    })
    .join(" · ");
  return (
    <Tooltip content={tip} className="mt-5">
      <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-2 rounded-full border border-border px-3 py-1 text-sm">
        <span>{label}</span>
        {also.length > 0 ? <span className="text-muted">also: {also.join(", ")}</span> : null}
      </span>
    </Tooltip>
  );
}

function title(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function ContactLinks({ person }: { person: GraphPerson }) {
  const whatsapp = whatsAppHref(person.phoneWhatsapp);
  const instagram = instagramHref(person.instagram);
  const facebook = facebookHref(person.facebook);
  if (!whatsapp && !person.email && !instagram && !facebook) return null;
  return (
    <div className="flex flex-wrap gap-2 sm:col-span-2">
      {whatsapp ? (
        <Tooltip content="Open a WhatsApp chat">
          <a className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm" href={whatsapp} target="_blank" rel="noreferrer">
            WhatsApp
          </a>
        </Tooltip>
      ) : null}
      {person.email ? (
        <Tooltip content="Send an email">
          <a className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm" href={`mailto:${person.email}`}>
            {person.email}
          </a>
        </Tooltip>
      ) : null}
      {instagram ? (
        <Tooltip content="Open Instagram">
          <a className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm" href={instagram} target="_blank" rel="noreferrer">
            Instagram
          </a>
        </Tooltip>
      ) : null}
      {facebook ? (
        <Tooltip content="Open Facebook">
          <a className="inline-flex h-11 items-center rounded-full border border-border px-5 text-sm" href={facebook} target="_blank" rel="noreferrer">
            Facebook
          </a>
        </Tooltip>
      ) : null}
    </div>
  );
}

function CustomValue({
  field,
  person,
  editing,
  onPersist,
  onStatus,
}: {
  field: CustomFieldDef;
  person: GraphPerson;
  editing: boolean;
  onPersist: (patch: PersonPatch) => Promise<void>;
  onStatus: (status: AutosaveStatus) => void;
}) {
  const raw = person.customFields[field.key];
  const value = raw == null ? "" : String(raw);
  if (field.type === "select") {
    return (
      <SelectField
        label={field.label}
        value={value}
        editing={editing}
        options={[{ value: "", label: "—" }, ...(field.options ?? []).map((option) => ({ value: option, label: option }))]}
        onSave={(next) => onPersist({ customFields: { [field.key]: next || null } })}
        onStatus={onStatus}
      />
    );
  }
  if (field.type === "date") {
    return (
      <DateField
        label={field.label}
        date={value || null}
        precision={value ? "exact" : null}
        editing={editing}
        onStatus={onStatus}
        onSave={(date) => onPersist({ customFields: { [field.key]: date } })}
      />
    );
  }
  return (
    <TextField
      label={field.label}
      value={value}
      editing={editing}
      multiline={field.type === "long_text"}
      onSave={(next) => onPersist({ customFields: { [field.key]: field.type === "number" ? next : next || null } })}
      onStatus={onStatus}
    />
  );
}

function DateField({
  label,
  date,
  precision,
  editing,
  onSave,
  onStatus,
}: {
  label: string;
  date: string | null;
  precision: DatePrecision | null;
  editing: boolean;
  onSave: (date: string | null, precision: DatePrecision | null) => Promise<void>;
  onStatus: (status: AutosaveStatus) => void;
}) {
  const [localPrecision, setLocalPrecision] = useState<DatePrecision>(precision ?? "exact");
  const [localDate, setLocalDate] = useState(date ?? "");
  const [seen, setSeen] = useState(`${date ?? ""}|${precision ?? ""}`);
  const [dirty, setDirty] = useState(false);
  const signature = `${date ?? ""}|${precision ?? ""}`;
  if (signature !== seen) {
    setSeen(signature);
    if (!dirty || (date ?? "") === localDate) {
      setLocalDate(date ?? "");
      if (precision) setLocalPrecision(precision);
      setDirty(false);
    }
  }
  const { status, push, retry } = useAutosave(async (next: { date: string | null; precision: DatePrecision | null }) => {
    await onSave(next.date, next.precision);
  });
  useEffect(() => {
    if (status !== "idle") onStatus(status);
  }, [onStatus, status]);

  if (!editing) return null;

  const shown = inputValue(localDate, localPrecision);
  return (
    <div>
      <span className="text-xs tracking-wide text-muted uppercase">{label}</span>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="relative min-w-28 flex-1 basis-28">
          <select
            aria-label={`${label} precision`}
            value={localPrecision}
            className="h-12 w-full appearance-none rounded-2xl border border-border bg-background pr-10 pl-3 text-sm"
            onChange={(event) => {
              const nextPrecision = event.target.value as DatePrecision;
              setDirty(true);
              setLocalPrecision(nextPrecision);
              const iso = toIso(shown, nextPrecision);
              if (iso) push({ date: iso, precision: nextPrecision });
            }}
          >
            <option value="exact">Exact</option>
            <option value="month">Month</option>
            <option value="year">Year</option>
            <option value="approx">Approximate</option>
          </select>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted">
            <path d="M3 5.5 L7 9.5 L11 5.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </span>
        <span className="relative min-w-32 flex-[1.4] basis-32">
          <input
            aria-label={label}
            type={localPrecision === "exact" ? "date" : localPrecision === "month" ? "month" : "number"}
            value={shown}
            placeholder={localPrecision === "year" || localPrecision === "approx" ? "Year" : undefined}
            className="h-12 w-full rounded-2xl border border-border bg-background pr-10 pl-4 text-sm"
            onChange={(event) => {
              setDirty(true);
              setLocalDate(event.target.value);
              const iso = toIso(event.target.value, localPrecision);
              if (!event.target.value) push({ date: null, precision: null });
              else if (iso) push({ date: iso, precision: localPrecision });
            }}
          />
          <Button
            tooltip={`Clear ${label.toLowerCase()}`}
            variant="ghost"
            className="absolute top-1/2 right-1 h-[22px]! w-[22px]! -translate-y-1/2 px-0!"
            onClick={() => {
              setDirty(true);
              setLocalDate("");
              push({ date: null, precision: null });
            }}
          >
            ×
          </Button>
        </span>
      </div>
      {status === "retry" ? (
        <Button tooltip="Try saving again" variant="ghost" className="mt-1 h-9 px-3 text-danger" onClick={() => retry()}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

function inputValue(iso: string, precision: DatePrecision): string {
  if (!iso) return "";
  if (precision === "month") return iso.slice(0, 7);
  if (precision === "year" || precision === "approx") return iso.slice(0, 4);
  return iso.slice(0, 10);
}

function toIso(value: string, precision: DatePrecision): string | null {
  if (!value) return null;
  if (precision === "exact" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (precision === "month" && /^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  if ((precision === "year" || precision === "approx") && /^\d{4}$/.test(value)) return `${value}-01-01`;
  return null;
}

function PhotoBlock({
  person,
  editing,
  enabled,
  onPhoto,
}: {
  person: GraphPerson;
  editing: boolean;
  enabled: boolean;
  onPhoto: (hasPhoto: boolean) => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  if (!enabled) return null;
  const src = preview ?? (person.hasPhoto ? `/api/photos/${person.id}?v=${version}` : null);

  return (
    <div className="shrink-0">
      <div className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-[1.75rem] border border-border bg-background">
        {src ? (
          // The photo route requires the session cookie and changes after each upload.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="font-display text-5xl text-muted">{(person.firstName || "?").slice(0, 1)}</span>
        )}
      </div>
      {editing && !person.pending ? (
        <div className="mt-3 flex flex-col gap-2">
          <Button
            tooltip="Choose a photo to crop"
            variant="secondary"
            className="w-full"
            onClick={() => document.getElementById(`photo-${person.id}`)?.click()}
          >
            Choose photo
          </Button>
          <input
            id={`photo-${person.id}`}
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void preparePersonPhoto(file)
                .then((prepared) => {
                  setBlob(prepared);
                  setPreview(URL.createObjectURL(prepared));
                  setError(null);
                })
                .catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : "Could not prepare that image.");
                });
            }}
          />
          {preview ? <p className="text-xs text-muted">Cropped to a square.</p> : null}
          {blob ? (
            <Button
              tooltip="Upload the cropped photo"
              onClick={() => {
                const body = new FormData();
                body.set("file", new File([blob], "photo.webp", { type: "image/webp" }));
                void uploadPersonPhoto(person.id, body).then((result) => {
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setBlob(null);
                  setPreview(null);
                  setVersion((current) => current + 1);
                  onPhoto(true);
                });
              }}
            >
              Use photo
            </Button>
          ) : null}
          {person.hasPhoto ? (
            <Button
              tooltip="Remove this photo"
              variant="ghost"
              onClick={() => {
                void removePersonPhotoAction(person.id).then((result) => {
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setPreview(null);
                  onPhoto(false);
                });
              }}
            >
              Remove photo
            </Button>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
