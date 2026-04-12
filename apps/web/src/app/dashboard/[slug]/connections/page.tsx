import { redirect } from "next/navigation";

/** URL antiga; Conexões MCP ficam em Integrações. */
export default async function LegacyConnectionsRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const q = await searchParams;
  const tab = typeof q.tab === "string" ? q.tab : undefined;
  const suffix = tab === "setup" ? "?tab=setup" : "";
  redirect(`/dashboard/${slug}/integrations/mcp${suffix}`);
}
