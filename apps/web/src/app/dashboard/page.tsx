import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  defaultWorkspaceSlug,
  fetchSidebarWorkspaces,
} from "@/lib/dashboard-workspaces";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaces = await fetchSidebarWorkspaces(supabase, user.id);
  const slug = defaultWorkspaceSlug(workspaces);

  if (!slug) redirect("/dashboard/new");
  redirect(`/dashboard/${slug}`);
}
