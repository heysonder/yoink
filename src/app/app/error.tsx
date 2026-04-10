"use client";

import Link from "next/link";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-grid flex items-center justify-center px-6">
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-2">
          <p className="text-2xl font-bold text-text">something went wrong</p>
          <p className="text-sm text-subtext0/80">
            an unexpected error occurred. try again or go back to the homepage.
          </p>
        </div>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={reset}
            className="btn-press text-xs text-crust bg-lavender hover:bg-mauve px-5 py-2.5 rounded-lg font-bold uppercase tracking-wider transition-colors duration-200"
          >
            try again
          </button>
          <Link
            href="/"
            className="text-xs text-surface2 hover:text-lavender transition-colors duration-200"
          >
            go home
          </Link>
        </div>
      </div>
    </div>
  );
}
