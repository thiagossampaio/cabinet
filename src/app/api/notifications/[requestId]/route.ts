import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { action } = (await req.json()) as { action: "approve" | "deny" };
  if (action !== "approve" && action !== "deny") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const userId = session.user.id;
  const db = getDb();

  const request = db
    .prepare("SELECT id, team_id, user_id, status FROM team_access_requests WHERE id = ?")
    .get(requestId) as { id: string; team_id: string; user_id: string; status: string } | undefined;

  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  if (request.status !== "pending") {
    return NextResponse.json({ error: "Request already resolved" }, { status: 409 });
  }

  // Verify caller is admin of the team
  const isAdmin = db
    .prepare("SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ? AND role = 'admin'")
    .get(request.team_id, userId);

  if (!isAdmin) {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const now = new Date().toISOString();

  if (action === "approve") {
    const resolveRequest = db.transaction(() => {
      // Add user as member (ignore if already exists)
      try {
        db.prepare(
          `INSERT INTO team_members (id, team_id, user_id, role)
           VALUES (?, ?, ?, 'member')`
        ).run(crypto.randomUUID(), request.team_id, request.user_id);
      } catch {
        // already a member — ok
      }

      db.prepare(
        `UPDATE team_access_requests
         SET status = 'approved', resolved_at = ?, resolved_by = ?
         WHERE id = ?`
      ).run(now, userId, requestId);
    });
    resolveRequest();
  } else {
    db.prepare(
      `UPDATE team_access_requests
       SET status = 'denied', resolved_at = ?, resolved_by = ?
       WHERE id = ?`
    ).run(now, userId, requestId);
  }

  return NextResponse.json({ ok: true });
}
