import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "extras",
  description:
    "guides, tools, and resources for getting the most out of yoink — local files setup, recommended players, roadmap, and service status.",
  alternates: { canonical: "/extras" },
};

export default function ExtrasLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
