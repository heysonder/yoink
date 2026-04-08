"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Spinner from "@/components/Spinner";

interface Check {
  name: string;
  ok: boolean;
}

interface HealthData {
  status: string;
  uptime: number;
  latency: string;
  checks: Check[];
}

const serviceLabels: Record<string, string> = {
  spotify: "spotify api",
  ffmpeg: "ffmpeg",
  lrclib: "lyrics",
  itunes: "itunes api",
  deezer: "deezer",
  tidal: "tidal",
  piped: "youtube (piped)",
  curl: "networking",
};

const audioSources = ["deezer", "tidal", "piped"];

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}


export default function StatusPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [uptimePct, setUptimePct] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => { setHealth(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });

    fetch("/api/uptime")
      .then((r) => r.json())
      .then((d) => { if (d.percentage != null) setUptimePct(d.percentage); })
      .catch(() => {});
  }, []);

  const coreChecks = health?.checks.filter((c) => !audioSources.includes(c.name));
  const sourceChecks = health?.checks.filter((c) => audioSources.includes(c.name));
  const allOk = health?.checks.every((c) => c.ok);
  const sourcesUp = sourceChecks?.filter((c) => c.ok).length ?? 0;
  const sourcesTotal = sourceChecks?.length ?? 0;

  return (
    <div className="min-h-screen bg-grid">
      {/* Nav */}
      <nav className="border-b border-surface0/60 px-6 py-4 flex items-center justify-between backdrop-blur-sm bg-base/80 sticky top-0 z-10">
        <Link href="/" className="group">
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

      {/* Live Status */}
      <section className="px-6 pt-12 sm:pt-16 max-w-2xl mx-auto">
        <div className="animate-fade-in-up border border-surface0/60 rounded-lg overflow-hidden bg-mantle/40" style={{ opacity: 0 }}>
          <div className="px-5 py-4 flex items-center justify-between border-b border-surface0/40">
            <div className="flex items-center gap-3">
              {loading ? (
                <div className="w-2.5 h-2.5 rounded-full bg-surface2 animate-pulse" />
              ) : error ? (
                <div className="w-2.5 h-2.5 rounded-full bg-red" />
              ) : allOk ? (
                <div className="w-2.5 h-2.5 rounded-full bg-green" />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full bg-peach" />
              )}
              <span className="text-xs font-bold uppercase tracking-wider text-text">
                {loading ? "checking" : error ? "unreachable" : allOk ? "all systems operational" : "degraded"}
              </span>
            </div>
            {health && (
              <span className="text-[10px] text-overlay0/60">
                {uptimePct && <>{uptimePct}% &middot; </>}up {formatUptime(health.uptime)} &middot; {health.latency}
              </span>
            )}
          </div>

          {health && (
            <div className="divide-y divide-surface0/30">
              {/* Core services */}
              <div className="px-5 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
                {coreChecks?.map((c) => (
                  <div key={c.name} className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.ok ? "bg-green" : "bg-red"}`} />
                    <span className={`text-[11px] ${c.ok ? "text-subtext0/70" : "text-red/80"}`}>
                      {serviceLabels[c.name] || c.name}
                    </span>
                  </div>
                ))}
              </div>

              {/* Audio sources */}
              <div className="px-5 py-3">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    sourcesUp === sourcesTotal ? "bg-green" : sourcesUp === 0 ? "bg-red" : "bg-peach"
                  }`} />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-overlay0/60">
                    download sources
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2.5">
                  {sourceChecks?.map((c) => (
                    <div key={c.name} className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.ok ? "bg-green" : "bg-red"}`} />
                      <span className={`text-[11px] ${c.ok ? "text-subtext0/70" : "text-red/80"}`}>
                        {serviceLabels[c.name] || c.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {loading && (
            <div className="px-5 py-4 flex items-center gap-2">
              <Spinner className="w-3 h-3 text-overlay0" />
              <span className="text-[11px] text-overlay0/50">checking services</span>
            </div>
          )}
        </div>
      </section>

      {/* Separator */}
      <div className="max-w-2xl mx-auto px-6 pt-12 sm:pt-16">
        <div className="border-t border-surface0/40" />
        <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-overlay0/40 pt-4">updates</p>
      </div>

      {/* Content */}
      <article className="px-6 pt-8 sm:pt-10 pb-16 sm:pb-24 max-w-2xl mx-auto">
        <div className="space-y-12 animate-fade-in-up" style={{ opacity: 0, animationDelay: "100ms" }}>
          {/* Header */}
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold uppercase tracking-widest text-peach/80 border border-peach/25 rounded px-1.5 py-0.5">
                march 20, 2026
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight text-text">
              yoink moved to<br />
              <span className="text-lavender">yoinkify.com</span>
            </h1>
          </div>

          {/* Body */}
          <div className="space-y-6 text-sm text-subtext0/90 leading-relaxed">
            <p>
              so if you&apos;ve been trying to use yoink this past week and a half and nothing was loading — yeah, that was real. sorry about that.
            </p>

            <p>
              here&apos;s what happened: a handful of automated security scanners — google safe browsing, CRDF, alphaMountain, a few others — flagged yoinkify.lol as a phishing site. it&apos;s not, obviously. it&apos;s a music downloader. but these systems are automated and don&apos;t really care about context.
            </p>

            <p>
              the .lol domain registry (run by XYZ) saw those flags and put a <code className="text-xs bg-surface0/60 px-1.5 py-0.5 rounded text-peach">serverHold</code> on the domain. that basically deletes it from DNS entirely — the domain just stops existing on the internet. no warning, no email, nothing. i found out because the site was down.
            </p>

            <p>
              the fun part — to get the domain back, they told me to get delisted from the security vendors first. but you can&apos;t exactly prove your website is safe when your website doesn&apos;t exist anymore. so that was a dead end.
            </p>

            <p>
              i&apos;ve submitted appeals to every vendor that flagged it and filed an unsuspend request with the registry, but honestly that could take weeks. in the meantime i grabbed yoinkify.com and moved everything over. if the old domain ever comes back i&apos;ll set up a redirect.
            </p>

            <h2 className="text-lg font-bold text-text pt-4">does everything work?</h2>

            <p>
              yep. tracks, playlists, albums, lossless, metadata, lyrics — it&apos;s all back. i also added some fallback systems while i was in there so the app is more resilient now than it was before the outage.
            </p>

            <p>
              update your bookmarks to <span className="text-lavender font-bold">yoinkify.com</span> and you&apos;re set. if something&apos;s broken, hit me at{" "}
              <a href="mailto:me@yoinkify.com" className="text-lavender hover:text-mauve transition-colors underline">
                me@yoinkify.com
              </a>.
            </p>

            <p>
              again — really sorry about the downtime. i know a lot of you rely on this and two weeks of nothing is rough. appreciate everyone who stuck around.
            </p>
          </div>

          {/* CTA */}
          <div className="border border-surface0/60 rounded-lg p-6 sm:p-8 bg-mantle/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
            <div className="space-y-1">
              <p className="text-base font-bold text-text">back to it</p>
              <p className="text-sm text-overlay0">yoink is live at yoinkify.com.</p>
            </div>
            <Link
              href="/app"
              className="btn-press text-sm text-crust bg-lavender hover:bg-mauve px-6 py-3 rounded-lg font-bold uppercase tracking-wider transition-colors duration-200 flex-shrink-0"
            >
              open yoink
            </Link>
          </div>
        </div>
      </article>

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
