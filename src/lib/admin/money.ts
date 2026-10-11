/** Integer cents only. Never divide by 100 with floating point. */
export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + Math.trunc(value), 0);
}

export function formatCents(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  const negative = cents < 0;
  const abs = Math.abs(Math.trunc(cents));
  const dollars = Math.floor(abs / 100);
  const remainder = abs % 100;
  const body = `${dollars.toLocaleString("en-US")}.${String(remainder).padStart(2, "0")}`;
  return negative ? `-$${body}` : `$${body}`;
}

export function chicagoDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addIsoDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

export type TrendPreset = "7d" | "30d" | "12m";

export function trendQuery(preset: TrendPreset, today = chicagoDate()): {
  granularity: "day" | "month";
  from: string;
  to: string;
} {
  if (preset === "7d") return { granularity: "day", from: addIsoDays(today, -6), to: today };
  if (preset === "30d") return { granularity: "day", from: addIsoDays(today, -29), to: today };
  const [year, month] = today.split("-").map(Number);
  const start = new Date(Date.UTC(year, (month ?? 1) - 1 - 11, 1));
  return { granularity: "month", from: start.toISOString().slice(0, 10), to: today };
}

export function formatCentralTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
