"use client";

import Link from "next/link";
import Header from "@/components/Header";

interface RuleSection {
  eyebrow: string;
  title: string;
  intro: string;
  bullets: string[];
}

const sections: RuleSection[] = [
  {
    eyebrow: "use",
    title: "keep it reasonable",
    intro:
      "yoink is a utility for preparing tagged audio files from supported music links. use it only where you have the rights and permissions required to do so.",
    bullets: [
      "don't use yoink to infringe copyright or other intellectual-property rights.",
      "don't use it in ways that violate the terms of third-party platforms or content sources.",
      "don't try to bypass restrictions, misuse credentials, or hammer the service around rate limits.",
      "if a source changes, breaks, or disappears, that's part of the deal. availability is never guaranteed.",
    ],
  },
  {
    eyebrow: "privacy",
    title: "what data we touch",
    intro:
      "we keep data collection narrow and operational. no accounts, no ad-tech, no profile building.",
    bullets: [
      "we use IP-based rate limiting in volatile memory to keep the service stable.",
      "application logs use a random request ID for each request that isn't tied to your IP address or identity.",
      "our hosting provider may still generate infrastructure logs such as IP address, timestamp, and status code.",
      "if you send feedback, we receive the fields you submit and any optional email or screenshot you choose to include.",
      "if you submit feedback, this browser can keep an opaque local token so the header can show that report's current status later on this same device.",
    ],
  },
  {
    eyebrow: "storage",
    title: "what we keep and what we don't",
    intro:
      "yoink does not have user accounts or a saved library tied to you. most processing is transient.",
    bullets: [
      "temporary files may exist during server-side processing and are cleaned up after the request finishes.",
      "we don't keep a user-facing download history or permanent personal library.",
      "feedback submissions go to our internal Linear workspace for review.",
      "optional screenshots and contact details are generally removed within 90 days after the related issue is resolved unless still needed for an active issue.",
    ],
  },
  {
    eyebrow: "services",
    title: "who else is involved",
    intro:
      "yoink depends on third-party platforms and metadata providers to do its job. those services have their own rules and privacy terms.",
    bullets: [
      "supported music links, metadata lookups, artwork, and lyrics may involve third-party services.",
      "the exact provider can change over time based on availability and reliability.",
      "we send the minimum request data needed for those services to respond, such as URLs, track names, artist names, and the feedback you submit.",
      "we don't sell personal information or run advertising trackers.",
    ],
  },
  {
    eyebrow: "help",
    title: "formal docs and support",
    intro:
      "this page is the readable version. the formal legal pages still control if there's any conflict.",
    bullets: [
      "read the full terms at /terms.",
      "read the full privacy policy at /privacy.",
      "send general questions, feedback, or privacy requests to me@yoinkify.com.",
      "send copyright concerns to dmca@yoinkify.com.",
    ],
  },
];

export default function RulesPage() {
  return (
    <div className="min-h-screen bg-grid">
      <Header />

      <section className="px-6 pt-20 sm:pt-32 pb-14 sm:pb-20 max-w-3xl mx-auto">
        <div className="space-y-6 animate-fade-in-up" style={{ opacity: 0 }}>
          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.28em]">
            <span className="text-lavender font-bold">plain english</span>
            <span className="text-overlay0/50">last updated april 12, 2026</span>
          </div>
          <h1 className="text-5xl sm:text-7xl font-bold leading-[0.94] tracking-tight text-text">
            the short
            <br />
            <span className="text-lavender">version.</span>
          </h1>
          <p className="text-lg text-subtext0/80 leading-relaxed max-w-xl">
            here&apos;s the readable version of how yoink works, what data we
            touch, and what kind of use is not okay. no legalese marathon
            required.
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      <section className="px-6 py-10 sm:py-14 max-w-3xl mx-auto">
        <div
          className="animate-fade-in-up grid gap-4 sm:grid-cols-3"
          style={{ opacity: 0, animationDelay: "80ms" }}
        >
          <div className="border border-green/20 rounded-lg bg-green/5 p-5 space-y-2">
            <p className="text-[11px] uppercase tracking-[0.24em] font-bold text-green">
              no accounts
            </p>
            <p className="text-sm text-subtext0/80 leading-relaxed">
              no sign-up flow, no user profiles, no saved library tied to an
              account.
            </p>
          </div>
          <div className="border border-lavender/20 rounded-lg bg-lavender/5 p-5 space-y-2">
            <p className="text-[11px] uppercase tracking-[0.24em] font-bold text-lavender">
              limited data
            </p>
            <p className="text-sm text-subtext0/80 leading-relaxed">
              rate limiting, minimal app logs, and optional feedback only.
            </p>
          </div>
          <div className="border border-peach/20 rounded-lg bg-peach/5 p-5 space-y-2">
            <p className="text-[11px] uppercase tracking-[0.24em] font-bold text-peach">
              use your judgment
            </p>
            <p className="text-sm text-subtext0/80 leading-relaxed">
              you are responsible for using the service lawfully and within the
              rules of any third-party service involved.
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      {sections.map((section, index) => (
        <div key={section.title}>
          <section className="px-6 py-12 sm:py-16 max-w-3xl mx-auto">
            <div
              className="animate-fade-in-up grid gap-6 sm:grid-cols-[140px_minmax(0,1fr)]"
              style={{ opacity: 0, animationDelay: `${index * 70}ms` }}
            >
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.26em] font-bold text-overlay0">
                  {section.eyebrow}
                </p>
                <span className="text-3xl font-bold text-surface2">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="space-y-5">
                <div className="space-y-3">
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-text">
                    {section.title}
                  </h2>
                  <p className="text-sm sm:text-base text-subtext0/80 leading-relaxed max-w-2xl">
                    {section.intro}
                  </p>
                </div>
                <div className="grid gap-3">
                  {section.bullets.map((bullet) => (
                    <div
                      key={bullet}
                      className="border border-surface0/60 rounded-lg bg-mantle/35 px-4 py-3 flex gap-3 items-start"
                    >
                      <span className="mt-1 h-2 w-2 rounded-full bg-lavender flex-shrink-0" />
                      <p className="text-sm text-subtext0/80 leading-relaxed">{bullet}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
          {index < sections.length - 1 && (
            <div className="max-w-3xl mx-auto px-6">
              <div className="border-t border-surface0/30" />
            </div>
          )}
        </div>
      ))}

      <div className="max-w-3xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      <section className="px-6 py-12 sm:py-16 max-w-3xl mx-auto">
        <div
          className="animate-fade-in-up border border-surface0/60 rounded-lg p-6 sm:p-8 bg-mantle/40 space-y-5"
          style={{ opacity: 0 }}
        >
          <div className="space-y-2">
            <p className="text-sm font-bold text-text">need the formal version?</p>
            <p className="text-sm text-subtext0/80 leading-relaxed">
              this page is for readability. the actual legal documents still
              live at the links below.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/terms"
              className="btn-press text-xs text-crust bg-lavender hover:bg-mauve px-4 py-2 rounded-md font-bold uppercase tracking-wider transition-colors duration-200"
            >
              terms
            </Link>
            <Link
              href="/privacy"
              className="btn-press text-xs text-text border border-surface0/60 hover:border-surface1/70 hover:bg-surface0/20 px-4 py-2 rounded-md font-bold uppercase tracking-wider transition-all duration-200"
            >
              privacy
            </Link>
            <Link
              href="/feedback"
              className="text-xs text-overlay1 hover:text-lavender transition-colors duration-200 px-1 py-2 uppercase tracking-wider font-bold"
            >
              feedback
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-surface0/40 px-6 py-4 flex items-center justify-between text-xs text-overlay0/50">
        <span>yoink</span>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/terms" className="hover:text-text transition-colors duration-200">
            terms
          </Link>
          <Link href="/privacy" className="hover:text-text transition-colors duration-200">
            privacy
          </Link>
          <a
            href="mailto:me@yoinkify.com"
            className="hover:text-text transition-colors duration-200"
          >
            contact
          </a>
          <a
            href="https://github.com/yoinkify/yoink"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-text transition-colors duration-200"
          >
            star on github
          </a>
        </div>
      </footer>
    </div>
  );
}
