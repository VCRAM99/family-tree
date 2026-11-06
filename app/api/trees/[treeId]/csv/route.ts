import { actionError } from "@/lib/server/errors";
import { exportTreeCsv } from "@/lib/server/csv-import";
import { getCurrentUser } from "@/lib/server/session";

export async function GET(_request: Request, context: { params: Promise<{ treeId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const { treeId } = await context.params;
  try {
    const csv = await exportTreeCsv(user.id, treeId);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=\"family-tree.csv\"",
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: actionError(error) }, { status: 400 });
  }
}
