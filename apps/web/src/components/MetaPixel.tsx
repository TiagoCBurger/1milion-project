"use client";

import Script from "next/script";
import { useEffect } from "react";

declare global {
  interface Window {
    fbq: ((...args: unknown[]) => void) & { queue?: unknown[] };
    _fbq: typeof window.fbq;
  }
}

interface MetaPixelProps {
  pixelId: string;
  advancedMatching?: {
    em?: string;
    ph?: string;
    fn?: string;
    ln?: string;
    external_id?: string;
  };
}

export function MetaPixel({ pixelId, advancedMatching }: MetaPixelProps) {
  useEffect(() => {
    if (typeof window.fbq === "function") {
      // Already initialized — just init this pixel
      window.fbq("init", pixelId, advancedMatching ?? {});
      window.fbq("track", "PageView");
    }
  }, [pixelId, advancedMatching]);

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${pixelId}', ${JSON.stringify(advancedMatching ?? {})});
            fbq('track', 'PageView');
          `,
        }}
      />
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}
