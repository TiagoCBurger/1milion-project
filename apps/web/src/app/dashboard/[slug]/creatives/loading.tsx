import { Skeleton } from "@/components/ui/skeleton";

export default function CreativesLoading() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full" />
        ))}
      </div>
    </div>
  );
}
