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
  title: "OurPool",
  applicationName: "OurPool",
  description: "Household expenses, tracked together. Log everyday spending, plan your monthly budget, and see where your money goes.",
  appleWebApp: {
    capable: true,
    title: "OurPool",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: { url: "/ourpool-mark.svg", type: "image/svg+xml" },
    apple: "/apple-touch-icon.png?v=ourpool-1",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d1210",
  width: "device-width",
  initialScale: 1,
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
