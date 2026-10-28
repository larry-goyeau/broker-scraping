// The whole ASX book (every quoted share and exchange-traded product, AUD),
// with suspended and delisted lines taken out, for the brokers whose only
// place is the ASX. The listing itself is read by ../netwealth/australia.mjs
// (ASX listed-entity list, ASX investment-products ETP list, Cboe Australia
// tradable file for ISINs and second classes); this module only adds the
// suspension check that list does not make.
//
// Suspended and delisted lines. australia.mjs keeps an ASX entity that Cboe
// does not quote whenever the shared lists hold an ISIN for it, so a long
// suspension (Australian Mines, Blue Star Helium, Genetic Technologies...)
// stays in. Two public sources settle it:
// - the Cboe Australia tradable file (daily): Cboe matches every quoted ASX
//   line and turns ALLOWONMKT to 0, or drops the line, when the ASX
//   suspends it;
//   https://www.tmxaustralia.com/equities/support/reference-data
// - the ASX company directory and quote header that asx.com.au itself reads
//   (the directory leaves suspended entities out; the header answers
//   "Symbol not found" for a code that is no longer quoted):
//   https://asx.api.markitdigital.com/asx-research/1.0/companies/directory
//   https://asx.api.markitdigital.com/asx-research/1.0/companies/<code>/header
// A line is checked when Cboe does not open it for on-market trading, or
// when it is a share the ASX directory leaves out. A checked line is dropped
// when the ASX header does not find the code, or its status code carries
// SU (suspended). A trading halt (TH) is temporary and stays.
//
// Usage:
//   import { asxBook, logCounts } from "../sequoiadirect/asxBook.mjs";
//   const { rows, dropped, sources } = await asxBook();
// rows: { query, ticker, name, exchange "ASX", mic "XASX", currency "AUD",
// type STOCK|ETF, isin, raw }. No ETN or ETC kind: the ASX physical-metal
// structured products (ETPMAG, PMGOLD, GOLD...) come as ETF, as elsewhere.
// Test: node brokers/sequoiadirect/asxBook.mjs

import { australianRows, fetchWith, logCounts, normalize } from "../netwealth/australia.mjs";

export { logCounts };

const DIRECTORY = "https://asx.api.markitdigital.com/asx-research/1.0/companies/directory?page=0&itemsPerPage=5000&order=ascending&orderBy=companyName&includeFilterOptions=false&recentListingsOnly=false";
const HEADER = (code) => `https://asx.api.markitdigital.com/asx-research/1.0/companies/${code.toLowerCase()}/header`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cboeOnMarket(text) {
  const lines = text.split(/\r?\n/);
  const header = lines.find((line) => line.startsWith("H|"))?.split("|").slice(1);
  if (!header) throw new Error("the Cboe tradable file has no header");
  const open = new Set();
  for (const line of lines) {
    if (!line.startsWith("D|")) continue;
    const cells = line.split("|").slice(1);
    const item = Object.fromEntries(header.map((name, index) => [name, normalize(cells[index])]));
    if (item.MIC === "XASX" && item.CURR === "AUD" && item.ALLOWONMKT === "1") open.add(item.CXACODE.toUpperCase());
  }
  if (open.size < 2000) throw new Error(`the Cboe tradable file opens ${open.size} ASX lines`);
  return open;
}

// "found" | "missing" | "suspended", from the ASX quote header.
async function asxStatus(code) {
  const answer = await fetch(HEADER(code), { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(30_000) })
    .then(async (response) => ({ status: response.status, body: await response.text() }))
    .catch((error) => ({ status: 0, body: String(error?.message || error) }));
  if (answer.status === 400 && /Symbol not found/i.test(answer.body)) return "missing";
  if (answer.status !== 200) throw new Error(`ASX header for ${code}: ${answer.status} ${answer.body.slice(0, 120)}`);
  const status = normalize(JSON.parse(answer.body)?.data?.statusCode).toUpperCase();
  return status.split("|").includes("SU") ? "suspended" : "found";
}

export async function asxBook() {
  const { rows, dropped, sources } = await australianRows({ places: ["ASX"] });
  const open = cboeOnMarket(await fetchWith(sources.tradable));
  const directory = await fetchWith(DIRECTORY, { kind: "json" });
  const listed = new Set((directory?.data?.items || []).map((item) => normalize(item.symbol).toUpperCase()));
  if (listed.size < 1500) throw new Error(`the ASX company directory has ${listed.size} codes`);

  const kept = [];
  const checked = [];
  for (const row of rows) {
    const doubt = !open.has(row.ticker) || (row.type === "STOCK" && !listed.has(row.ticker));
    if (!doubt) {
      kept.push(row);
      continue;
    }
    await sleep(1200);
    const status = await asxStatus(row.ticker);
    checked.push(`${row.ticker} ${status}`);
    if (status === "found") kept.push(row);
    else {
      const reason = status === "missing" ? "ASX line no longer quoted (header: symbol not found)" : "ASX line suspended (status SU)";
      dropped.set(reason, (dropped.get(reason) || 0) + 1);
    }
  }
  const count = (type) => kept.filter((row) => row.type === type).length;
  if (count("STOCK") < 1700 || count("ETF") < 400) throw new Error(`the ASX book kept ${count("STOCK")} shares and ${count("ETF")} ETFs`);
  return { rows: kept, dropped, checked, sources: { ...sources, directory: DIRECTORY } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, dropped, checked } = await asxBook();
  logCounts(rows, dropped);
  console.error("checked against the ASX header:", checked.join(", "));
}
