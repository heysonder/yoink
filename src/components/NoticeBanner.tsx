"use client";

import { useState } from "react";

const EXPIRY = new Date("2026-04-08T20:20:00Z").getTime(); // expires ~20 min from deploy
const DISMISS_KEY = "yoink-notice-metadata-fix";

export default function NoticeBanner() {
  const [visible, setVisible] = useState(() =>
    typeof window !== "undefined"
    && Date.now() <= EXPIRY
    && !localStorage.getItem(DISMISS_KEY)
  );

  if (!visible) return null;

  const dismiss = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setVisible(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  return (
    <div className="banner-slide-down border-b border-peach/20 bg-peach/[0.04] px-4 py-3">
      <div className="max-w-2xl mx-auto flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-peach/80 border border-peach/25 rounded px-1.5 py-0.5">
            notice
          </span>
          <p className="text-xs text-subtext0/90 leading-relaxed">
            <span className="text-text/80 font-medium">some downloads may have matched the wrong song recently</span>
            <span className="hidden sm:inline">
              {" "}&mdash; this has been fixed. sorry about that.
            </span>
          </p>
        </div>
        <button
          onClick={dismiss}
          className="flex-shrink-0 text-overlay0/50 hover:text-overlay0 transition-colors duration-200 p-1"
          aria-label="Dismiss notice"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>
    </div>
  );
}
