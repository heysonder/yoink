import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "rules — yoink",
  description:
    "plain-English service rules and privacy basics for yoink, including acceptable use, data handling, third-party services, and support contacts.",
  alternates: { canonical: "/rules" },
};

export default function RulesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
