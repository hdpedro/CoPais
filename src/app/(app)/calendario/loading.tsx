export default function CalendarioLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-32 bg-gray-200 rounded-lg" />
        <div className="flex gap-2">
          <div className="h-10 w-20 bg-gray-100 rounded-xl" />
          <div className="h-10 w-24 bg-gray-200 rounded-xl" />
        </div>
      </div>

      {/* Calendar skeleton */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
        <div className="flex justify-between items-center mb-4">
          <div className="w-6 h-6 bg-gray-100 rounded" />
          <div className="h-6 w-36 bg-gray-200 rounded" />
          <div className="w-6 h-6 bg-gray-100 rounded" />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-50 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
