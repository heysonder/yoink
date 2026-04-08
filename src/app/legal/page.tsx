"use client";

import Link from "next/link";
import Header from "@/components/Header";

const pages = [
  {
    href: "/tldr",
    title: "tldr",
    description: "the plain-english version of how yoink works, what data we touch, and what kind of use is not okay.",
    color: "text-lavender",
    borderColor: "border-lavender/20",
    bgColor: "bg-lavender/5",
  },
  {
    href: "/terms",
    title: "terms of service",
    description: "the formal terms — liability, indemnification, DMCA, governing law, and everything else.",
    color: "text-mauve",
    borderColor: "border-mauve/20",
    bgColor: "bg-mauve/5",
  },
  {
    href: "/privacy",
    title: "privacy policy",
    description: "what data we collect (almost none), how logs work, third-party services, GDPR rights, and feedback handling.",
    color: "text-green",
    borderColor: "border-green/20",
    bgColor: "bg-green/5",
  },
];

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-grid">
      <Header />

      <section className="px-6 pt-16 sm:pt-24 pb-12 sm:pb-16 max-w-2xl mx-auto">
        <div className="space-y-6 animate-fade-in-up" style={{ opacity: 0 }}>
          <p className="text-xs text-lavender uppercase tracking-[0.3em] font-bold">
            legal
          </p>
          <h1 className="text-5xl sm:text-7xl font-bold leading-[0.95] tracking-tight text-text">
            the fine
            <br />
            <span className="text-lavender">print.</span>
          </h1>
          <p className="text-lg text-subtext0/80 leading-relaxed max-w-md">
            rules, terms, and privacy — start with the plain-english version unless you enjoy legalese.
          </p>
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      <section className="px-6 py-12 sm:py-16 max-w-2xl mx-auto">
        <div className="grid gap-4">
          {pages.map((page, i) => (
            <Link
              key={page.href}
              href={page.href}
              className="animate-fade-in-up group"
              style={{ opacity: 0, animationDelay: `${i * 60}ms` }}
            >
              <div className={`border ${page.borderColor} rounded-lg p-5 sm:p-6 ${page.bgColor} hover:bg-surface0/10 transition-colors duration-200 space-y-2`}>
                <div className="flex items-center justify-between">
                  <p className={`text-sm font-bold ${page.color}`}>
                    {page.title}
                  </p>
                  <span className="text-xs text-overlay0/30 group-hover:text-overlay0/60 transition-colors duration-200">
                    →
                  </span>
                </div>
                <p className="text-sm text-subtext0/70 leading-relaxed">
                  {page.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="max-w-2xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      <section className="px-6 py-10 max-w-2xl mx-auto">
        <div
          className="animate-fade-in-up border border-surface0/60 rounded-lg p-5 sm:p-6 bg-mantle/40 space-y-3"
          style={{ opacity: 0 }}
        >
          <p className="text-sm font-bold text-text">questions?</p>
          <p className="text-sm text-subtext0/80 leading-relaxed">
            general questions or data requests go to me@yoinkify.com.
            copyright concerns go to dmca@yoinkify.com.
          </p>
          <div className="flex gap-4">
            <a href="mailto:me@yoinkify.com" className="text-sm text-lavender hover:text-mauve transition-colors duration-200">
              me@yoinkify.com
            </a>
            <a href="mailto:dmca@yoinkify.com" className="text-sm text-overlay0 hover:text-text transition-colors duration-200">
              dmca@yoinkify.com
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-surface0/40 px-6 py-4 flex items-center justify-between text-xs text-overlay0/50">
        <span>yoink</span>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/extras" className="hover:text-text transition-colors duration-200">extras</Link>
          <Link href="/source" className="hover:text-text transition-colors duration-200">source</Link>
        </div>
      </footer>
    </div>
  );
}
