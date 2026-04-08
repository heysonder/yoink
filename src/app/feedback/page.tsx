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
      <section className="px-6 pt-16 sm:pt-24 pb-12 sm:pb-16 max-w-2xl mx-auto">
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
        <FeedbackForm />
        <div className="max-w-2xl mx-auto py-8">
          <div className="border-t border-surface0/40" />
        </div>
        <div
          className="animate-fade-in-up border border-surface0/60 rounded-lg p-5 bg-mantle/30 space-y-2"
          style={{ opacity: 0 }}
        >
          <p className="text-xs uppercase tracking-wider font-bold text-text">
            heads up
          </p>
          <p className="text-sm text-subtext0/80 leading-relaxed">
            submissions go to a private backlog only the site owner can see.
            if you add an email, we&apos;ll only use it to follow up.
            emails and screenshots are typically deleted after resolution
            unless still needed for an active issue.
            don&apos;t include passwords or sensitive data.
          </p>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="border-t border-surface0/40" />
      </div>

      {/* Footer */}
      <footer className="border-t border-surface0/40 px-6 py-4 flex items-center justify-between text-xs text-overlay0/50">
        <span>yoink</span>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link href="/extras" className="hover:text-text transition-colors duration-200">extras</Link>
          <Link href="/legal" className="hover:text-text transition-colors duration-200">legal</Link>
          <Link href="/source" className="hover:text-text transition-colors duration-200">source</Link>
        </div>
      </footer>
    </div>
  );
}
