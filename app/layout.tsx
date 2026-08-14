import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Schibsted_Grotesk, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
});
const body = Schibsted_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
});
const money = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-money",
});

export const metadata: Metadata = {
  title: "TwoCents",
  description: "The shared expense ledger for couples. Log it in three seconds, see where the month went — together.",
  appleWebApp: {
    capable: true,
    title: "TwoCents",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d1210",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${money.variable} font-body antialiased`}>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
