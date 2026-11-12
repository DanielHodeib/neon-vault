/** Shown while a page loads: soft placeholders in the page's rough shape. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Lädt">
      <div className="skeleton h-40 sm:h-48" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton h-32" style={{ animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </div>
  );
}
