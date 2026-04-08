import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "legal",
  description:
    "terms of service, privacy policy, and plain-english rules for using yoink.",
  alternates: { canonical: "/legal" },
};

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
