import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "yoinkify status — is yoink down?",
  description:
    "live service status for yoinkify.com — check if yoink is down, view uptime, and see the latest updates.",
  keywords: [
    "yoinkify status",
    "is yoink down",
    "is yoinkify down",
    "yoinkify.com status",
    "yoink downloader status",
    "yoinkify uptime",
  ],
  alternates: { canonical: "/status" },
};

export default function StatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
