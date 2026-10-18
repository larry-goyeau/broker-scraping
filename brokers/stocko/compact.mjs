// The "Compact" contract file of the Stocko (SAS Online) trading platform,
// which Mastertrust also runs. One ZIP per exchange holds one CSV:
// exchange_token, trading_symbol, company_name, ..., segment, exchange.
// The segment is the NSE series or the BSE group. An NSE symbol carries the
// series (RELIANCE-EQ) and a BSE symbol the group (RELIANCE-A). There is no
// ISIN; it is joined from the NSE equity list and Upstox.
import { inflateRawSync } from "node:zlib";
import { parseCsv, keepSold, cashBook, lookup, companyName } from "../../indianCash.mjs";

const HEADERS = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36" };
const VENUES = { NSE: "XNSE", BSE: "XBOM" };

// An NSE line must carry an NSE series; ZP and the like are BSE codes,
// and on the NSE they are debt.
const NSE_SERIES = new Set(["EQ", "BE", "BZ", "SM", "ST", "IV", "RR"]);

// A rights entitlement has security code 20 in its ISIN (INE002A20018).
const rightsEntitlement = (ticker, isin) => /-RE\d*$/i.test(ticker) || /^INE.{4}20/.test(isin);

// The first entry of a ZIP, read through its central directory.
function unzipFirst(buffer) {
  let end = buffer.length - 22;
  while (end >= 0 && buffer.readUInt32LE(end) !== 0x06054b50) end -= 1;
  if (end < 0) throw new Error("not a ZIP file");
  const central = buffer.readUInt32LE(end + 16);
  if (buffer.readUInt32LE(central) !== 0x02014b50) throw new Error("ZIP central directory not found");
  const method = buffer.readUInt16LE(central + 10);
  const size = buffer.readUInt32LE(central + 20);
  const local = buffer.readUInt32LE(central + 42);
  const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
  const data = buffer.subarray(start, start + size);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data);
  throw new Error(`ZIP method ${method} not supported`);
}

export async function compactListings(host) {
  const book = await cashBook();
  const listings = [];
  const seen = new Set();
  for (const exchange of Object.keys(VENUES)) {
    const url = `https://${host}/api/v1/contract/Compact?info=download&exchanges=${exchange}`;
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) throw new Error(`${url} answered ${response.status}`);
    const text = unzipFirst(Buffer.from(await response.arrayBuffer())).toString("utf8");
    for (const row of parseCsv(text)) {
      if (String(row.exchange || "").trim().toUpperCase() !== exchange) continue;
      const series = String(row.segment || "").trim().toUpperCase();
      const symbol = String(row.trading_symbol || "").trim();
      if (!symbol || !series) continue;
      // The BSE group is not part of the scrip id, so it is cut off there.
      const ticker = exchange === "BSE" && symbol.toUpperCase().endsWith(`-${series}`) ? symbol.slice(0, -(series.length + 1)) : symbol;
      const entry = lookup(book, exchange, ticker);
      const isin = entry?.isin || "";
      if (exchange === "NSE" && !NSE_SERIES.has(series)) continue;
      if (/^INAV/i.test(String(row.company_name || "").trim())) continue;
      if (!keepSold(exchange, series, ticker, isin)) continue;
      if (rightsEntitlement(ticker, isin)) continue;
      const key = `${exchange}|${ticker.toUpperCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const name = companyName(row.company_name, ticker, entry);
      listings.push({
        query: ticker,
        ticker,
        name,
        exchange,
        mic: VENUES[exchange],
        currency: "INR",
        type: "EQ",
        isin,
        raw: [symbol, name, exchange, series, isin].filter(Boolean).join(" "),
      });
    }
  }
  listings.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.ticker.localeCompare(right.ticker));
  return listings;
}

export function checkFloor(listings, floor) {
  const counts = {};
  for (const row of listings) counts[row.exchange] = (counts[row.exchange] || 0) + 1;
  for (const [exchange, least] of Object.entries(floor)) {
    if ((counts[exchange] || 0) < least) throw new Error(`${exchange} read looks short: ${counts[exchange] || 0} < ${least}`);
  }
  return counts;
}
