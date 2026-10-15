import { SkeletonCard, SkeletonTitle } from "@/components/shared/loading-skeletons";

export default function EntrarLoading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonTitle />
      <SkeletonCard lines={3} />
    </div>
  );
}
