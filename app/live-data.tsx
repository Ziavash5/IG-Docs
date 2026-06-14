/**
 * Live data strip (server component). Pulls the EUR/CAD rate and the Bank of Canada
 * policy rate from official/free APIs, cached for a few hours. Because these values
 * change over time, the page HTML changes too, which signals freshness to crawlers.
 */
async function eurCad(): Promise<string | null> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=CAD", {
      next: { revalidate: 21600 },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { rates?: { CAD?: number } };
    return j.rates?.CAD ? j.rates.CAD.toFixed(3) : null;
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

export async function LiveData() {
  const [cad, rate] = await Promise.all([eurCad(), bocRate()]);
  if (!cad && !rate) return null;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="live-data" aria-label="Live reference data">
      {cad && <span><strong>EUR/CAD</strong> {cad}</span>}
      {rate && <span><strong>Bank of Canada rate</strong> {rate}%</span>}
      <span className="live-data-as-of">as of {today}</span>
    </div>
  );
}
