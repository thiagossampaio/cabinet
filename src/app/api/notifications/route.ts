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

  // Find all teams where the current user is admin
  const adminTeams = db
    .prepare(
      `SELECT t.id AS team_id, t.name AS team_name
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       WHERE tm.user_id = ? AND tm.role = 'admin'`
    )
    .all(userId) as Array<{ team_id: string; team_name: string }>;

  if (adminTeams.length === 0) {
    return NextResponse.json({ requests: [] });
  }

  const teamIds = adminTeams.map((t) => t.team_id);
  const placeholders = teamIds.map(() => "?").join(", ");

  const rows = db
    .prepare(
      `SELECT
        r.id,
        r.team_id,
        r.user_id,
        r.created_at,
        u.name AS user_name,
        u.email AS user_email,
        t.name AS team_name
       FROM team_access_requests r
       JOIN user u ON u.id = r.user_id
       JOIN teams t ON t.id = r.team_id
       WHERE r.team_id IN (${placeholders}) AND r.status = 'pending'
       ORDER BY r.created_at ASC`
    )
    .all(...teamIds) as Array<{
      id: string;
      team_id: string;
      user_id: string;
      created_at: string;
      user_name: string | null;
      user_email: string;
      team_name: string;
    }>;

  return NextResponse.json({ requests: rows });
}
