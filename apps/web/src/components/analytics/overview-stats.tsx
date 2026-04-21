import { Activity, Eye, Users, MousePointerClick } from "lucide-react";
import { StatCard } from "@/components/dashboard/stat-card";
import type { OverviewStats } from "@/lib/analytics/types";

function fmt(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

export function OverviewStatsCards({ stats }: { stats: OverviewStats }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard title="Pageviews" value={fmt(stats.pageviews)} icon={Eye} />
      <StatCard title="Sessões" value={fmt(stats.sessions)} icon={Activity} />
      <StatCard title="Visitantes" value={fmt(stats.users)} icon={Users} variant="success" />
      <StatCard title="Total de eventos" value={fmt(stats.events)} icon={MousePointerClick} />
    </div>
  );
}
