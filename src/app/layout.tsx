import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "yoink | download from spotify links",
    template: "%s — yoink",
  },
  description:
    "download tracks and playlists from spotify links in lossless flac, alac, or 320kbps mp3 with metadata, album art, and lyrics. no account required.",
  keywords: [
    "download from spotify links",
    "spotify to mp3",
    "spotify to flac",
    "spotify lossless download",
    "download spotify songs",
    "spotify playlist downloader",
    "spotify mp3 converter",
    "music link downloader",
    "tagged music downloads",
    "lossless music downloader",
    "spotify hifi download",
    "yoink",
  ],
  metadataBase: new URL("https://yoinkify.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "yoink | download from spotify links",
    description:
      "download tracks and playlists from spotify links in lossless flac, alac, or 320kbps mp3. metadata and album art included. no account required.",
    siteName: "yoink",
    type: "website",
    locale: "en_US",
    url: "https://yoinkify.com",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "yoink | download from spotify links",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "yoink | download from spotify links",
    description:
      "download tracks and playlists from spotify links in lossless flac, alac, or 320kbps mp3. metadata and album art included.",
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Static JSON-LD structured data for SEO - no user input, safe to inline
const jsonLd = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "yoink",
  url: "https://yoinkify.com",
  description:
    "Download tracks and playlists from Spotify links in lossless FLAC, ALAC, or 320kbps MP3 with full metadata, album art, and lyrics.",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Any",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "Track download from Spotify links",
    "Playlist download from Spotify links",
    "Lossless FLAC download",
    "Lossless ALAC download",
    "320kbps MP3 conversion",
    "ID3v2 metadata embedding",
    "Album art embedding",
    "Synced lyrics embedding",
  ],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
      </head>
      <body className="antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
