"use client";

import Script from "next/script";

/**
 * Himetrica site analytics. Isolated into a client component so that
 * React 19 doesn't warn about script tags rendered directly inside the
 * server-side RootLayout.
 */
export function HimetricaTracker() {
  return (
    <Script
      src="https://cdn.himetrica.com/tracker.js"
      data-api-key="hm_b95710e72e1cf9aa202028638f70eaa9313d4a3747881e4a"
      strategy="afterInteractive"
    />
  );
}
