export default function Loading() {
  return (
    <div className="max-w-lg mx-auto pb-20 animate-pulse">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-6 h-6 bg-gray-200 rounded" />
        <div>
          <div className="h-7 w-24 bg-gray-200 rounded-lg" />
          <div className="h-4 w-40 bg-gray-100 rounded mt-1" />
        </div>
      </div>
      {/* Child selector */}
      <div className="flex gap-2 mb-6">
        <div className="h-9 w-20 bg-gray-200 rounded-full" />
        <div className="h-9 w-20 bg-gray-100 rounded-full" />
        <div className="h-9 w-20 bg-gray-100 rounded-full" />
      </div>
      {/* Quick access grid */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-3 shadow-sm h-[80px]" />
        ))}
      </div>
      {/* Recent logs */}
      <div className="bg-white rounded-xl p-4 shadow-sm h-[120px]" />
    </div>
  );
}
