import type { Metadata, Viewport } from "next";
import { Rubik } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";

const rubik = Rubik({ variable: "--font-rubik", subsets: ["latin"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Great Hall PR – Techne Summit",
  description: "Speaker & VIP tracking for the Great Hall, Techne Summit Alexandria",
  applicationName: "Great Hall PR",
  appleWebApp: { capable: true, title: "Great Hall PR", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#105ca8", width: "device-width", initialScale: 1, maximumScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${rubik.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
