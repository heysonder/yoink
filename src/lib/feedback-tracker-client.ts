export interface TrackedFeedbackEntry {
  token: string;
  addedAt: string;
  lastSeenUpdatedAt: string | null;
}

export interface FeedbackStatusSummary {
  token: string;
  identifier: string | null;
  title: string;
  status: string;
  stateType: string | null;
  updatedAt: string;
}

const STORAGE_KEY = "yoink:feedback-tracking";
const MAX_TRACKED_REPORTS = 10;
const STORAGE_EVENT = "yoink-feedback-tracking-changed";

interface WriteOptions {
  emit?: boolean;
}

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readRawEntries(): TrackedFeedbackEntry[] {
  if (!hasStorage()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const deduped = new Map<string, TrackedFeedbackEntry>();

    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;

      const token = "token" in item && typeof item.token === "string" ? item.token : null;
      if (!token) continue;

      deduped.set(token, {
        token,
        addedAt:
          "addedAt" in item && typeof item.addedAt === "string"
            ? item.addedAt
            : new Date().toISOString(),
        lastSeenUpdatedAt:
          "lastSeenUpdatedAt" in item && typeof item.lastSeenUpdatedAt === "string"
            ? item.lastSeenUpdatedAt
            : null,
      });
    }

    return Array.from(deduped.values()).slice(0, MAX_TRACKED_REPORTS);
  } catch {
    return [];
  }
}

function writeRawEntries(entries: TrackedFeedbackEntry[], options?: WriteOptions) {
  if (!hasStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_TRACKED_REPORTS)));
  if (options?.emit !== false) {
    window.dispatchEvent(new Event(STORAGE_EVENT));
  }
}

export function getTrackedFeedbackEventName(): string {
  return STORAGE_EVENT;
}

export function readTrackedFeedback(): TrackedFeedbackEntry[] {
  return readRawEntries();
}

export function saveTrackedFeedbackToken(token: string) {
  saveTrackedFeedbackTokenWithSeenState(token, null);
}

export function saveTrackedFeedbackTokenWithSeenState(token: string, lastSeenUpdatedAt: string | null) {
  const existing = readRawEntries().filter((entry) => entry.token !== token);
  writeRawEntries([
    {
      token,
      addedAt: new Date().toISOString(),
      lastSeenUpdatedAt,
    },
    ...existing,
  ]);
}

export function primeTrackedFeedbackStatuses(reports: FeedbackStatusSummary[]) {
  if (!reports.length) return;

  const updates = new Map(reports.map((report) => [report.token, report.updatedAt]));
  let changed = false;
  const entries = readRawEntries().map((entry) => {
    if (entry.lastSeenUpdatedAt || !updates.has(entry.token)) return entry;
    changed = true;
    return {
      ...entry,
      lastSeenUpdatedAt: updates.get(entry.token) || null,
    };
  });

  if (changed) writeRawEntries(entries, { emit: false });
}

export function markFeedbackStatusesSeen(reports: FeedbackStatusSummary[]) {
  if (!reports.length) return;

  const updates = new Map(reports.map((report) => [report.token, report.updatedAt]));
  let changed = false;
  const entries = readRawEntries().map((entry) => {
    const nextUpdatedAt = updates.get(entry.token) || entry.lastSeenUpdatedAt;
    if (nextUpdatedAt === entry.lastSeenUpdatedAt) return entry;
    changed = true;
    return {
      ...entry,
      lastSeenUpdatedAt: nextUpdatedAt,
    };
  });

  if (changed) writeRawEntries(entries, { emit: false });
}

export function pruneTrackedFeedbackTokens(tokens: string[]) {
  if (!tokens.length) return;

  const toRemove = new Set(tokens);
  writeRawEntries(readRawEntries().filter((entry) => !toRemove.has(entry.token)), { emit: false });
}
