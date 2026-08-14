import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TwoCents — shared expenses",
    short_name: "TwoCents",
    description:
      "The shared expense ledger for couples. Log it in three seconds, see where the month went — together.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1210",
    theme_color: "#0d1210",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
