import {
  SkeletonCard,
  SkeletonList,
  SkeletonTitle,
} from "@/components/shared/loading-skeletons";

export default function SalaSettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonTitle />
      <SkeletonCard lines={3} />
      <SkeletonList rows={3} />
    </div>
  );
}
