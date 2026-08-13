import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Cloche } from "./notifications/cloche";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Suivi Asonkeng",
  description: "Application de suivi des jeunes croyants de l'équipe Asonkeng.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Cloche />
        {children}
      </body>
    </html>
  );
}
