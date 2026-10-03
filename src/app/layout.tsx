import type { Metadata } from "next";
import { Fraunces, Noto_Sans_Devanagari, Noto_Sans_Kannada, Noto_Sans_Tamil, Noto_Sans_Telugu, Outfit } from "next/font/google";
import "./globals.css";

const serif = Fraunces({ subsets: ["latin"], variable: "--font-serif" });
const sans = Outfit({ subsets: ["latin"], variable: "--font-sans" });
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "600"], variable: "--font-deva" });
const knda = Noto_Sans_Kannada({ subsets: ["kannada"], weight: ["400", "600"], variable: "--font-knda" });
const taml = Noto_Sans_Tamil({ subsets: ["tamil"], weight: ["400", "600"], variable: "--font-taml" });
const telu = Noto_Sans_Telugu({ subsets: ["telugu"], weight: ["400", "600"], variable: "--font-telu" });

export const metadata: Metadata = {
  title: "HelixStac TryOn",
  description: "White-label hair colour and hairstyle try-on for salons. Live colour stays on the phone. Style previews are a guide.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${serif.variable} ${sans.variable} ${deva.variable} ${knda.variable} ${taml.variable} ${telu.variable}`}>
        <a className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-white focus:px-3 focus:py-2" href="#main">Skip to content</a>
        <div id="main">{children}</div>
      </body>
    </html>
  );
}
