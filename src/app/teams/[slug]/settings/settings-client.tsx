"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Trash2, UserMinus, Shield, User, GitBranch, Loader2, CheckCircle, XCircle } from "lucide-react";
import { fetchUserTeams } from "@/lib/api/client";
import { useAppStore } from "@/stores/app-store";

interface Member {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: "admin" | "member";
  joined_at: string;
}

interface Team {
  id: string;
  name: string;
  slug: string;
  kbPath: string | null;
  effectivePath: string;
  githubRepoUrl: string | null;
}

interface TeamSettingsClientProps {
  slug: string;
}

export function TeamSettingsClient({ slug }: TeamSettingsClientProps) {
  const { data: session } = authClient.useSession();
  const router = useRouter();
  const setTeams = useAppStore((s) => s.setTeams);
  const setCurrentTeam = useAppStore((s) => s.setCurrentTeam);

  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [kbPath, setKbPath] = useState("");
  const [effectivePath, setEffectivePath] = useState("");
  const [savingPath, setSavingPath] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Repository state
  const [repoUrl, setRepoUrl] = useState("");
  const [savingRepo, setSavingRepo] = useState(false);
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [cloneLogs, setCloneLogs] = useState<string[]>([]);
  const [cloneStatus, setCloneStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [cloneError, setCloneError] = useState("");
  const logsEndRef = useRef<HTMLDivElement>(null);

  const myRole = members.find((m) => m.id === session?.user?.id)?.role;
  const isAdmin = myRole === "admin";

  useEffect(() => {
    async function load() {
      try {
        const [teamRes, membersRes] = await Promise.all([
          fetch(`/api/teams/${slug}`),
          fetch(`/api/teams/${slug}/members`),
        ]);
        if (!teamRes.ok) {
          router.push("/");
          return;
        }
        const { team: t } = await teamRes.json();
        const { members: m } = await membersRes.json();
        setTeam(t);
        setName(t.name);
        setKbPath(t.kbPath ?? "");
        setEffectivePath(t.effectivePath ?? "");
        setRepoUrl(t.githubRepoUrl ?? "");
        setMembers(m);
      } catch {
        router.push("/");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug, router]);

  // Auto-scroll logs
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [cloneLogs]);

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || name === team?.name) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/teams/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to rename");
        return;
      }
      const { team: t } = await res.json();
      setTeam(t);
      const teams = await fetchUserTeams();
      setTeams(teams);
    } catch {
      setError("Connection error");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePath = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPath(true);
    setError("");
    try {
      const res = await fetch(`/api/teams/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbPath: kbPath.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save path");
        return;
      }
      const { team: t } = await res.json();
      setTeam(t);
      setKbPath(t.kbPath ?? "");
      setEffectivePath(t.effectivePath ?? "");
    } catch {
      setError("Connection error");
    } finally {
      setSavingPath(false);
    }
  };

  const handleResetPath = async () => {
    setSavingPath(true);
    setError("");
    try {
      const res = await fetch(`/api/teams/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kbPath: null }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to reset path");
        return;
      }
      const { team: t } = await res.json();
      setTeam(t);
      setKbPath("");
      setEffectivePath(t.effectivePath ?? "");
    } catch {
      setError("Connection error");
    } finally {
      setSavingPath(false);
    }
  };

  const handleSaveRepoUrl = async () => {
    setSavingRepo(true);
    setError("");
    try {
      const res = await fetch(`/api/teams/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_repo_url: repoUrl.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to save repository URL");
        return;
      }
      const { team: t } = await res.json();
      setTeam(t);
      setRepoUrl(t.githubRepoUrl ?? "");
    } catch {
      setError("Connection error");
    } finally {
      setSavingRepo(false);
    }
  };

  const handleClone = async () => {
    // Save URL first if it changed
    if (repoUrl.trim() !== (team?.githubRepoUrl ?? "")) {
      await handleSaveRepoUrl();
    }

    setCloneLogs([]);
    setCloneError("");
    setCloneStatus("running");
    setCloning(true);
    setCloneModalOpen(true);

    try {
      const res = await fetch(`/api/teams/${slug}/git/clone`, { method: "POST" });

      if (!res.body) {
        throw new Error("No response body");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.log) {
              setCloneLogs((prev) => [...prev, payload.log as string]);
            }
            if (payload.done) {
              if (payload.success) {
                setCloneStatus("success");
                // Reload team data so KB path updates
                const teamRes = await fetch(`/api/teams/${slug}`);
                if (teamRes.ok) {
                  const { team: t } = await teamRes.json();
                  setTeam(t);
                  setKbPath(t.kbPath ?? "");
                  setEffectivePath(t.effectivePath ?? "");
                }
              } else {
                setCloneStatus("error");
                setCloneError(payload.error ?? "Clone failed");
              }
            }
          } catch {
            // ignore malformed SSE line
          }
        }
      }
    } catch (err) {
      setCloneStatus("error");
      setCloneError(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setCloning(false);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError("");
    try {
      const res = await fetch(`/api/teams/${slug}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Failed to add member");
        return;
      }
      setInviteEmail("");
      const membersRes = await fetch(`/api/teams/${slug}/members`);
      const { members: m } = await membersRes.json();
      setMembers(m);
    } catch {
      setError("Connection error");
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    try {
      await fetch(`/api/teams/${slug}/members/${userId}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.id !== userId));
    } catch {
      setError("Failed to remove member");
    }
  };

  const handleChangeRole = async (userId: string, role: "admin" | "member") => {
    try {
      await fetch(`/api/teams/${slug}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      setMembers((prev) => prev.map((m) => m.id === userId ? { ...m, role } : m));
    } catch {
      setError("Failed to change role");
    }
  };

  const handleDeleteTeam = async () => {
    if (!confirm(`Delete team "${team?.name}"? This cannot be undone.`)) return;
    try {
      await fetch(`/api/teams/${slug}`, { method: "DELETE" });
      const teams = await fetchUserTeams();
      setTeams(teams);
      if (teams.length > 0) setCurrentTeam(teams[0].slug);
      router.push("/");
    } catch {
      setError("Failed to delete team");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-6 py-10 space-y-10">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-xl font-bold tracking-[-0.02em]">Team settings</h1>
        </div>

        {error && (
          <p className="text-sm text-red-400 px-3 py-2 rounded-md border border-red-400/30 bg-red-400/10">
            {error}
          </p>
        )}

        {/* General */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">General</h2>
          <form onSubmit={handleRename} className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!isAdmin}
              className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            />
            {isAdmin && (
              <button
                type="submit"
                disabled={saving || name === team?.name || !name.trim()}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-[14px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : "Rename"}
              </button>
            )}
          </form>
        </section>

        {/* Repository */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">Repository</h2>
          <p className="text-[12px] text-muted-foreground">
            Enter the SSH URL of the GitHub repository to clone as this team&apos;s knowledge base.
            The clone will use your <strong>GitHub OAuth account</strong> — you must have read access
            to the repository. The repository will be cloned into the directory configured in
            platform Settings → General.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              disabled={!isAdmin}
              placeholder="git@github.com:org/repo.git"
              className="flex-1 px-3 py-2 rounded-md border border-border bg-background font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            />
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={handleSaveRepoUrl}
                  disabled={savingRepo || repoUrl === (team?.githubRepoUrl ?? "")}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-[14px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {savingRepo ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={handleClone}
                  disabled={!repoUrl.trim() || cloning}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-md border border-border text-[14px] font-medium hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                  Clone
                </button>
              </>
            )}
          </div>
        </section>

        {/* Knowledge Base */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">Knowledge Base</h2>
          <p className="text-[12px] text-muted-foreground">
            Absolute path where this team&apos;s KB files are stored. Leave empty to use the
            default:{" "}
            <code className="font-mono text-[11px] bg-muted px-1 py-0.5 rounded">
              {effectivePath}
            </code>
          </p>
          <form onSubmit={handleSavePath} className="flex gap-2">
            <input
              type="text"
              value={kbPath}
              onChange={(e) => setKbPath(e.target.value)}
              disabled={!isAdmin}
              placeholder={effectivePath}
              className="flex-1 px-3 py-2 rounded-md border border-border bg-background font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            />
            {isAdmin && (
              <>
                <button
                  type="submit"
                  disabled={savingPath || kbPath === (team?.kbPath ?? "")}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-[14px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {savingPath ? "Saving..." : "Save"}
                </button>
                {(team?.kbPath) && (
                  <button
                    type="button"
                    onClick={handleResetPath}
                    disabled={savingPath}
                    className="px-4 py-2 rounded-md border border-border text-[14px] font-medium hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    Reset
                  </button>
                )}
              </>
            )}
          </form>
        </section>

        {/* Members */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">Members ({members.length})</h2>
          <div className="divide-y divide-border rounded-md border border-border">
            {members.map((member) => (
              <div key={member.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium shrink-0">
                  {(member.name ?? member.email)[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{member.name ?? member.email}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{member.email}</p>
                </div>
                <div className="flex items-center gap-1">
                  {isAdmin && member.id !== session?.user?.id && (
                    <>
                      <button
                        onClick={() =>
                          handleChangeRole(
                            member.id,
                            member.role === "admin" ? "member" : "admin"
                          )
                        }
                        title={`Change to ${member.role === "admin" ? "member" : "admin"}`}
                        className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
                      >
                        {member.role === "admin" ? (
                          <Shield className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <User className="h-3.5 w-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleRemoveMember(member.id)}
                        title="Remove member"
                        className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  {!isAdmin || member.id === session?.user?.id ? (
                    <span className="text-[11px] text-muted-foreground px-1.5 py-0.5 rounded-sm bg-muted">
                      {member.role}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {isAdmin && (
            <form onSubmit={handleInvite} className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
                className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "admin" | "member")}
                className="px-2 py-2 rounded-md border border-border bg-background text-[14px]"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="submit"
                disabled={inviting || !inviteEmail.trim()}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-[14px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {inviting ? "Adding..." : "Add"}
              </button>
            </form>
          )}
        </section>

        {/* Danger zone */}
        {isAdmin && (
          <section className="space-y-4 border border-red-400/30 rounded-md p-4">
            <h2 className="text-sm font-semibold text-red-400">Danger zone</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[13px] font-medium">Delete this team</p>
                <p className="text-[12px] text-muted-foreground">
                  Permanently remove the team and all its data.
                </p>
              </div>
              <button
                onClick={handleDeleteTeam}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-400/50 text-red-400 text-[13px] hover:bg-red-400/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Clone Progress Modal */}
      {cloneModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl mx-4 rounded-lg border border-border bg-background shadow-2xl flex flex-col">
            {/* Modal header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              {cloning && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
              {cloneStatus === "success" && <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />}
              {cloneStatus === "error" && <XCircle className="h-4 w-4 text-red-400 shrink-0" />}
              <h2 className="text-[14px] font-semibold flex-1">
                {cloning
                  ? "Cloning repository…"
                  : cloneStatus === "success"
                  ? "Clone successful"
                  : "Clone failed"}
              </h2>
            </div>

            {/* Log area */}
            <div className="h-80 overflow-y-auto bg-[#0d1117] rounded-none p-4 font-mono text-[12px] leading-relaxed">
              {cloneLogs.length === 0 && cloning && (
                <span className="text-muted-foreground">Starting clone…</span>
              )}
              {cloneLogs.map((line, i) => (
                <div key={i} className="text-[#c9d1d9] whitespace-pre-wrap">{line}</div>
              ))}
              {cloneStatus === "error" && cloneError && (
                <div className="text-red-400 mt-2">{cloneError}</div>
              )}
              <div ref={logsEndRef} />
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end px-5 py-3 border-t border-border gap-3">
              {cloneStatus === "success" && (
                <p className="text-[12px] text-green-500 flex-1">
                  Repository cloned. Knowledge base path updated automatically.
                </p>
              )}
              <button
                onClick={() => setCloneModalOpen(false)}
                disabled={cloning}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
