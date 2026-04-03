"use client";

import { useState } from "react";
import Link from "next/link";

// Banner disabled — migration is old news
const EXPIRY = new Date("2026-03-25T00:00:00Z").getTime();
const DISMISS_KEY = "yoink-migration-banner-dismissed";

export default function MigrationBanner() {
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
    <Link href="/status" className="block banner-slide-down border-b border-peach/20 bg-peach/[0.04] px-4 py-3 hover:bg-peach/[0.07] transition-colors duration-200">
      <div className="max-w-2xl mx-auto flex items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-peach/80 border border-peach/25 rounded px-1.5 py-0.5">
            new
          </span>
          <p className="text-xs text-subtext0/90 leading-relaxed truncate">
            <span className="text-text/80 font-medium">yoink moved to yoinkify.com</span>
            <span className="hidden sm:inline">
              {" "}&mdash; yoinkify.lol was suspended by the domain registry. same app, new home.
            </span>
          </p>
        </div>
        <button
          onClick={dismiss}
          className="flex-shrink-0 text-overlay0/50 hover:text-overlay0 transition-colors duration-200 p-1"
          aria-label="Dismiss banner"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>
    </Link>
  );
}
