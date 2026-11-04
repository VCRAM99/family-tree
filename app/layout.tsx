import { Instrument_Serif, Inter } from "next/font/google";
import type { ReactNode } from "react";

import { ThemeRoot } from "@/components/theme-provider";
import { resolveDocumentTheme } from "@/lib/server/theme";

import "./globals.css";

const display = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000"),
  title: "Family Tree",
  description: "A quiet place for the people who made you.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await resolveDocumentTheme();

  return (
    <html lang="en" data-theme={theme} className={`${display.variable} ${sans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeRoot initialTheme={theme}>{children}</ThemeRoot>
      </body>
    </html>
  );
}
