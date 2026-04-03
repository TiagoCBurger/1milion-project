import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";

export const metadata: Metadata = {
  title: "VibeFly",
  description: "Connect your marketing tools to any AI via MCP. Manage campaigns with natural language.",
  openGraph: {
    title: "VibeFly",
    description: "Connect your marketing tools to any AI via MCP. Manage campaigns with natural language.",
    url: "https://vibefly.app",
    siteName: "VibeFly",
    type: "website",
    images: [{ url: "https://vibefly.app/opengraph-image", width: 1200, height: 630 }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
