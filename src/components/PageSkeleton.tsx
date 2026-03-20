export function PageSkeleton({ title, cards = 3 }: { title?: string; cards?: number }) {
  return (
    <div className="space-y-4 pb-20 animate-pulse">
      {/* Title skeleton */}
      <div>
        {title ? (
          <div className="h-7 w-40 bg-gray-200 rounded-lg" />
        ) : (
          <div className="h-7 w-48 bg-gray-200 rounded-lg" />
        )}
        <div className="h-4 w-64 bg-gray-100 rounded mt-2" />
      </div>

      {/* Cards skeleton */}
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl p-4 shadow-sm h-[80px]" />
      ))}
    </div>
  );
}

export function ListPageSkeleton() {
  return (
    <div className="space-y-4 pb-20 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-40 bg-gray-200 rounded-lg" />
        <div className="h-9 w-24 bg-gray-200 rounded-lg" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
          <div className="h-5 w-48 bg-gray-200 rounded mb-2" />
          <div className="h-4 w-32 bg-gray-100 rounded" />
        </div>
      ))}
    </div>
  );
}

export function FormPageSkeleton() {
  return (
    <div className="space-y-4 pb-20 animate-pulse">
      <div className="h-7 w-40 bg-gray-200 rounded-lg" />
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="h-5 w-32 bg-gray-200 rounded" />
        <div className="h-10 w-full bg-gray-100 rounded-lg" />
        <div className="h-10 w-full bg-gray-100 rounded-lg" />
        <div className="h-20 w-full bg-gray-100 rounded-lg" />
        <div className="h-10 w-full bg-gray-200 rounded-lg" />
      </div>
    </div>
  );
}
