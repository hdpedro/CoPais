export default function Loading() {
  return (
    <div className="space-y-4 pb-20 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 bg-gray-200 rounded-lg" />
        <div className="h-4 w-24 bg-gray-100 rounded" />
      </div>
      {/* Messages skeleton */}
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
          <div className="bg-white rounded-xl p-3 shadow-sm w-3/4 h-[50px]" />
        </div>
        <div className="flex gap-2 justify-end">
          <div className="bg-[#D4735A]/10 rounded-xl p-3 w-2/3 h-[50px]" />
        </div>
        <div className="flex gap-2">
          <div className="w-8 h-8 bg-gray-200 rounded-full flex-shrink-0" />
          <div className="bg-white rounded-xl p-3 shadow-sm w-1/2 h-[50px]" />
        </div>
      </div>
      {/* Input skeleton */}
      <div className="h-12 w-full bg-gray-100 rounded-xl" />
    </div>
  );
}
