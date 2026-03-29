import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Namma 11",
  description: "Private IPL fantasy league for friends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <html lang="en" className={`${manrope.variable} h-full antialiased`}><body className="min-h-full flex flex-col">{children}</body></html>;
}
