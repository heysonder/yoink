"use client";

import { useEffect } from "react";

const KOFI_URL = "https://ko-fi.com/chasemarsh";

export default function TipRedirect() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = KOFI_URL;
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-grid flex items-center justify-center px-6">
      <div className="animate-fade-in-up text-center space-y-6" style={{ opacity: 0 }}>
        <div className="space-y-3">
          <p className="text-2xl font-bold text-text">
            <span className="text-lavender">y</span>oink
          </p>
          <div className="flex items-center justify-center gap-2">
            <div className="flex gap-1.5">
              <div className="loading-dot w-1.5 h-1.5 rounded-full bg-peach" />
              <div className="loading-dot w-1.5 h-1.5 rounded-full bg-peach" />
              <div className="loading-dot w-1.5 h-1.5 rounded-full bg-peach" />
            </div>
            <p className="text-sm text-subtext0/80">redirecting to ko-fi</p>
          </div>
        </div>
        <a
          href={KOFI_URL}
          className="btn-press inline-block text-xs text-peach border border-peach/30 hover:bg-peach/10 px-5 py-2.5 rounded-lg font-bold uppercase tracking-wider transition-all duration-200"
        >
          go now
        </a>
      </div>
    </div>
  );
}
