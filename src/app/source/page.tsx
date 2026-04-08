"use client";

import { useEffect, useState } from "react";

export default function SourceRedirect() {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 400);

    const timeout = setTimeout(() => {
      window.location.href = "https://github.com/yoinkify/yoink";
    }, 2000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  return (
    <div className="min-h-screen bg-grid flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold text-text">
          <span className="text-lavender">y</span>oink
        </h1>
        <p className="text-sm text-subtext0 animate-text-shimmer">
          heading to github{dots}
        </p>
      </div>
    </div>
  );
}
