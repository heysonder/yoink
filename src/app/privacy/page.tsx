"use client";

import Link from "next/link";

interface Section {
  title: string;
  content: (string | React.ReactNode)[];
}

const sections: Section[] = [
  {
    title: "the short version",
    content: [
      "yoink doesn't have accounts and doesn't keep download history. we removed third-party analytics and keep data collection narrow: transient rate limiting, anonymized app logs for debugging, and any feedback you choose to submit.",
    ],
  },
  {
    title: "no accounts, no analytics",
    content: [
      "yoink has no user accounts, no sign-ups, and no analytics scripts. we don't use google analytics, facebook pixel, umami, or any ad-tech tracker.",
      "the only browser-side storage used by the app is a local dismiss flag for the migration banner. it's kept in your browser and never sent to us.",
    ],
  },
  {
    title: "downloads and processing",
    content: [
      "audio files are fetched in real time and delivered to your browser. for some server-side conversion paths, temporary files may be written to the server's temp directory during processing and then deleted immediately after the request completes.",
      "we don't keep user accounts, download history, or a permanent library of what you've requested.",
    ],
  },
  {
    title: "rate limiting and app logs",
    content: [
      "yoink uses your IP address in volatile server memory to rate limit requests and prevent abuse. that in-memory data is not written to our application database and resets when the server restarts.",
      "our application logs use an anonymized request identifier derived from your IP address instead of logging the raw IP directly. we keep request-level debugging details like the endpoint used, the source platform, and limited request metadata so we can diagnose failures such as tracks not being sourced correctly.",
      "our hosting provider may still generate infrastructure logs that can include IP addresses, timestamps, and status codes at the platform level.",
    ],
  },
  {
    title: "feedback submissions",
    content: [
      "if you use the in-app feedback form, we collect the report fields you submit: type, title, description, and optionally your email address and screenshot.",
      "feedback submissions are sent to our internal Linear workspace for triage. if you include a screenshot, it is uploaded to Linear's file storage. only the site owner has access to that workspace. don't include passwords, payment details, private messages, or other sensitive personal data in feedback or screenshots.",
      "we use an optional email address only if we need to follow up about your report. optional contact details and screenshots are kept for up to 90 days after a ticket is resolved, unless we still need them for an active issue. non-sensitive issue text may be kept longer as part of the product backlog and support history.",
      "if you want a feedback submission corrected or deleted, email me@yoinkify.com and we'll handle it manually.",
    ],
  },
  {
    title: "third-party services",
    content: [
      "to fetch metadata and audio, yoink communicates with several third-party APIs on your behalf. these services may have their own privacy policies:",
      "music metadata providers — for track details, artwork, search, and catalog matching. lyric providers such as lrclib and musixmatch — for lyrics. linear — for feedback intake. audio is sourced from third-party music services. the specific metadata providers we use may change over time based on availability and reliability.",
      "yoink sends the minimum request data needed for those services to respond, such as track names, artist names, URLs, and feedback content you explicitly submit. we do not sell personal information or use ad-tech profiling.",
    ],
  },
  {
    title: "self-hosted instances",
    content: [
      "if you self-host yoink using our docker image, your instance is entirely under your control. we have no visibility into self-hosted deployments and collect no data from them.",
    ],
  },
  {
    title: "children",
    content: [
      "yoink is not directed at children under 13. we don't knowingly collect any personal information from anyone, let alone minors.",
    ],
  },
  {
    title: "changes",
    content: [
      "if we ever change how we handle data (we probably won't), we'll update this page. no email notifications — just check back here.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-grid">
      {/* Nav */}
      <nav className="border-b border-surface0/60 px-6 py-4 flex items-center justify-between backdrop-blur-sm bg-base/80 sticky top-0 z-10">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="status-dot w-2 h-2 rounded-full bg-green" />
          <span className="text-sm font-bold tracking-wider uppercase text-text group-hover:text-lavender transition-colors">
            yoink
          </span>
        </Link>
        <Link
          href="/app"
          className="btn-press text-xs text-crust bg-lavender hover:bg-mauve px-4 py-2 rounded-md font-bold uppercase tracking-wider transition-colors duration-200"
        >
          open app
        </Link>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-20 sm:pt-32 pb-16 sm:pb-24 max-w-2xl mx-auto">
        <div className="space-y-6 animate-fade-in-up" style={{ opacity: 0 }}>
          <p className="text-xs text-lavender uppercase tracking-[0.3em] font-bold">
            legal
          </p>
          <h1 className="text-5xl sm:text-7xl font-bold leading-[0.95] tracking-tight text-text">
            privacy
            <br />
            <span className="text-lavender">policy.</span>
          </h1>
          <p className="text-lg text-subtext0/80 leading-relaxed max-w-md">
            we don&apos;t track you. we don&apos;t store your data. here&apos;s
            the full breakdown.
          </p>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      {/* TLDR banner */}
      <section className="px-6 py-12 sm:py-16 max-w-2xl mx-auto">
        <div
          className="animate-fade-in-up border border-green/20 rounded-lg p-5 bg-green/5 space-y-2"
          style={{ opacity: 0 }}
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green" />
            <p className="text-sm font-bold text-green">tldr</p>
          </div>
          <p className="text-sm text-subtext0/80 leading-relaxed">
            no accounts. no analytics. no download history. rate limiting uses
            IPs in volatile memory, app logs use anonymized request IDs, and
            feedback is only collected when you choose to submit it.
          </p>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      {/* Sections */}
      {sections.map((section, sectionIdx) => (
        <div key={section.title}>
          <section className="px-6 py-12 sm:py-16 max-w-2xl mx-auto">
            <div
              className="animate-fade-in-up space-y-4"
              style={{ opacity: 0, animationDelay: `${sectionIdx * 60}ms` }}
            >
              <div className="flex items-baseline gap-4">
                <span className="text-2xl font-bold text-surface2">
                  {String(sectionIdx + 1).padStart(2, "0")}
                </span>
                <p className="text-sm font-bold text-text">{section.title}</p>
              </div>
              <div className="pl-10 sm:pl-12 space-y-3">
                {section.content.map((paragraph, i) => (
                  <p
                    key={i}
                    className="text-sm text-subtext0/80 leading-relaxed"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          </section>

          {sectionIdx < sections.length - 1 && (
            <div className="max-w-2xl mx-auto px-6">
              <div className="border-t border-surface0/30" />
            </div>
          )}
        </div>
      ))}

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      {/* Contact */}
      <section className="px-6 py-12 sm:py-16 max-w-2xl mx-auto">
        <div
          className="animate-fade-in-up border border-surface0/60 rounded-lg p-6 sm:p-8 bg-mantle/40 space-y-4"
          style={{ opacity: 0 }}
        >
          <p className="text-sm font-bold text-text">questions about your data?</p>
          <p className="text-sm text-subtext0/80 leading-relaxed">
            if you want a feedback submission corrected or deleted, or if you
            have questions about rate limiting or debugging logs, reach out.
          </p>
          <a
            href="mailto:me@yoinkify.com"
            className="text-sm text-lavender hover:text-mauve transition-colors duration-200 inline-block"
          >
            me@yoinkify.com
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-surface0/40 px-6 py-4 flex items-center justify-between text-xs text-overlay0/50">
        <span>yoink</span>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/terms" className="hover:text-text transition-colors duration-200">terms</Link>
          <Link href="/roadmap" className="hover:text-text transition-colors duration-200">roadmap</Link>
          <a
            href="https://yoinkify.com/tip"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-peach transition-colors duration-200"
          >
            tip jar
          </a>
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
