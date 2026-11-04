import { actionError } from "@/lib/server/errors";
import { getCurrentUser } from "@/lib/server/session";
import { importTree } from "@/lib/server/tree-export";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  try {
    const body = await request.json();
    const created = await importTree(user.id, user.email, body);
    return Response.json(created);
  } catch (error) {
    return Response.json({ error: actionError(error) }, { status: 400 });
  }
}
