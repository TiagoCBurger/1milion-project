"use client";

import { useEffect, useState } from "react";
import { Activity, Eye, Users, MousePointerClick } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import type { OverviewStats } from "@/lib/analytics/types";

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

export function OverviewStatsCards({ siteId, range }: { siteId: string; range: string }) {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setErr(null);
    (async () => {
      try {
        const res = await fetch(`/api/analytics/${siteId}/overview?range=${range}`, {
          cache: "no-store",
        });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) setErr(body?.error ?? "Erro ao carregar");
        else setStats(body.stats as OverviewStats);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [siteId, range]);

  if (err) return <p className="text-sm text-red-600">Falha ao carregar overview: {err}</p>;

  const v = stats ?? { events: 0, pageviews: 0, sessions: 0, users: 0 };
  const placeholder = stats ? undefined : "…";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Pageviews" value={placeholder ?? fmt(v.pageviews)} icon={Eye} />
      <StatCard title="Sessões" value={placeholder ?? fmt(v.sessions)} icon={Activity} />
      <StatCard title="Visitantes" value={placeholder ?? fmt(v.users)} icon={Users} variant="success" />
      <StatCard title="Total de eventos" value={placeholder ?? fmt(v.events)} icon={MousePointerClick} />
    </div>
  );
}
