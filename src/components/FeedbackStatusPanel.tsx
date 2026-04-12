"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getTrackedFeedbackEventName,
  markFeedbackStatusesSeen,
  primeTrackedFeedbackStatuses,
  pruneTrackedFeedbackTokens,
  readTrackedFeedback,
  type FeedbackStatusSummary,
  type TrackedFeedbackEntry,
} from "@/lib/feedback-tracker-client";

function getStatusClasses(stateType: string | null): string {
  if (stateType === "completed") return "border-green/40 bg-green/10 text-green";
  if (stateType === "canceled") return "border-red/40 bg-red/10 text-red";
  return "border-lavender/30 bg-lavender/10 text-lavender";
}

export default function FeedbackStatusPanel() {
  const [tracked, setTracked] = useState<TrackedFeedbackEntry[]>([]);
  const [reports, setReports] = useState<FeedbackStatusSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshStatuses = useCallback(async () => {
    const entries = readTrackedFeedback();
    setTracked(entries);

    if (!entries.length) {
      setReports([]);
      setLoadError(null);
      return;
    }

    setLoading(true);
    setLoadError(null);

    try {
      const res = await fetch("/api/feedback/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokens: entries.map((entry) => entry.token) }),
        cache: "no-store",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "failed to load feedback status");

      const missingTokens = Array.isArray(data?.missingTokens)
        ? data.missingTokens.filter((token: unknown): token is string => typeof token === "string")
        : [];
      if (missingTokens.length) {
        pruneTrackedFeedbackTokens(missingTokens);
      }

      const nextReports = Array.isArray(data?.reports) ? data.reports : [];
      primeTrackedFeedbackStatuses(nextReports);
      setTracked(readTrackedFeedback());
      setReports(nextReports);
    } catch {
      setLoadError("couldn\'t load status right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatuses();

    const syncAndRefresh = () => {
      void refreshStatuses();
    };

    window.addEventListener("storage", syncAndRefresh);
    window.addEventListener(getTrackedFeedbackEventName(), syncAndRefresh);

    return () => {
      window.removeEventListener("storage", syncAndRefresh);
      window.removeEventListener(getTrackedFeedbackEventName(), syncAndRefresh);
    };
  }, [refreshStatuses]);

  useEffect(() => {
    if (!open || !reports.length) return;
    markFeedbackStatusesSeen(reports);
    setTracked(readTrackedFeedback());
  }, [open, reports]);

  const unseenCount = useMemo(() => {
    const seenByToken = new Map(tracked.map((entry) => [entry.token, entry.lastSeenUpdatedAt]));
    return reports.reduce((count, report) => {
      const lastSeenUpdatedAt = seenByToken.get(report.token);
      if (!lastSeenUpdatedAt) return count;
      return lastSeenUpdatedAt === report.updatedAt ? count : count + 1;
    }, 0);
  }, [reports, tracked]);

  if (!tracked.length && !loading) return null;

  return (
    <div className="animate-fade-in-up space-y-4" style={{ opacity: 0, animationDelay: "120ms" }}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="feedback-status-panel"
        className="btn-press inline-flex items-center gap-2 rounded-lg border border-surface0/70 bg-surface0/35 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-text transition-colors duration-200 hover:border-lavender/40 hover:text-lavender"
      >
        <span>report updates</span>
        {unseenCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-lavender px-1 text-[10px] leading-none text-crust">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      {open && (
        <div id="feedback-status-panel" className="rounded-2xl border border-surface0/60 bg-mantle/35 p-5 space-y-4">
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-text">your reports</p>
            <p className="text-xs leading-relaxed text-overlay0">
              private to this browser. no account, no email, no cross-device sync.
            </p>
          </div>

          {loading ? (
            <p className="text-xs text-overlay0">loading status...</p>
          ) : loadError ? (
            <p className="text-xs text-red">{loadError}</p>
          ) : reports.length ? (
            <div className="space-y-3">
              {reports.map((report) => (
                <div key={report.token} className="rounded-xl border border-surface0/50 bg-base/35 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {report.identifier && (
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-overlay0">
                          {report.identifier}
                        </p>
                      )}
                      <p className="mt-1 line-clamp-2 text-sm font-semibold text-text">{report.title}</p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${getStatusClasses(report.stateType)}`}>
                      {report.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-overlay0">
              no tracked reports are available on this browser right now.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
