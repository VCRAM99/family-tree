import { actionError } from "@/lib/server/errors";
import { importCsvTree } from "@/lib/server/csv-import";
import { getCurrentUser } from "@/lib/server/session";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const body = (await request.json()) as { csv?: unknown; name?: unknown };
    if (typeof body.csv !== "string") return Response.json({ error: "Choose a CSV file." }, { status: 400 });
    const name = typeof body.name === "string" && body.name.trim() ? body.name : "Imported tree";
    const created = await importCsvTree(user.id, user.email, body.csv, name);
    return Response.json(created);
  } catch (error) {
    return Response.json({ error: actionError(error) }, { status: 400 });
  }
}
