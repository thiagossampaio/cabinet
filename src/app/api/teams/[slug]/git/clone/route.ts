import { NextRequest } from "next/server";
import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { getDb } from "@/lib/db";
import { requireTeamContext, teamContextErrorResponse } from "@/lib/teams/team-context";
import { cloneTeamRepo, setTeamKbPath, initSubmodules, checkoutMain } from "@/lib/teams/team-fs";
import { getManagedDataDir } from "@/lib/runtime/runtime-config";
import { DATA_DIR } from "@/lib/storage/path-utils";

const CONFIG_DIR = path.join(DATA_DIR, ".agents", ".config");
const COMPANY_FILE = path.join(CONFIG_DIR, "company.json");

async function getReposBaseDir(): Promise<string> {
  try {
    const raw = await fs.readFile(COMPANY_FILE, "utf-8");
    const config = JSON.parse(raw) as { repos_base_dir?: string };
    if (config.repos_base_dir?.trim()) {
      return path.resolve(config.repos_base_dir.trim());
    }
  } catch {
    // fallback below
  }
  return path.join(getManagedDataDir(), "repos");
}

function sseChunk(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  let ctx: Awaited<ReturnType<typeof requireTeamContext>>;
  try {
    ctx = await requireTeamContext(slug);
  } catch (err) {
    return teamContextErrorResponse(err);
  }

  if (ctx.role !== "admin") {
    return new Response(
      sseChunk({ done: true, success: false, error: "Admin required" }),
      { status: 403, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const db = getDb();

  const teamRow = db
    .prepare("SELECT github_repo_url FROM teams WHERE id = ?")
    .get(ctx.teamId) as { github_repo_url: string | null } | undefined;

  const repoUrl = teamRow?.github_repo_url?.trim();
  if (!repoUrl) {
    return new Response(
      sseChunk({ done: true, success: false, error: "No repository URL configured for this team." }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const account = db
    .prepare("SELECT accessToken FROM account WHERE userId = ? AND providerId = 'github'")
    .get(ctx.userId) as { accessToken: string | null } | undefined;

  if (!account?.accessToken) {
    return new Response(
      sseChunk({ done: true, success: false, error: "No GitHub account linked. Sign in with GitHub to enable cloning." }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const reposBaseDir = await getReposBaseDir();
  const targetDir = path.join(reposBaseDir, slug);

  // Path traversal guard
  if (!targetDir.startsWith(reposBaseDir + path.sep) && targetDir !== reposBaseDir) {
    return new Response(
      sseChunk({ done: true, success: false, error: "Invalid target directory." }),
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  if (existsSync(targetDir)) {
    return new Response(
      sseChunk({ done: true, success: false, error: `Directory already exists: ${targetDir}. Remove it or change the repository clone directory in Settings.` }),
      { status: 409, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const enqueue = (data: object) => {
        try {
          controller.enqueue(encoder.encode(sseChunk(data)));
        } catch {
          // client disconnected
        }
      };

      enqueue({ log: `Cloning ${repoUrl} into ${targetDir}…` });

      try {
        await cloneTeamRepo(repoUrl, account!.accessToken!, targetDir, (line) => {
          enqueue({ log: line });
        });

        await initSubmodules(targetDir, account!.accessToken!, (line) => {
          enqueue({ log: line });
        });

        await checkoutMain(targetDir, (line) => {
          enqueue({ log: line });
        });

        enqueue({ log: "Updating team knowledge base path…" });
        await setTeamKbPath(slug, targetDir);
        enqueue({ done: true, success: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        enqueue({ done: true, success: false, error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
