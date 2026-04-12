import { redirect } from "next/navigation";

/** Guia de setup foi unificado com Conexões MCP. */
export default async function SetupRedirectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/dashboard/${slug}/integrations/mcp?tab=setup`);
}
