"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface Props {
  slug: string;
}

export function AnalyticsNav({ slug }: Props) {
  const pathname = usePathname();
  const params = useSearchParams();
  const qs = params.toString() ? `?${params.toString()}` : "";

  const base = `/dashboard/${slug}/analytics`;
  const tabs = [
    { href: `${base}`, label: "Visão geral" },
    { href: `${base}/conversions`, label: "Conversões" },
    { href: `${base}/events`, label: "Eventos" },
    { href: `${base}/settings`, label: "Configuração" },
  ];

  return (
    <nav className="flex gap-1 border-b border-border/40 px-6">
      {tabs.map((t) => {
        const active =
          pathname === t.href || (t.href !== base && pathname.startsWith(`${t.href}/`));
        return (
          <Link
            key={t.href}
            href={`${t.href}${qs}`}
            className={cn(
              "px-3 py-2 text-sm transition-colors",
              active
                ? "border-b-2 border-foreground font-medium"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
