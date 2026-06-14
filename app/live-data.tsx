/**
 * Live data strip (server component), corridor-aware. Shows the corridor currency vs CAD
 * plus the Bank of Canada policy rate, from official/free APIs, cached for a few hours.
 * As these values change the page HTML changes too, signalling freshness to crawlers.
 */

// Corridor slug -> ISO currency. Add new corridors here as they launch.
const CORRIDOR_CURRENCY: Record<string, string> = {
  germany: "EUR", austria: "EUR", france: "EUR", netherlands: "EUR", italy: "EUR", spain: "EUR",
  switzerland: "CHF", uk: "GBP", "united-kingdom": "GBP",
  usa: "USD", "united-states": "USD", japan: "JPY", brazil: "BRL", india: "INR",
  australia: "AUD", "new-zealand": "NZD", china: "CNY", mexico: "MXN", "south-korea": "KRW",
};

async function fxToCad(currency: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=CAD`, {
      next: { revalidate: 21600 },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { rates?: Record<string, number> };
    const v = j.rates?.CAD;
    return typeof v === "number" ? v.toFixed(3) : null;
  } catch {
    return null;
  }
}

async function bocRate(): Promise<string | null> {
  try {
    const res = await fetch("https://www.bankofcanada.ca/valet/observations/V39079/json?recent=1", {
      next: { revalidate: 21600 },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { observations?: { V39079?: { v: string } }[] };
    return j.observations?.[0]?.V39079?.v ?? null;
  } catch {
    return null;
  }
}

export async function LiveData({ corridor }: { corridor: string }) {
  const currency = CORRIDOR_CURRENCY[corridor];
  const [fx, rate] = await Promise.all([currency ? fxToCad(currency) : Promise.resolve(null), bocRate()]);
  if (!fx && !rate) return null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="live-data" aria-label="Live reference data">
      {fx && <span><strong>{currency}/CAD</strong> {fx}</span>}
      {rate && <span><strong>Bank of Canada rate</strong> {rate}%</span>}
      <span className="live-data-as-of">as of {today}</span>
    </div>
  );
}
