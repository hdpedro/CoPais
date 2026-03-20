export default function DashboardLoading() {
  return (
    <div className="space-y-5 pb-4 animate-pulse">
      {/* Greeting skeleton */}
      <div>
        <div className="h-8 w-48 bg-gray-200 rounded-lg" />
        <div className="h-4 w-64 bg-gray-100 rounded mt-2" />
      </div>

      {/* Hero card skeleton */}
      <div className="rounded-2xl bg-[#1A3B3A] p-5 h-[140px]" />

      {/* Week strip skeleton */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
        <div className="flex justify-between">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5 py-2 px-2">
              <div className="w-4 h-3 bg-gray-100 rounded" />
              <div className="w-6 h-5 bg-gray-200 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Financial skeleton */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 h-[72px]" />

      {/* Grid skeleton */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 h-[160px]" />
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 h-[160px]" />
      </div>
    </div>
  );
}
