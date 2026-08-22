import type { Metadata } from "next";
import "./globals.css";
import { Footer } from "@/components/layout/Footer";

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
    <html lang="en" className="dark">
      <body className="bg-[#060709] text-slate-100 antialiased min-h-screen flex flex-col selection:bg-amber-500/30 selection:text-amber-200 font-sans">
        <main className="flex-1">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
