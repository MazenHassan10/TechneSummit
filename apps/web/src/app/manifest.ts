import type { MetadataRoute } from "next";

// Lets the team "Add to Home Screen" with the Great Hall PR icon and open it like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Great Hall PR – Techne Summit Alexandria",
    short_name: "Great Hall PR",
    description: "Speaker & VIP tracking for the Great Hall, Techne Summit Alexandria",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f6fb",
    theme_color: "#105ca8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
