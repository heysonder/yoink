"use client";

import Link from "next/link";

export default function Header() {
  return (
    <header className="border-b border-surface0/60 px-6 py-4 flex items-center justify-between backdrop-blur-sm bg-base/80 sticky top-0 z-10">
      <Link href="/" className="flex items-center gap-3 group">
        <div className="status-dot w-2 h-2 rounded-full bg-green" />
        <span className="text-sm font-bold tracking-wider uppercase text-text group-hover:text-lavender transition-colors">
          yoink
        </span>
      </Link>
      <div className="flex items-center gap-4">
        <span className="text-xs text-overlay0 hidden sm:block">music downloader</span>
        <Link href="/feedback" className="text-xs text-surface2 hover:text-lavender transition-colors duration-200">feedback</Link>
        <a
          href="https://yoinkify.com/tip"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-peach/80 hover:text-peach border border-peach/20 hover:border-peach/40 px-2.5 py-1 rounded-md transition-all duration-200"
        >
          tip jar
        </a>
        <Link href="/roadmap" className="text-xs text-surface2 hover:text-lavender transition-colors duration-200">v3.0</Link>
      </div>
    </header>
  );
}
