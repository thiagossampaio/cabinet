"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Bell, Loader2, Check, X } from "lucide-react";
import { useAppStore } from "@/stores/app-store";
import { fetchUserTeams } from "@/lib/api/client";

interface AccessRequest {
  id: string;
  team_id: string;
  team_name: string;
  user_id: string;
  user_name: string | null;
  user_email: string;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function NotificationBell() {
  const teams = useAppStore((s) => s.teams);
  const setTeams = useAppStore((s) => s.setTeams);
  const isAdmin = teams.some((t) => t.role === "admin");

  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [open, setOpen] = useState(false);
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests ?? []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    fetchNotifications();
    const id = setInterval(fetchNotifications, 30000);
    return () => clearInterval(id);
  }, [isAdmin, fetchNotifications]);

  // Close panel on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleAction = async (requestId: string, action: "approve" | "deny") => {
    setResolving((prev) => new Set(prev).add(requestId));
    try {
      const res = await fetch(`/api/notifications/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setRequests((prev) => prev.filter((r) => r.id !== requestId));
        // If approved, refresh the team list in case membership changed
        if (action === "approve") {
          fetchUserTeams()
            .then((t) => setTeams(t))
            .catch(() => {});
        }
      }
    } catch {
      // ignore
    } finally {
      setResolving((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        title="Notifications"
      >
        <Bell className="h-4 w-4" />
        {requests.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {requests.length > 9 ? "9+" : requests.length}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute left-0 top-full mt-1 w-80 rounded-lg border border-border bg-background shadow-xl z-50 flex flex-col max-h-[420px]"
        >
          {/* Panel header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h3 className="text-[13px] font-semibold">Access Requests</h3>
            {requests.length > 0 && (
              <span className="text-[11px] text-muted-foreground">
                {requests.length} pending
              </span>
            )}
          </div>

          {/* Request list */}
          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {requests.length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <Bell className="h-6 w-6 text-muted-foreground/30 mb-2" />
                <p className="text-[12px] text-muted-foreground">No pending requests</p>
              </div>
            )}

            {requests.map((r) => {
              const isResolving = resolving.has(r.id);
              const displayName = r.user_name || r.user_email;

              return (
                <div key={r.id} className="px-4 py-3 space-y-2">
                  <div className="flex items-start gap-2.5">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-[11px] font-medium shrink-0 mt-0.5">
                      {displayName[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] leading-snug">
                        <span className="font-medium">{displayName}</span>
                        {" wants to join "}
                        <span className="font-medium">{r.team_name}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {timeAgo(r.created_at)}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 pl-9">
                    <button
                      onClick={() => handleAction(r.id, "approve")}
                      disabled={isResolving}
                      className="flex items-center gap-1 px-3 py-1 rounded-md bg-primary text-primary-foreground text-[11px] font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {isResolving ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Approve
                    </button>
                    <button
                      onClick={() => handleAction(r.id, "deny")}
                      disabled={isResolving}
                      className="flex items-center gap-1 px-3 py-1 rounded-md border border-border text-[11px] font-medium hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                      Deny
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
