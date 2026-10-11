export type ChartSeries = {
  id: string;
  label: string;
  color: string;
  values: Array<number | null>;
  formatValue?: (value: number) => string;
};

function formatCell(series: ChartSeries, value: number | null): string {
  if (value == null) return "—";
  return series.formatValue ? series.formatValue(value) : value.toLocaleString("en-US");
}

/** Hand-built bar chart. Values stay integers; a missing point is a dash, not a zero. */
export function MiniChart({
  title,
  description,
  labels,
  series,
}: {
  title: string;
  description: string;
  labels: string[];
  series: ChartSeries[];
}) {
  const titleId = `chart-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  const numbers = series.flatMap((item) => item.values.filter((value): value is number => value != null));
  const max = Math.max(1, ...numbers);
  const width = 640;
  const height = 160;
  const pad = 4;
  const groupWidth = labels.length > 0 ? (width - pad * 2) / labels.length : 0;
  const barWidth = series.length > 0 ? Math.max(1.5, (groupWidth * 0.72) / series.length) : 0;

  return (
    <figure className="min-w-0 rounded-3xl border border-forest-800/10 bg-cream-50 px-4 py-4">
      <figcaption>
        <h3 id={titleId} className="font-display text-xl text-forest-800">
          {title}
        </h3>
        <p className="mt-1 text-sm text-ink-700">{description}</p>
      </figcaption>
      {labels.length === 0 ? (
        <p className="mt-4 text-sm text-ink-700">No buckets in this range.</p>
      ) : (
        <svg
          role="img"
          aria-labelledby={titleId}
          viewBox={`0 0 ${width} ${height}`}
          className="mt-4 h-40 w-full"
        >
          <title>{title}</title>
          {labels.map((_, index) => {
            const groupX = pad + index * groupWidth + (groupWidth - barWidth * series.length) / 2;
            return series.map((item, seriesIndex) => {
              const value = item.values[index];
              if (value == null) return null;
              const barHeight = Math.max(0, (value / max) * (height - 8));
              return (
                <rect
                  key={`${item.id}-${labels[index]}`}
                  x={groupX + seriesIndex * barWidth}
                  y={height - barHeight}
                  width={Math.max(barWidth - 1, 1)}
                  height={barHeight}
                  fill={item.color}
                  rx={1}
                >
                  <title>{`${labels[index]} ${item.label}: ${formatCell(item, value)}`}</title>
                </rect>
              );
            });
          })}
        </svg>
      )}
      {labels.length > 0 ? (
        <div className="mt-4 max-h-48 overflow-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title} values</caption>
            <thead>
              <tr className="text-xs uppercase tracking-[0.14em] text-gold-700">
                <th scope="col" className="py-1 pr-3 font-semibold">
                  Period
                </th>
                {series.map((item) => (
                  <th key={item.id} scope="col" className="py-1 pr-3 font-semibold">
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, index) => (
                <tr key={label} className="border-t border-forest-800/10">
                  <th scope="row" className="py-1 pr-3 font-medium text-forest-800">
                    {label}
                  </th>
                  {series.map((item) => (
                    <td key={item.id} className="py-1 pr-3 text-ink-700">
                      {formatCell(item, item.values[index] ?? null)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </figure>
  );
}
