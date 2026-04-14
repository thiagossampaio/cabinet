import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT
        t.id,
        t.name,
        t.slug,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id) AS member_count,
        (SELECT COUNT(*) FROM team_members WHERE team_id = t.id AND user_id = ?) AS is_member,
        (SELECT COUNT(*) FROM team_access_requests
          WHERE team_id = t.id AND user_id = ? AND status = 'pending') AS has_pending_request
       FROM teams t
       ORDER BY t.name ASC`
    )
    .all(userId, userId) as Array<{
      id: string;
      name: string;
      slug: string;
      member_count: number;
      is_member: number;
      has_pending_request: number;
    }>;

  const teams = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    memberCount: r.member_count,
    isMember: r.is_member > 0,
    hasPendingRequest: r.has_pending_request > 0,
  }));

  return NextResponse.json({ teams });
}
