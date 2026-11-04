import { getCurrentUser } from "@/lib/server/session";
import { exportTree } from "@/lib/server/tree-export";
import { actionError } from "@/lib/server/errors";

export async function GET(request: Request, context: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await context.params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  const photos = new URL(request.url).searchParams.get("photos") === "1";
  try {
    const file = await exportTree(user.id, treeId, { photos });
    const body = JSON.stringify(file);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="family-tree-${treeId}.json"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: actionError(error) }, { status: 400 });
  }
}
