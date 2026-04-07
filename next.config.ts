import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.scdn.co",
      },
      {
        protocol: "https",
        hostname: "image-cdn-ak.spotifycdn.com",
      },
      {
        protocol: "https",
        hostname: "image-cdn-fa.spotifycdn.com",
      },
      {
        protocol: "https",
        hostname: "*.mzstatic.com",
      },
      {
        protocol: "https",
        hostname: "cdns-images.dzcdn.net",
      },
      {
        protocol: "https",
        hostname: "e-cdns-images.dzcdn.net",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/app/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
        ],
      },
    ];
  },
};

export default nextConfig;
