"use client";

import { useEffect, useRef, useCallback } from "react";

interface TurnstileProps {
  onToken: (token: string) => void;
  onExpire?: () => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export default function Turnstile({ onToken, onExpire }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || !SITE_KEY) return;
    if (widgetIdRef.current) return; // already rendered

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      theme: "dark",
      appearance: "interaction-only",
      callback: (token: string) => onToken(token),
      "expired-callback": () => onExpire?.(),
    });
  }, [onToken, onExpire]);

  useEffect(() => {
    if (!SITE_KEY) return;

    // If turnstile script already loaded
    if (window.turnstile) {
      renderWidget();
      return;
    }

    // Load the script
    window.onTurnstileLoad = renderWidget;
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
    script.async = true;
    document.head.appendChild(script);

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  if (!SITE_KEY) return null;

  return <div ref={containerRef} />;
}

export function resetTurnstile(widgetContainer: HTMLElement | null) {
  if (!widgetContainer || !window.turnstile) return;
  const widgetId = widgetContainer.querySelector("iframe")?.closest("[data-widget-id]")?.getAttribute("data-widget-id");
  if (widgetId) window.turnstile.reset(widgetId);
}
