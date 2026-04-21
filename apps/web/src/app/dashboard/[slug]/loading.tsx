import { Skeleton } from "@/components/ui/skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-6 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
