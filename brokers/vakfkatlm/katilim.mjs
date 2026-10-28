// The Borsa Istanbul shares a participation (katılım) bank lets its clients
// buy: the members of the BIST Katılım Tüm index (BIST Participation All),
// read from the same end-of-day equity bulletin that ../halkyatrm/bistBook.mjs
// uses. The bulletin's last column, "BIST KATILIM TUM ENDEKS" / "BIST
// PARTICIPATION ALL INDEX", is 1 for a share in the index. On the
// 2026-10-23 bulletin that was 238 of the 631 shares on the spot market;
// no exchange-traded fund is in the index.
//
// Used by vakfkatlm, hayatfinanskatlm and dunyakatlmbankas, whose pages say
// their own channels deal only in the "Katılım Endeksi" shares.
//
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//   https://www.borsaistanbul.com/endeksler/bist-pay/katilim
//
// Use:
//   import { katilimBook } from "../vakfkatlm/katilim.mjs";
//   const { rows, outside, book } = await katilimBook();
//
//   node brokers/vakfkatlm/katilim.mjs      prints the counts

import { bistBook, latestBulletin } from "../halkyatrm/bistBook.mjs";

// The share codes the bulletin flags as members of BIST Katılım Tüm.
export async function katilimCodes() {
  const bulletin = await latestBulletin();
  const lines = bulletin.text.split(/\r?\n/).filter(Boolean).map((line) => line.split(";"));
  const head = lines[1] || [];
  const col = (name) => {
    const index = head.indexOf(name);
    if (index < 0) throw new Error(`bulletin has no column ${name}`);
    return index;
  };
  const at = {
    code: col("INSTRUMENT SERIES CODE"),
    market: col("MARKET"),
    group: col("INSTRUMENT GROUP"),
    katilim: col("BIST PARTICIPATION ALL INDEX"),
  };
  const codes = new Set();
  for (const cells of lines.slice(2)) {
    if (cells[at.market] !== "MSPOT" || cells[at.group] !== "EQT") continue;
    if (cells[at.katilim] === "1") codes.add(cells[at.code].split(".")[0]);
  }
  if (codes.size < 150) throw new Error(`bulletin flags only ${codes.size} BIST Katılım shares`);
  return { codes, day: bulletin.day, url: bulletin.url };
}

// bistBook's shares that are in the index; everything else is "outside".
export async function katilimBook() {
  const book = await bistBook();
  const katilim = await katilimCodes();
  if (katilim.day !== book.bulletinDate) throw new Error(`bulletins differ: ${katilim.day} and ${book.bulletinDate}`);
  const rows = [];
  const outside = { STOCK: [], ETF: [] };
  for (const row of book.rows) {
    if (row.type === "STOCK" && katilim.codes.has(row.ticker)) rows.push(row);
    else (outside[row.type] ||= []).push(row.ticker);
  }
  const listed = new Set(book.rows.map((row) => row.ticker));
  const notInBook = [...katilim.codes].filter((code) => !listed.has(code)).sort();
  return { rows, outside, notInBook, indexSize: katilim.codes.size, book };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, outside, notInBook, indexSize, book } = await katilimBook();
  console.log(
    `katilim: ${rows.length} shares of ${indexSize} flagged on the ${book.bulletinDate} bulletin; ` +
      `left out ${outside.STOCK.length} other shares and ${outside.ETF.length} ETFs; ` +
      `flagged but not in bistBook: ${notInBook.join(" ") || "none"}`
  );
}
