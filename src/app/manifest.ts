import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lookuvi",
    short_name: "Lookuvi",
    description: "See your next look.",
    start_url: "/",
    display: "standalone",
    background_color: "#F3F0F8",
    theme_color: "#3E304B",
    icons: [
      { src: "/brand/lookuvi-app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/lookuvi-app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
