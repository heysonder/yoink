import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "best music players for flac, alac & mp3",
  description:
    "best music players for flac, alac, and mp3 files on mac, windows, ios, and android. plays downloaded music with full metadata, album art, and synced lyrics.",
  alternates: { canonical: "/players" },
};

export default function PlayersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
