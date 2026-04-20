import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { fetchSidebarOrganizations } from "@/lib/organizations";

export default async function NewWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const workspaces = await fetchSidebarOrganizations(supabase, user.id);

  const displayName =
    user.user_metadata?.display_name ??
    user.email?.split("@")[0] ??
    "User";

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-sidebar md:flex md:flex-col">
        <AppSidebar
          workspaces={workspaces}
          currentWorkspace={null}
          user={{ email: user.email ?? "", name: displayName }}
        />
      </aside>
      <main className="flex-1 md:ml-64 min-h-screen flex flex-col">{children}</main>
    </div>
  );
}
