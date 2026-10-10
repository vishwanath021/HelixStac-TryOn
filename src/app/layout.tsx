import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter, Noto_Sans_Devanagari, Noto_Sans_Kannada, Noto_Sans_Tamil, Noto_Sans_Telugu } from "next/font/google";
import { TapFeel } from "@/components/brand/TapFeel";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["600"], variable: "--font-display" });
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "600"], variable: "--font-deva" });
const knda = Noto_Sans_Kannada({ subsets: ["kannada"], weight: ["400", "600"], variable: "--font-knda" });
const taml = Noto_Sans_Tamil({ subsets: ["tamil"], weight: ["400", "600"], variable: "--font-taml" });
const telu = Noto_Sans_Telugu({ subsets: ["telugu"], weight: ["400", "600"], variable: "--font-telu" });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  applicationName: "Lookuvi",
  title: "Lookuvi",
  description: "See your next look.",
  icons: { icon: "/brand/lookuvi-app-icon.png", apple: "/brand/lookuvi-app-icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${deva.variable} ${knda.variable} ${taml.variable} ${telu.variable}`}>
        <TapFeel />
        <a className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-white focus:px-3 focus:py-2" href="#main">Skip to content</a>
        <div id="main">{children}</div>
      </body>
    </html>
  );
}
