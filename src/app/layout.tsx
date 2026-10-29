import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "VidGrab — Download Videos Without Watermark",
  description:
    "TikTok, Instagram, Facebook, YouTube videos — download in HD without a watermark. Extract MP3 audio, or turn any video or photo into an AI prompt. 100% free.",
  keywords: [
    "video downloader",
    "tiktok no watermark",
    "instagram download",
    "youtube download",
    "facebook video download",
    "mp3 converter",
    "video to prompt",
    "photo to prompt",
    "ai prompt generator",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#07070c] text-zinc-100`}
      >
        {children}
        <Toaster position="top-center" richColors theme="dark" />
      </body>
    </html>
  );
}
