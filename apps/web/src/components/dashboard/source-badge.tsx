import { Badge } from "@/components/ui/badge";

export type IntegrationSource = "hotmart";

const LABELS: Record<IntegrationSource, string> = {
  hotmart: "Hotmart",
};

export function SourceBadge({ source }: { source: IntegrationSource }) {
  return (
    <Badge variant="secondary" className="font-normal">
      {LABELS[source]}
    </Badge>
  );
}
