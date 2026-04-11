"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type CampaignsTopNavActive = "campaigns" | "creatives" | "insights" | "pages";

export function CampaignsTopNav({
  slug,
  active,
}: {
  slug: string;
  active: CampaignsTopNavActive;
}) {
  const base = "rounded-lg px-3 py-2 text-sm transition-colors";
  const inactive = "text-muted-foreground hover:bg-muted/80 hover:text-foreground";
  const current = "bg-card font-medium text-foreground shadow-sm ring-1 ring-border/60";

  const items: { href: string; key: CampaignsTopNavActive; label: string }[] = [
    { href: `/dashboard/${slug}/campaigns`, key: "campaigns", label: "Campanhas" },
    { href: `/dashboard/${slug}/creatives`, key: "creatives", label: "Criativos" },
    { href: `/dashboard/${slug}/insights`, key: "insights", label: "Insights" },
    { href: `/dashboard/${slug}/pages`, key: "pages", label: "Páginas Facebook" },
  ];

  return (
    <div className="shrink-0 border-b border-border/40 bg-muted/15">
      <nav className="mx-auto flex max-w-5xl gap-1 px-6 py-2" aria-label="Seções de campanhas">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={cn(base, active === item.key ? current : inactive)}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
