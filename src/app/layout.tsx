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

export const metadata: Metadata = {
  title: "ShowItGlo — Let the World Decide What Opinion is Real",
  description: "Always wanted to share your opinion but you didn't get the stage or got censored? We don't! The permanent public arena where the world decides what opinion is real.",
  openGraph: {
    title: "ShowItGlo — Let the World Decide What Opinion is Real",
    description: "Always wanted to share your opinion but you didn't get the stage or got censored? We don't! The uncensored public stage where money and community votes rank the truth.",
    url: "https://showitglo.com",
    siteName: "ShowItGlo",
    type: "website",
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
