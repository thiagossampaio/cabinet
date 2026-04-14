import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
import { spawn } from "child_process";
import simpleGit from "simple-git";
import { getManagedDataDir } from "@/lib/runtime/runtime-config";
import { getDb } from "@/lib/db";

/**
 * Returns the filesystem path for a team's data directory.
 * If the team has a data_dir_override (e.g. the legacy "default" team),
 * that path is used instead of the default teams/{slug} location.
 */
export function getTeamDataDir(teamSlug: string): string {
  const db = getDb();
  const row = db
    .prepare("SELECT data_dir_override FROM teams WHERE slug = ?")
    .get(teamSlug) as { data_dir_override: string | null } | undefined;

  if (row?.data_dir_override) return row.data_dir_override;
  return path.join(getManagedDataDir(), "teams", teamSlug);
}

/**
 * Sets (or clears) the absolute KB path for a team.
 * When absolutePath is null the team falls back to the default managed path.
 * If a non-null path is given, the directory and git repo are initialised.
 */
export async function setTeamKbPath(
  teamSlug: string,
  absolutePath: string | null
): Promise<void> {
  const db = getDb();
  db.prepare("UPDATE teams SET data_dir_override = ? WHERE slug = ?").run(
    absolutePath,
    teamSlug
  );

  if (absolutePath) {
    await fs.mkdir(absolutePath, { recursive: true });
    const gitDir = path.join(absolutePath, ".git");
    if (!existsSync(gitDir)) {
      const git = simpleGit(absolutePath);
      await git.init();
      await git.addConfig("user.email", "kb@cabinet.dev");
      await git.addConfig("user.name", "Cabinet");
    }
  }
}

/**
 * Converts a GitHub SSH URL to an authenticated HTTPS URL using an OAuth token.
 * Supports:
 *   git@github.com:owner/repo.git
 *   ssh://git@github.com/owner/repo.git
 *   https://github.com/owner/repo.git
 */
function sshToAuthenticatedHttps(sshUrl: string, token: string): string {
  let httpsUrl: string;
  if (sshUrl.startsWith("git@github.com:")) {
    httpsUrl = "https://github.com/" + sshUrl.slice("git@github.com:".length);
  } else if (sshUrl.startsWith("ssh://git@github.com/")) {
    httpsUrl = "https://github.com/" + sshUrl.slice("ssh://git@github.com/".length);
  } else if (sshUrl.startsWith("https://github.com/")) {
    httpsUrl = sshUrl;
  } else {
    throw new Error(`Unsupported URL format: ${sshUrl}. Only GitHub SSH/HTTPS URLs are supported.`);
  }
  return httpsUrl.replace("https://", `https://x-oauth-basic:${token}@`);
}

/**
 * Clones a GitHub repository into targetDir using an OAuth token for authentication.
 * Streams stdout/stderr lines to the onProgress callback.
 * The authenticated URL (with token) is never passed to onProgress — only sanitised output.
 */
export async function cloneTeamRepo(
  sshUrl: string,
  token: string,
  targetDir: string,
  onProgress: (line: string) => void
): Promise<void> {
  const authenticatedUrl = sshToAuthenticatedHttps(sshUrl, token);

  await fs.mkdir(path.dirname(targetDir), { recursive: true });

  return new Promise((resolve, reject) => {
    const proc = spawn("git", ["clone", "--progress", authenticatedUrl, targetDir], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    const sanitize = (line: string) =>
      line.replace(authenticatedUrl, sshUrl).replace(token, "***");

    const handleData = (data: Buffer) => {
      data
        .toString()
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => onProgress(sanitize(line)));
    };

    proc.stdout.on("data", handleData);
    proc.stderr.on("data", handleData);

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git clone exited with code ${code}`));
      }
    });

    proc.on("error", (err) => reject(err));
  });
}

/**
 * Initialises git submodules recursively in the given directory.
 * Only runs if a .gitmodules file is present.
 * Uses the OAuth token to authenticate both HTTPS and SSH submodule URLs via
 * inline `url.<auth>.insteadOf` config — nothing is persisted to disk.
 */
export async function initSubmodules(
  targetDir: string,
  token: string,
  onProgress: (line: string) => void
): Promise<void> {
  const gitmodulesPath = path.join(targetDir, ".gitmodules");
  if (!existsSync(gitmodulesPath)) {
    return; // no submodules — nothing to do
  }

  onProgress("Submodules detected. Running git submodule update --init --recursive…");

  const authenticatedBase = `https://x-oauth-basic:${token}@github.com/`;

  return new Promise((resolve, reject) => {
    const proc = spawn(
      "git",
      [
        "-c", `url.${authenticatedBase}.insteadOf=https://github.com/`,
        "-c", `url.${authenticatedBase}.insteadOf=git@github.com:`,
        "submodule", "update", "--init", "--recursive", "--progress",
      ],
      {
        cwd: targetDir,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
      }
    );

    const sanitize = (line: string) => line.replace(token, "***");

    const handleData = (data: Buffer) => {
      data
        .toString()
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => onProgress(sanitize(line)));
    };

    proc.stdout.on("data", handleData);
    proc.stderr.on("data", handleData);

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`git submodule update exited with code ${code}`));
      }
    });

    proc.on("error", (err) => reject(err));
  });
}

/**
 * Runs a git command in a directory and streams stdout/stderr to onProgress.
 * Resolves with the exit code (never rejects on non-zero exit).
 */
function spawnGit(
  args: string[],
  cwd: string,
  onProgress: (line: string) => void
): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("git", args, {
      cwd,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    const handleData = (data: Buffer) => {
      data
        .toString()
        .split(/\r?\n/)
        .filter(Boolean)
        .forEach((line) => onProgress(line));
    };

    proc.stdout.on("data", handleData);
    proc.stderr.on("data", handleData);
    proc.on("close", resolve);
    proc.on("error", reject);
  });
}

/**
 * Checks out the `main` branch in the repository at targetDir (if the branch exists),
 * then does the same for every submodule recursively.
 * Failures in individual submodules are logged but do not abort the operation.
 */
export async function checkoutMain(
  targetDir: string,
  onProgress: (line: string) => void
): Promise<void> {
  onProgress("Setting up branch: checking out main in root repository…");

  // Root repo — checkout main; if it doesn't exist, log and continue
  const rootCode = await spawnGit(["checkout", "main"], targetDir, onProgress);
  if (rootCode !== 0) {
    onProgress("Branch 'main' not found in root repository — skipping.");
  }

  // Submodules — only relevant when .gitmodules exists
  const gitmodulesPath = path.join(targetDir, ".gitmodules");
  if (!existsSync(gitmodulesPath)) return;

  onProgress("Checking out branch main in all submodules…");

  // git submodule foreach --recursive runs a shell command inside each submodule.
  // We attempt `git checkout main`; non-zero exit is silently skipped via `|| true`.
  const foreachCode = await spawnGit(
    [
      "submodule", "foreach", "--recursive",
      "git checkout main && echo \"  → checked out main\" || echo \"  → main not found, skipping $(pwd)\"",
    ],
    targetDir,
    onProgress
  );

  if (foreachCode !== 0) {
    onProgress("Warning: some submodules could not be checked out to main.");
  }
}

/**
 * Ensures the team's data directory exists and has a git repo initialised.
 * Safe to call multiple times (idempotent).
 */
export async function initTeamDirectory(teamSlug: string): Promise<void> {
  const teamDir = getTeamDataDir(teamSlug);
  await fs.mkdir(teamDir, { recursive: true });

  const gitDir = path.join(teamDir, ".git");
  if (!existsSync(gitDir)) {
    const git = simpleGit(teamDir);
    await git.init();
    await git.addConfig("user.email", "kb@cabinet.dev");
    await git.addConfig("user.name", "Cabinet");
  }
}
