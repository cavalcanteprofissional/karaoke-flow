import {
  SkeletonCard,
  SkeletonList,
  SkeletonTitle,
} from "@/components/shared/loading-skeletons";

export default function SalaPlayerLoading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonTitle />
      <SkeletonList rows={5} />
      <SkeletonCard lines={2} />
    </div>
  );
}
