import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  defaultOrganizationSlug,
  fetchSidebarOrganizations,
} from "@/lib/organizations";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaces = await fetchSidebarOrganizations(supabase, user.id);
  const slug = defaultOrganizationSlug(workspaces);

  if (!slug) redirect("/dashboard/new");
  redirect(`/dashboard/${slug}`);
}
