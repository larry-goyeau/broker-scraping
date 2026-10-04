// Several ISINs for one code stay on the row. The front searches each of
// them. One ISIN stays the row's own field. None leaves the row alone.
// `groups` is place -> ISINs, the places the scraper already allows.

export function stampIsinMatches(row, groups, ticker) {
  const code = String(ticker || row.ticker || "").trim().toUpperCase();
  const isins = new Set();
  const tokens = new Set();
  for (const [place, ids] of groups) {
    const kept = [];
    for (const raw of ids || []) {
      const isin = String(raw || "").trim().toUpperCase();
      if (/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) kept.push(isin);
    }
    if (!kept.length) continue;
    if (place && code) tokens.add(`${String(place).toUpperCase()}:${code}`);
    for (const isin of kept) {
      isins.add(isin);
      tokens.add(isin);
    }
  }
  if (isins.size < 2) return [...isins][0] || "";
  row.matches = [...tokens].sort();
  return "";
}
