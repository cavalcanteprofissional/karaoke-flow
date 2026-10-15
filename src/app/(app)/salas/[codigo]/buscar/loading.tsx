import { SkeletonList } from "@/components/shared/loading-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function BuscarLoading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-5 w-36" />
      <div className="bg-card flex flex-col gap-3 rounded-xl border p-4">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
      <SkeletonList rows={3} />
    </div>
  );
}
