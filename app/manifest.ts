import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OurPool — household expenses",
    short_name: "OurPool",
    description:
      "Household expenses, tracked together. Log everyday spending, plan your monthly budget, and see where your money goes.",
    start_url: "/",
    display: "standalone",
    background_color: "#0d1210",
    theme_color: "#0d1210",
    icons: [
      { src: "/icon-192.png?v=ourpool-1", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png?v=ourpool-1", sizes: "512x512", type: "image/png" },
      {
        src: "/icon-maskable-512.png?v=ourpool-1",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
