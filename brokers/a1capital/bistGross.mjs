// The Borsa Istanbul shares under gross settlement ("brüt takas") today,
// for a broker that does not take online orders in them (A1 Capital in
// ./a1capital_scraping.mjs: "Brüt Takas uygulaması dahilinde olan hisse
// senetleri için online kanallardan alım/satım emri girilemez").
//
// The exchange puts a share under gross settlement as a market measure
// (and every share of the Watchlist Market, Yakın İzleme Pazarı, is
// under it). Its end-of-day equity bulletin flags each line in the column
// "BRUT TAKAS" / "GROSS SETTLEMENT" (1 = under the measure). The bulletin is
// the one ../halkyatrm/bistBook.mjs reads (latestBulletin), so the codes
// match bistBook's rows of the same day. The exchange's own measures file
// (https://www.borsaistanbul.com/erd/menkul_tedbir_listesi.csv) came back
// empty on 2026-10-28, so the bulletin column is used.
//
//   import { grossSettlement } from "../a1capital/bistGross.mjs";
//   const { codes, day } = await grossSettlement();   // Set of share codes
//
//   node brokers/a1capital/bistGross.mjs      prints them

import { latestBulletin } from "../halkyatrm/bistBook.mjs";

export async function grossSettlement() {
  const bulletin = await latestBulletin();
  const lines = bulletin.text.split(/\r?\n/).filter(Boolean).map((line) => line.split(";"));
  const head = lines[1] || [];
  const col = (name) => {
    const index = head.indexOf(name);
    if (index < 0) throw new Error(`bulletin has no column ${name}`);
    return index;
  };
  const at = { code: col("INSTRUMENT SERIES CODE"), market: col("MARKET"), group: col("INSTRUMENT GROUP"), gross: col("GROSS SETTLEMENT") };
  const codes = new Set();
  let shares = 0;
  for (const cells of lines.slice(2)) {
    if (cells[at.market] !== "MSPOT" || !["EQT", "ETF"].includes(cells[at.group])) continue;
    shares += 1;
    if (cells[at.gross] === "1") codes.add(cells[at.code].split(".")[0]);
  }
  if (shares < 550) throw new Error(`bulletin lists only ${shares} spot lines`);
  // 89 lines on 2026-10-28; far more would mean the column changed meaning.
  if (codes.size > 250) throw new Error(`${codes.size} lines under gross settlement, check the bulletin`);
  return { codes, day: bulletin.day, url: bulletin.url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { codes, day } = await grossSettlement();
  console.log(`${day}: ${codes.size} lines under gross settlement: ${[...codes].sort().join(" ")}`);
}
