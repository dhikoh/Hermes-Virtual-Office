import React, { useEffect, useState } from "react";
import { X, Trash2, ExternalLink } from "lucide-react";

export interface SessionListEntry {
  key: string;
  agentId?: string;
  updatedAt?: number | null;
  displayName?: string;
  origin?: { label: string; provider: string };
  model?: string;
  modelProvider?: string;
}

export interface SessionGatewayClient {
  call: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
}

export interface SessionHistoryModalProps {
  open: boolean;
  agentId: string;
  client?: SessionGatewayClient | null;
  onClose: () => void;
  onSelectSession: (sessionKey: string) => void;
}

export function SessionHistoryModal({
  open,
  agentId,
  client,
  onClose,
  onSelectSession,
}: SessionHistoryModalProps) {
  const [sessions, setSessions] = useState<SessionListEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !client) {
      return;
    }
    let isCancelled = false;
    queueMicrotask(() => {
      if (!isCancelled) setLoading(true);
    });

    client
      .call<{ sessions: SessionListEntry[] }>("sessions.list", {})
      .then((res: { sessions?: SessionListEntry[] }) => {
        if (isCancelled) return;
        const agentSessions = (res.sessions || [])
          .filter((s: SessionListEntry) => s.agentId === agentId)
          .sort((a: SessionListEntry, b: SessionListEntry) => (b.updatedAt || 0) - (a.updatedAt || 0));
        setSessions(agentSessions);
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          console.error("Failed to load sessions:", err);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [open, agentId, client]);

  const handleDelete = async (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this session?")) return;
    if (!client) return;
    try {
      try {
        await client.call("sessions.delete", { key });
      } catch {
        await client.call("sessions.reset", { key });
      }
      setSessions((current) => current.filter((s) => s.key !== key));
    } catch (err: unknown) {
      console.error("Failed to delete session:", err);
      alert("Failed to delete session.");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80">
      <div className="ui-panel flex w-full max-w-md flex-col overflow-hidden p-0 shadow-lg">
        <div className="flex items-center justify-between border-b border-border/70 bg-muted/20 px-4 py-3">
          <h2 className="font-mono text-sm font-semibold tracking-tight text-foreground">
            Chat History
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: "60vh" }}>
          {loading ? (
            <div className="text-center font-mono text-[11px] text-muted-foreground">
              Loading...
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center font-mono text-[11px] text-muted-foreground">
              No history found.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sessions.map((session) => (
                <div
                  key={session.key}
                  className="group relative flex cursor-pointer items-center justify-between rounded-md border border-border/70 bg-card p-3 transition hover:border-foreground/30 hover:bg-muted/30"
                  onClick={() => onSelectSession(session.key)}
                >
                  <div className="flex flex-col">
                    <span className="font-mono text-[12px] font-medium text-foreground">
                      {session.displayName || session.key.split(":").pop()}
                    </span>
                    <span className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {session.updatedAt
                        ? new Date(session.updatedAt).toLocaleString()
                        : "No activity"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      className="rounded p-1.5 text-muted-foreground transition hover:bg-background hover:text-destructive"
                      onClick={(e) => handleDelete(e, session.key)}
                      title="Delete session"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      className="rounded p-1.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
                      title="Load session"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
