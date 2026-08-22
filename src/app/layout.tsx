import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { Footer } from "@/components/layout/Footer";

/**
 * Self-hosted at build time. A runtime <link> to fonts.googleapis.com would
 * disclose every visitor's IP address to Google before they consent to
 * anything (the LG München I fact pattern), and costs two render-blocking
 * round trips on top. next/font downloads the woff2 during the build and
 * serves it from our own origin, so neither happens.
 *
 * Variable axis 300–900: the design system uses 400/500/600/700/800.
 */
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-figtree",
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "") || "https://showitglo.com";

/**
 * Scrapers (X, Slack, iMessage, WhatsApp) never run our JS and never resolve a
 * relative image path — they read the raw <head> and fetch absolute URLs only.
 * metadataBase is what lets Next emit "/og.png" as an absolute og:image; without
 * it the card degrades to the blank grey placeholder X shows for a link with no
 * image at all.
 */
const socialCard = {
  url: "/og.png",
  width: 1200,
  height: 630,
  alt: "ShowItGlo — let the world decide what opinion is real.",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "ShowItGlo — Let the World Decide What Opinion is Real",
  description: "Always wanted to share your opinion but you didn't get the stage or got censored? We don't! The permanent public arena where the world decides what opinion is real.",
  openGraph: {
    title: "ShowItGlo — Let the World Decide What Opinion is Real",
    description: "Always wanted to share your opinion but you didn't get the stage or got censored? We don't! The uncensored public stage where money and community votes rank the truth.",
    url: siteUrl,
    siteName: "ShowItGlo",
    type: "website",
    images: [socialCard],
  },
  /* X reads its own namespace first and falls back to a small square thumbnail
     unless the card type is declared. summary_large_image is the 1.91:1 slot the
     og.png above is cut for. */
  twitter: {
    card: "summary_large_image",
    title: "ShowItGlo — Let the World Decide What Opinion is Real",
    description: "The permanent public leaderboard for unfiltered debates and community stances. 100% transparent, pure conviction, zero gambling.",
    images: [socialCard],
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`dark ${figtree.variable}`}>
      {/* Ground, ink and selection all come from the tokens in globals.css —
          hard-coded utilities here would silently outrank the design system. */}
      <body className="font-sans antialiased min-h-screen flex flex-col">
        <main className="flex-1">
          {children}
        </main>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
