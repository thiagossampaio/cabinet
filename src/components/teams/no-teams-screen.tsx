"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "@/stores/app-store";
import { fetchUserTeams } from "@/lib/api/client";
import { BrowseTeamsModal } from "./browse-teams-modal";
import { Users, Loader2 } from "lucide-react";

interface NoTeamsScreenProps {
  onTeamsLoaded: (teams: { id: string; name: string; slug: string; role: string }[]) => void;
}

export function NoTeamsScreen({ onTeamsLoaded }: NoTeamsScreenProps) {
  const setTeams = useAppStore((s) => s.setTeams);
  const setCurrentTeam = useAppStore((s) => s.setCurrentTeam);

  const [teamName, setTeamName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [browseOpen, setBrowseOpen] = useState(false);

  // Poll for team membership — fires when an admin approves access
  const poll = useCallback(async () => {
    try {
      const teams = await fetchUserTeams();
      if (teams.length > 0) {
        setTeams(teams);
        setCurrentTeam(teams[0].slug);
        onTeamsLoaded(teams);
      }
    } catch {
      // ignore
    }
  }, [setTeams, setCurrentTeam, onTeamsLoaded]);

  useEffect(() => {
    const id = setInterval(poll, 15000);
    return () => clearInterval(id);
  }, [poll]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) return;
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setCreateError(data.error ?? "Failed to create team");
        return;
      }
      const { team } = await res.json();
      const teams = await fetchUserTeams();
      setTeams(teams);
      setCurrentTeam(team.slug);
      onTeamsLoaded(teams);
    } catch {
      setCreateError("Connection error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm mx-auto p-6 space-y-8">
          {/* Icon + heading */}
          <div className="text-center space-y-2">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold tracking-[-0.02em]">You have no teams</h1>
            <p className="text-[13px] text-muted-foreground">
              Create a new team or request access to an existing one to get started.
            </p>
          </div>

          {/* Create team form */}
          <div className="space-y-3">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Create a new team
            </p>
            <form onSubmit={handleCreate} className="flex gap-2">
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Engineering, Marketing"
                autoFocus
                className="flex-1 px-3 py-2 rounded-md border border-border bg-background text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="submit"
                disabled={creating || !teamName.trim()}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-[14px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
              </button>
            </form>
            {createError && (
              <p className="text-[12px] text-red-400">{createError}</p>
            )}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-border" />
            <span className="text-[12px] text-muted-foreground">or</span>
            <div className="flex-1 border-t border-border" />
          </div>

          {/* Browse teams */}
          <div className="space-y-3">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Join an existing team
            </p>
            <button
              onClick={() => setBrowseOpen(true)}
              className="w-full px-4 py-2.5 rounded-md border border-border text-[14px] font-medium hover:bg-accent transition-colors text-left flex items-center justify-between"
            >
              <span>Browse existing teams</span>
              <span className="text-muted-foreground text-[18px] leading-none">→</span>
            </button>
            <p className="text-[11px] text-muted-foreground">
              Admins will be notified of your request and can approve or deny access.
            </p>
          </div>
        </div>
      </div>

      {browseOpen && <BrowseTeamsModal onClose={() => setBrowseOpen(false)} />}
    </>
  );
}
