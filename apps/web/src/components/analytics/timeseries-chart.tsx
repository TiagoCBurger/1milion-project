import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TimeseriesPoint } from "@/lib/analytics/types";

interface Props {
  points: TimeseriesPoint[];
  bucket: "hour" | "day";
}

export function TimeseriesChart({ points, bucket }: Props) {
  const geometry = buildGeometry(points);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessões ao longo do tempo</CardTitle>
      </CardHeader>
      <CardContent>
        {points.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados no período selecionado.</p>
        ) : (
          <div className="space-y-3">
            <svg viewBox="0 0 800 200" className="h-56 w-full" preserveAspectRatio="none">
              <path d={geometry.areaPath} fill="currentColor" className="text-vf-lime/40" />
              <path
                d={geometry.linePath}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                className="text-emerald-600"
              />
            </svg>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatBucket(points[0]?.bucket, bucket)}</span>
              <span>{formatBucket(points[points.length - 1]?.bucket, bucket)}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatBucket(value: string | undefined, bucket: "hour" | "day"): string {
  if (!value) return "";
  const d = new Date(value.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return value;
  return bucket === "hour"
    ? d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function buildGeometry(points: TimeseriesPoint[]): { linePath: string; areaPath: string } {
  if (points.length === 0) return { linePath: "", areaPath: "" };
  const W = 800;
  const H = 200;
  const max = Math.max(1, ...points.map((p) => p.sessions));
  const dx = points.length > 1 ? W / (points.length - 1) : W;
  const coords = points.map((p, i) => {
    const x = Math.round(i * dx);
    const y = Math.round(H - (p.sessions / max) * (H - 10) - 5);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0]} ${H} L${coords[0][0]} ${H} Z`;
  return { linePath: line, areaPath: area };
}
