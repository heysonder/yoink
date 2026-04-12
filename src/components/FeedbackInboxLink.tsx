"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getTrackedFeedbackEventName,
  markFeedbackStatusesSeen,
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

export default function FeedbackInboxLink() {
  const [tracked, setTracked] = useState<TrackedFeedbackEntry[]>([]);
  const [reports, setReports] = useState<FeedbackStatusSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

      setTracked(readTrackedFeedback());
      setReports(Array.isArray(data?.reports) ? data.reports : []);
    } catch {
      setLoadError("couldn\'t load status right now.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatuses();

    const syncFromStorage = () => setTracked(readTrackedFeedback());
    const syncAndRefresh = () => {
      void refreshStatuses();
    };
    const refreshOnFocus = () => {
      void refreshStatuses();
    };

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener(getTrackedFeedbackEventName(), syncAndRefresh);
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener(getTrackedFeedbackEventName(), syncAndRefresh);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, [refreshStatuses]);

  useEffect(() => {
    if (!open || !reports.length) return;
    markFeedbackStatusesSeen(reports);
    setTracked(readTrackedFeedback());
  }, [open, reports]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  const unseenCount = useMemo(() => {
    const seenByToken = new Map(tracked.map((entry) => [entry.token, entry.lastSeenUpdatedAt]));
    return reports.reduce((count, report) => {
      return seenByToken.get(report.token) === report.updatedAt ? count : count + 1;
    }, 0);
  }, [reports, tracked]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 text-surface2 hover:text-lavender transition-colors duration-200"
      >
        <span>feedback</span>
        {unseenCount > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-lavender px-1 text-[10px] font-bold leading-none text-crust">
            {unseenCount > 9 ? "9+" : unseenCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-3 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-surface0/70 bg-mantle/95 p-4 text-left shadow-2xl backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-text">feedback</p>
              <p className="mt-1 text-[11px] leading-relaxed text-overlay0">
                private to this browser. no account, no email, no cross-device sync.
              </p>
            </div>
            <Link
              href="/feedback"
              onClick={() => setOpen(false)}
              className="text-[11px] font-bold uppercase tracking-[0.18em] text-lavender hover:text-mauve transition-colors duration-200"
            >
              new
            </Link>
          </div>

          <div className="mt-4 border-t border-surface0/50 pt-4">
            {loading ? (
              <p className="text-xs text-overlay0">loading status...</p>
            ) : loadError ? (
              <p className="text-xs text-red">{loadError}</p>
            ) : reports.length ? (
              <div className="space-y-3">
                {reports.map((report) => (
                  <div key={report.token} className="rounded-lg border border-surface0/50 bg-base/40 p-3">
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
            ) : tracked.length ? (
              <p className="text-xs leading-relaxed text-overlay0">
                no tracked reports are available on this browser right now.
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-overlay0">
                no tracked reports on this browser yet. submit something and it will show up here.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
