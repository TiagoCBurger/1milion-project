import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeFly — Manage Meta Ads with AI",
  description:
    "Connect your Meta Ads account to Claude, Cursor, and any AI tool via MCP. Manage campaigns, analyze performance, and optimize ads with natural language.",
  openGraph: {
    title: "VibeFly",
    description:
      "Connect your Meta Ads to any AI tool via MCP. Manage campaigns with natural language.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="scroll-smooth">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
