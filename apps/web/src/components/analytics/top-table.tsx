import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TopRow } from "@/lib/analytics/types";

interface Props {
  rows: TopRow[];
  title: string;
}

export function TopTable({ rows, title }: Props) {
  const total = rows.reduce((acc, r) => acc + r.count, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados.</p>
        ) : (
          <ul className="space-y-1.5">
            {rows.map((r) => {
              const pct = total > 0 ? (r.count / total) * 100 : 0;
              return (
                <li key={r.label} className="relative">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-vf-lime/30"
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex items-center justify-between px-2 py-1.5 text-sm">
                    <span className="truncate">{r.label || "(vazio)"}</span>
                    <span className="ml-2 font-medium tabular-nums">{r.count}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
