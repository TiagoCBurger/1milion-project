import { ConversionsTable } from "@/components/analytics/conversions-table";
import {
  AnalyticsToolbar,
  NoSitesState,
  resolveContext,
  type SearchParams,
} from "../_shared";

export default async function AnalyticsConversionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await resolveContext(slug, sp);

  if (!ctx.site) return <NoSitesState slug={slug} />;

  return (
    <>
      <AnalyticsToolbar slug={slug} sites={ctx.sites} site={ctx.site} range={ctx.range} />
      <div className="p-6">
        <ConversionsTable siteId={ctx.site.id} range={ctx.range} />
      </div>
    </>
  );
}
