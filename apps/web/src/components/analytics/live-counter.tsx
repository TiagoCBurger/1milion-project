"use client";

import { useEffect, useState } from "react";
import { Circle } from "lucide-react";

export function LiveCounter({ siteId }: { siteId: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/analytics/${siteId}/live`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { active_sessions?: number };
        if (!cancelled) setCount(data.active_sessions ?? 0);
      } catch {
        // ignore transient errors
      }
    }
    load();
    const t = setInterval(load, 10_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [siteId]);

  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-border/40 bg-card px-3 py-1.5 text-sm">
      <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500 animate-pulse" />
      <span className="text-muted-foreground">Ao vivo:</span>
      <span className="font-semibold">{count ?? "–"}</span>
    </div>
  );
}
