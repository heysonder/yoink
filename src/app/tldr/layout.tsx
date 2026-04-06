import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "tldr — yoink",
  description:
    "plain-English service rules and privacy basics for yoink, including acceptable use, data handling, third-party services, and support contacts.",
  alternates: { canonical: "/tldr" },
};

export default function TldrLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
