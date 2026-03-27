export default function MaisLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-24 bg-gray-200 rounded-lg" />
      <div className="grid grid-cols-2 gap-3 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 h-[100px]" />
        ))}
      </div>
    </div>
  );
}
