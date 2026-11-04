import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Family Tree",
    short_name: "Family Tree",
    description: "A private record of names, places, and the ties between them.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f4f0",
    theme_color: "#2c4a3e",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
    ],
  };
}
