export default function Loading() {
  return (
    <div className="space-y-5 pb-4 animate-pulse">
      {/* Header skeleton */}
      <div>
        <div className="h-7 w-40 bg-gray-200 rounded-lg" />
        <div className="h-4 w-56 bg-gray-100 rounded mt-2" />
      </div>

      {/* Card skeletons */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100/80 h-[120px]" />
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100/80 h-[80px]" />

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 h-[140px]" />
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 h-[140px]" />
      </div>
    </div>
  );
}
