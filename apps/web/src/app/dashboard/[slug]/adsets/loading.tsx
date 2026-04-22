import { Skeleton } from "@/components/ui/skeleton";

export default function AdSetsLoading() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-[500px] w-full rounded-lg" />
    </div>
  );
}
