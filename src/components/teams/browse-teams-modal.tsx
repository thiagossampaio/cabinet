"use client";

import { useEffect, useState } from "react";
import { Users, Loader2, X, CheckCircle } from "lucide-react";

interface PublicTeam {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  isMember: boolean;
  hasPendingRequest: boolean;
}

interface BrowseTeamsModalProps {
  onClose: () => void;
}

export function BrowseTeamsModal({ onClose }: BrowseTeamsModalProps) {
  const [teams, setTeams] = useState<PublicTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/teams/public")
      .then((r) => r.json())
      .then((data) => setTeams(data.teams ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleRequest = async (slug: string) => {
    setRequesting((prev) => new Set(prev).add(slug));
    try {
      await fetch(`/api/teams/${slug}/access-requests`, { method: "POST" });
      setTeams((prev) =>
        prev.map((t) => (t.slug === slug ? { ...t, hasPendingRequest: true } : t))
      );
    } catch {
      // ignore
    } finally {
      setRequesting((prev) => {
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-lg border border-border bg-background shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-[14px] font-semibold">Browse teams</h2>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              Request access to join an existing team.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Team list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && teams.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-center px-6">
              <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-[13px] text-muted-foreground">No teams exist yet.</p>
              <p className="text-[12px] text-muted-foreground mt-1">Be the first to create one.</p>
            </div>
          )}

          {teams.map((team) => (
            <div key={team.id} className="flex items-center gap-3 px-5 py-3.5">
              <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-[13px] font-semibold text-primary">
                  {team.name[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate">{team.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {team.memberCount} {team.memberCount === 1 ? "member" : "members"}
                </p>
              </div>
              <div className="shrink-0">
                {team.isMember ? (
                  <span className="text-[11px] text-emerald-500 font-medium px-2 py-1 rounded-md bg-emerald-500/10">
                    Member
                  </span>
                ) : team.hasPendingRequest ? (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium px-2 py-1 rounded-md bg-muted">
                    <CheckCircle className="h-3 w-3" />
                    Requested
                  </span>
                ) : (
                  <button
                    onClick={() => handleRequest(team.slug)}
                    disabled={requesting.has(team.slug)}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {requesting.has(team.slug) ? (
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Requesting…
                      </span>
                    ) : (
                      "Request Access"
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="w-full px-3 py-2 rounded-md border border-border text-[13px] hover:bg-accent transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
