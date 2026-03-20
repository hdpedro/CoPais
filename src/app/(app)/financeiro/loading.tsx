export default function Loading() {
  return (
    <div className="space-y-5 pb-20 animate-pulse">
      <div className="h-7 w-40 bg-gray-200 rounded-lg" />
      <div className="flex gap-2">
        <div className="h-9 w-24 bg-gray-200 rounded-lg" />
        <div className="h-9 w-24 bg-gray-100 rounded-lg" />
      </div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm h-[100px]" />
        <div className="bg-white rounded-xl p-4 shadow-sm h-[100px]" />
      </div>
      <div className="bg-white rounded-xl p-4 shadow-sm h-[60px]" />
      {/* Category breakdown */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="h-5 w-32 bg-gray-200 rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <div className="h-4 w-24 bg-gray-100 rounded" />
            <div className="h-4 w-20 bg-gray-100 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
