export default function DecisoesLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-40 bg-gray-200 rounded-lg" />
      <div className="h-4 w-56 bg-gray-100 rounded" />
      <div className="space-y-3 mt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 h-[100px]" />
        ))}
      </div>
    </div>
  );
}
