export function CompletenessBadge({ value }: { value: string }) {
  const label =
    value === "HIGH" ? "High" : value === "MEDIUM" ? "Medium" : "More info needed";
  return (
    <span className="inline-flex rounded-full bg-cream-100 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-forest-800">
      Completeness: {label}
    </span>
  );
}
