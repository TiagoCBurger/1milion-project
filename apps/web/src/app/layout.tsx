import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import Script from 'next/script'

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
      <head>
        <meta property="fb:app_id" content="1330746402408443" />
      </head>
      <body className="min-h-screen antialiased">
      <Script
  src="https://cdn.himetrica.com/tracker.js"
  data-api-key="hm_b95710e72e1cf9aa202028638f70eaa9313d4a3747881e4a"
  strategy="afterInteractive"
/> 
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
