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
        <span className="text-xs text-overlay0 hidden sm:block">spotify downloader</span>
        <a
          href="https://yoinkify.com/tip"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-overlay0 hover:text-peach transition-colors duration-200 flex items-center gap-1.5"
        >
          <img src="https://storage.ko-fi.com/cdn/brandasset/v2/kofi_symbol.png" alt="" className="w-4 h-4" />
          tip jar
        </a>
        <Link href="/feedback" className="text-xs text-surface2 hover:text-lavender transition-colors duration-200">feedback</Link>
        <Link href="/roadmap" className="text-xs text-surface2 hover:text-lavender transition-colors duration-200">v3.0</Link>
      </div>
    </header>
  );
}
