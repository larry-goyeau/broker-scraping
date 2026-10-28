// Every share and exchange-traded fund that can be bought on Borsa Istanbul
// today, for the brokers whose only place is the exchange (halkyatrm,
// vakfyatrm, piramitmenkul, integralyatrm and the others of the same
// group).
//
// The list itself is ../ziraat/bist.mjs: the share codes of the companies
// on KAP's BIST companies page and the exchange-traded funds (BYF) on its
// funds page, with TradingView's names and ISINs, all in lira. That list
// keeps every listed company, including the ones the exchange has halted.
// This module checks each line against the exchange's own end-of-day
// equity bulletin ("Pay Piyasası Günlük Bülteni", one zipped CSV per
// session, thbYYYYMMDD1.zip) and drops:
//   - a line the bulletin flags as suspended (column "GECICI DURDURMA" /
//     "SUSPENDED" = 1). On 2026-10-23 that was UMPAS (Umpaş Holding), halted
//     on the Pre-Market Trading Platform with no trade at 9.30 TRY in every
//     bulletin read back to October 2025;
//   - a line the bulletin does not carry at all as a share (instrument group
//     EQT) or exchange-traded fund (ETF) on the spot equity market (MSPOT):
//     a company KAP still lists whose shares no longer trade.
// A line with no trade in the session is kept and reported (quiet): İş
// Bankası's (A) and founders' shares (ISATR, ISKUR) are open for orders but
// trade a few times a year at millions of lira a share.
//
// Each share also gets the market segment the bulletin gives it (segments),
// for a broker that names one it does not serve:
//   N  Yıldız Pazar (Star Market)        Z  Ana Pazar (Main Market)
//   T  Alt Pazar (Sub-Market)            W  Yakın İzleme Pazarı (Watchlist)
//   S  Piyasa Öncesi İşlem Platformu (Pre-Market Trading Platform; KAP's
//      UMPAS summary names it), single-price trading.
// The exchange-traded funds are segment K (funds).
//
//   https://www.borsaistanbul.com/en/data/equity-market-data/bulletin-data
//   https://www.borsaistanbul.com/data/thb/2026/10/thb202610231.zip
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//   https://www.kap.org.tr/tr/sirket-bilgileri/ozet/4028e4a240f2ef4c0140f38be24f0091 (UMPAS)
//
// Use:
//   import { bistBook } from "../halkyatrm/bistBook.mjs";
//   const { rows, dropped, quiet, segments, bulletinDate } = await bistBook();
//
//   node brokers/halkyatrm/bistBook.mjs      prints the counts

import zlib from "node:zlib";
import { bistListings } from "../ziraat/bist.mjs";

const BULLETIN = "https://www.borsaistanbul.com/data/thb/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
export const SEGMENTS = {
  N: "Yıldız Pazar",
  Z: "Ana Pazar",
  T: "Alt Pazar",
  W: "Yakın İzleme Pazarı",
  S: "Piyasa Öncesi İşlem Platformu",
  K: "Fon Pazarı",
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The first file of a zip archive, as text.
function unzipFirst(zip) {
  if (zip.length < 30 || zip.readUInt32LE(0) !== 0x04034b50) return null;
  const method = zip.readUInt16LE(8);
  const size = zip.readUInt32LE(18);
  const start = 30 + zip.readUInt16LE(26) + zip.readUInt16LE(28);
  const body = size > 0 ? zip.subarray(start, start + size) : zip.subarray(start);
  const data = method === 0 ? body : zlib.inflateRawSync(body);
  return new TextDecoder("windows-1254").decode(data);
}

// The latest end-of-day equity bulletin of the last ten days.
export async function latestBulletin() {
  for (let back = 0; back < 10; back += 1) {
    const day = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
    const url = `${BULLETIN}${day.slice(0, 4)}/${day.slice(4, 6)}/thb${day}1.zip`;
    let zip = null;
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) zip = Buffer.from(await response.arrayBuffer());
    } catch {
      zip = null;
    }
    const text = zip && unzipFirst(zip);
    if (text) return { day: `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6)}`, url, text };
    await sleep(1000);
  }
  throw new Error("no Borsa Istanbul equity bulletin in the last ten days");
}

// The bulletin's shares and exchange-traded funds on the spot market, by code.
function bulletinLines(text) {
  const lines = text.split(/\r?\n/).filter(Boolean).map((line) => line.split(";"));
  const head = lines[1] || [];
  const col = (name) => {
    const index = head.indexOf(name);
    if (index < 0) throw new Error(`bulletin has no column ${name}`);
    return index;
  };
  const at = {
    code: col("INSTRUMENT SERIES CODE"),
    segment: col("MARKET SEGMENT"),
    market: col("MARKET"),
    group: col("INSTRUMENT GROUP"),
    suspended: col("SUSPENDED"),
    volume: col("TOTAL TRADED VOLUME"),
    previous: col("PREVIOUS LAST PRICE"),
  };
  const byCode = new Map();
  for (const cells of lines.slice(2)) {
    if (cells[at.market] !== "MSPOT" || !["EQT", "ETF"].includes(cells[at.group])) continue;
    const code = cells[at.code].split(".")[0];
    byCode.set(code, {
      group: cells[at.group],
      segment: cells[at.segment],
      suspended: cells[at.suspended] === "1",
      volume: Number(cells[at.volume]) || 0,
      previous: Number(cells[at.previous]) || 0,
    });
  }
  const shares = [...byCode.values()].filter((line) => line.group === "EQT").length;
  if (shares < 550) throw new Error(`bulletin lists only ${shares} shares`);
  return byCode;
}

export async function bistBook() {
  const [listings, bulletin] = await Promise.all([bistListings(), latestBulletin()]);
  const lines = bulletinLines(bulletin.text);
  const rows = [];
  const dropped = [];
  const quiet = [];
  const segments = {};
  for (const row of listings.rows) {
    const line = lines.get(row.ticker);
    const group = row.type === "ETF" ? "ETF" : "EQT";
    if (!line || line.group !== group) {
      dropped.push({ ticker: row.ticker, reason: `not on the ${bulletin.day} bulletin as ${group}` });
      continue;
    }
    if (line.suspended) {
      dropped.push({ ticker: row.ticker, reason: `suspended on the ${bulletin.day} bulletin` });
      continue;
    }
    if (line.volume === 0) quiet.push(row.ticker);
    segments[row.ticker] = line.segment;
    rows.push(row);
  }
  // Bulletin lines the KAP list does not have (reported, not added).
  const listed = new Set(listings.rows.map((row) => row.ticker));
  const bulletinOnly = [...lines.keys()].filter((code) => !listed.has(code)).sort();
  if (dropped.length > 25) throw new Error(`${dropped.length} BIST lines dropped, check the bulletin`);
  return { ...listings, rows, dropped, quiet: quiet.sort(), segments, bulletinOnly, bulletinDate: bulletin.day, bulletinUrl: bulletin.url };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const book = await bistBook();
  const count = {};
  for (const row of book.rows) count[row.type] = (count[row.type] || 0) + 1;
  const bySegment = {};
  for (const segment of Object.values(book.segments)) bySegment[segment] = (bySegment[segment] || 0) + 1;
  console.log(
    `bistBook: ${book.rows.length} rows (${Object.entries(count).map(([type, n]) => `${n} ${type}`).join(", ")}), ` +
      `ISIN ${book.rows.filter((row) => row.isin).length}; bulletin ${book.bulletinDate}; ` +
      `segments ${JSON.stringify(bySegment)}; ` +
      `dropped ${book.dropped.map((item) => `${item.ticker} (${item.reason})`).join(", ") || "none"}; ` +
      `no trade in the session: ${book.quiet.join(" ") || "none"}; ` +
      `on the bulletin only: ${book.bulletinOnly.join(" ") || "none"}`
  );
}
