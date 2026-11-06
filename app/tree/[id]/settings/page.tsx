import { SettingsForm, type SettingsTree } from "@/components/settings-form";
import { listTreeAdmins } from "@/lib/server/invites";
import { isThemeId } from "@/lib/themes";
import type { PersonField } from "@/lib/domain";
import { PERSON_FIELDS } from "@/lib/domain";
import { parseCustomFieldDefs } from "@/lib/validation";
import { getTreeRole } from "@/lib/server/authz";
import { requireUser } from "@/lib/server/session";
import { readTree } from "@/lib/server/trees";

export default async function TreeSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const [tree, role] = await Promise.all([readTree(user.id, id), getTreeRole(user.id, id)]);
  if (!role) return null;

  const visibleFields = tree.visibleFields.filter((field): field is PersonField =>
    (PERSON_FIELDS as readonly string[]).includes(field),
  );

  const settings: SettingsTree = {
    id: tree.id,
    name: tree.name,
    description: tree.description,
    visibility: tree.visibility,
    publicTag: tree.publicTag,
    shareCode: tree.shareCode.trim(),
    allowSuggestions: tree.allowSuggestions,
    socialsEnabled: tree.socialsEnabled,
    photosEnabled: tree.photosEnabled,
    hideLivingDetails: tree.hideLivingDetails,
    notifySuggestions: tree.notifySuggestions,
    autosave: tree.autosave,
    visibleFields,
    theme: isThemeId(tree.theme) ? tree.theme : "system",
    customFieldDefs: parseCustomFieldDefs(tree.customFieldDefs),
    role,
  };

  const admins = role === "owner" ? await listTreeAdmins(user.id, id) : [];
  return (
    <div className="h-full overflow-auto">
      <SettingsForm tree={settings} admins={admins} />
    </div>
  );
}
