import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "search & download songs by name",
  description:
    "search for any song by name, artist, or lyrics and download it in lossless flac, alac, or 320kbps mp3. no spotify link needed.",
  alternates: { canonical: "/search" },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
