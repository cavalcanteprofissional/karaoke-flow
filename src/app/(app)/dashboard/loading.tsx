import {
  SkeletonCard,
  SkeletonList,
  SkeletonTitle,
} from "@/components/shared/loading-skeletons";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonTitle />
      <SkeletonCard lines={2} />
      <SkeletonList rows={2} />
    </div>
  );
}
