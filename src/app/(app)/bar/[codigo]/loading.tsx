import { SkeletonCard, SkeletonTitle } from "@/components/shared/loading-skeletons";

export default function BarLoading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonTitle />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={2} />
    </div>
  );
}
