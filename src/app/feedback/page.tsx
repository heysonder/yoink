import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import FeedbackForm from "@/components/FeedbackForm";

export const metadata: Metadata = {
  title: "feedback",
  description:
    "report bugs or request features for yoink. submissions go straight to our backlog for review.",
  openGraph: {
    title: "feedback — yoink",
    description:
      "report bugs or request features for yoink.",
  },
};

export default function FeedbackPage() {
  return (
    <div className="min-h-screen bg-grid">
      <Header />

      {/* Hero */}
      <section className="px-6 pt-20 sm:pt-32 pb-16 sm:pb-24 max-w-2xl mx-auto">
        <div className="space-y-6 animate-fade-in-up" style={{ opacity: 0 }}>
          <p className="text-xs text-lavender uppercase tracking-[0.3em] font-bold">
            feedback
          </p>
          <h1 className="text-5xl sm:text-7xl font-bold leading-[0.95] tracking-tight text-text">
            tell us what&apos;s
            <br />
            <span className="text-lavender">broken.</span>
          </h1>
          <p className="text-lg text-subtext0/80 leading-relaxed max-w-md">
            found a bug? want a feature? let us know and we&apos;ll
            take a look.
          </p>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      {/* Form */}
      <section className="px-6 py-16 max-w-2xl mx-auto">
        <div
          className="animate-fade-in-up border border-surface0/60 rounded-lg p-5 mb-5 bg-mantle/30 space-y-2"
          style={{ opacity: 0 }}
        >
          <p className="text-xs uppercase tracking-wider font-bold text-text">
            before you submit
          </p>
          <p className="text-sm text-subtext0/80 leading-relaxed">
            feedback goes to our internal Linear backlog. if you add an email,
            we may use it to follow up. if you upload a screenshot, it will be
            stored with the ticket. only the site owner can access that
            workspace. optional emails and screenshots are kept for up to 90
            days after a ticket is resolved unless they&apos;re still needed for
            an active issue. don&apos;t include sensitive personal data.
          </p>
        </div>
        <FeedbackForm />
      </section>

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      {/* Footer */}
      <footer className="border-t border-surface0/40 px-6 py-4 flex items-center justify-between text-xs text-overlay0/50">
        <span>yoink</span>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/how" className="text-mauve/60 hover:text-mauve transition-colors duration-200">local files</Link>
          <Link href="/players" className="text-green/60 hover:text-green transition-colors duration-200">players</Link>
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
