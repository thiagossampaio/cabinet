import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getDb } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const db = getDb();

  const team = db
    .prepare("SELECT id FROM teams WHERE slug = ?")
    .get(slug) as { id: string } | undefined;

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const isMember = db
    .prepare("SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?")
    .get(team.id, userId);

  if (isMember) {
    return NextResponse.json({ error: "Already a member" }, { status: 409 });
  }

  try {
    db.prepare(
      `INSERT INTO team_access_requests (id, team_id, user_id, status)
       VALUES (?, ?, ?, 'pending')`
    ).run(crypto.randomUUID(), team.id, userId);
  } catch {
    // UNIQUE constraint: request already exists — treat as success
  }

  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const db = getDb();

  const team = db
    .prepare("SELECT id FROM teams WHERE slug = ?")
    .get(slug) as { id: string } | undefined;

  if (!team) {
    return NextResponse.json({ error: "Team not found" }, { status: 404 });
  }

  const isAdmin = db
    .prepare("SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ? AND role = 'admin'")
    .get(team.id, userId);

  if (!isAdmin) {
    return NextResponse.json({ error: "Admin required" }, { status: 403 });
  }

  const requests = db
    .prepare(
      `SELECT r.id, r.team_id, r.user_id, r.status, r.created_at,
              u.name AS user_name, u.email AS user_email
       FROM team_access_requests r
       JOIN user u ON u.id = r.user_id
       WHERE r.team_id = ? AND r.status = 'pending'
       ORDER BY r.created_at ASC`
    )
    .all(team.id);

  return NextResponse.json({ requests });
}
