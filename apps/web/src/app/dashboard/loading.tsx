import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 flex-col gap-3 border-r bg-sidebar p-4 md:flex">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-3/4" />
      </aside>
      <main className="flex-1 space-y-4 p-6">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </main>
    </div>
  );
}
