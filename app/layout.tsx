import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "./workspace.css";
import "./siting.css";
import "./map-studio.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "ДСЦТС · Сэргээгдэх эрчим хүчний төлөвлөлт",
  description: "Цахилгаан сүлжээ, газрын гадарга, замын хүртээмжид тулгуурласан нар, салхины эрчим хүчний байршлын үнэлгээ.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="mn"
      className={inter.variable}
      data-theme="light"
    >
      <body>{children}</body>
    </html>
  );
}
