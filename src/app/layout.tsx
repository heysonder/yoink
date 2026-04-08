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
    "spotify to alac",
    "spotify lossless download",
    "download spotify songs",
    "spotify playlist downloader",
    "spotify album downloader",
    "spotify mp3 converter",
    "music link downloader",
    "tagged music downloads",
    "lossless music downloader",
    "spotify hifi download",
    "apple music downloader",
    "youtube music downloader",
    "free music downloader",
    "download music with lyrics",
    "spotify downloader no ads",
    "yoink",
    "yoinkify",
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
  "@graph": [
    {
      "@type": "WebApplication",
      name: "yoink",
      alternateName: ["yoinkify", "yoink downloader", "spotify to flac", "spotify downloader"],
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
        "Playlist and album download",
        "Lossless FLAC and ALAC download",
        "320kbps MP3 conversion",
        "ID3v2 metadata embedding",
        "Album art embedding",
        "Synced lyrics embedding",
        "Apple Music and YouTube link support",
        "No account required",
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What is yoink?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "yoink is a free tool that lets you download music from Spotify, Apple Music, and YouTube links in lossless FLAC, ALAC, or 320kbps MP3 with full metadata, album art, and synced lyrics.",
          },
        },
        {
          "@type": "Question",
          name: "Is yoink free?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes, yoink is completely free with no accounts, no ads, and no download limits.",
          },
        },
        {
          "@type": "Question",
          name: "What formats does yoink support?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "yoink supports lossless FLAC, Apple Lossless (ALAC), and 320kbps MP3. All formats include embedded metadata, album art, and lyrics.",
          },
        },
        {
          "@type": "Question",
          name: "Can I download entire playlists?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes, paste a Spotify playlist or album link and yoink will download all tracks with full metadata tagging.",
          },
        },
      ],
    },
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
