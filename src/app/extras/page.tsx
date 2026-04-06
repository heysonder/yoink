"use client";

import Link from "next/link";
import Header from "@/components/Header";

const links = [
  {
    href: "/how",
    title: "local files setup",
    description: "how to set up your downloads as a local music library with full metadata, artwork, and lyrics.",
    color: "text-mauve",
    borderColor: "border-mauve/20",
    bgColor: "bg-mauve/5",
  },
  {
    href: "/players",
    title: "recommended players",
    description: "the best music players for every platform that actually use embedded metadata, lyrics, and album art.",
    color: "text-green",
    borderColor: "border-green/20",
    bgColor: "bg-green/5",
  },
  {
    href: "/roadmap",
    title: "roadmap",
    description: "what we're working on next, what's planned, and what's already shipped.",
    color: "text-lavender",
    borderColor: "border-lavender/20",
    bgColor: "bg-lavender/5",
  },
  {
    href: "/status",
    title: "service status",
    description: "live health checks for all audio sources, metadata providers, and third-party services.",
    color: "text-peach",
    borderColor: "border-peach/20",
    bgColor: "bg-peach/5",
  },
];

export default function ExtrasPage() {
  return (
    <div className="min-h-screen bg-grid">
      <Header />

      <section className="px-6 pt-16 sm:pt-24 pb-12 sm:pb-16 max-w-2xl mx-auto">
        <div className="space-y-6 animate-fade-in-up" style={{ opacity: 0 }}>
          <p className="text-xs text-lavender uppercase tracking-[0.3em] font-bold">
            extras
          </p>
          <h1 className="text-5xl sm:text-7xl font-bold leading-[0.95] tracking-tight text-text">
            guides &
            <br />
            <span className="text-lavender">tools.</span>
          </h1>
          <p className="text-lg text-subtext0/80 leading-relaxed max-w-md">
            everything else — setup guides, player recommendations, and what we&apos;re building next.
          </p>
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      <section className="px-6 py-12 sm:py-16 max-w-2xl mx-auto">
        <div className="grid gap-4">
          {links.map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              className="animate-fade-in-up group"
              style={{ opacity: 0, animationDelay: `${i * 60}ms` }}
            >
              <div className={`border ${link.borderColor} rounded-lg p-5 sm:p-6 ${link.bgColor} hover:bg-surface0/10 transition-colors duration-200 space-y-2`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-bold ${link.color}`}>
                    {link.title}
                  </p>
                  <span className="text-xs text-overlay0/30 group-hover:text-overlay0/60 transition-colors duration-200">
                    →
                  </span>
                </div>
                <p className="text-sm text-subtext0/70 leading-relaxed">
                  {link.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      <footer className="border-t border-surface0/40 px-6 py-4 flex items-center justify-between text-xs text-overlay0/50">
        <span>yoink</span>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/tldr" className="hover:text-text transition-colors duration-200">tldr</Link>
          <a
            href="https://github.com/heysonder/yoink"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text transition-colors duration-200"
          >
            source
          </a>
        </div>
      </footer>
    </div>
  );
}
