// What Tose'e Farda Brokerage (Kargozari Tose'e Farda) sells in shares and
// exchange-traded funds, with no login. The broker publishes no list of
// its own. Its site links a rotating board ("tabloye charkheshi") that
// its web vendor, Almas, feeds with the whole Iranian market: one JSON
// array with the ISIN, the Persian symbol and the company of every line
// that has a price. An Iranian member broker can trade every title listed
// on the Tehran Stock Exchange and on Iran Fara Bourse, so that board is
// the book. The broker's FAQ gives its trading cost (about 0.5% to buy,
// about 1% to sell with the tax, rates set by the exchange regulator).
//
// The board prints no market. The ISIN gives the market that registered
// the paper: IRO1 and IRT1 are Tehran Stock Exchange shares and funds;
// IRO3 (first and second markets), IRO5 (small and medium firms), IRO7
// (base market) and IRT3 are Iran Fara Bourse. A title that later moves
// keeps its ISIN (Fasmin, IRO7KSIM0001, now trades in Tehran), so the
// market of each kept symbol is read from the rahavard365.com search,
// which names it, and the ISIN is only the fallback when that search has
// no exact match. The official boards (tsetmc.com, tse.ir, ifb.ir) do not
// answer from outside Iran.
// The funds kept are the exchange-traded funds of both markets (equity,
// fixed income, mixed, leveraged, sector, index and fund-of-funds). The
// real-estate funds ("amlak va mostaghallat") are listed property trusts
// and are written as shares, as REITs are elsewhere. The private equity
// ("sarmaye-gozari khososi"), venture ("jasoorane") and project
// ("prozhe") funds are closed-end funds and are left out. The fund kind
// is read from the board name and from the rahavard365 full name.
// Left out: rights issues (IRR), options and futures (IRO4, IRO9, IROA,
// IROB, IROF, IRS4), bonds and sukuk (IRB), forward contracts (IRBK,
// IRBE), and the commodity funds and certificates of the Iran Mercantile
// Exchange and the Energy Exchange (IRTK, IRTE, IREK, IRK1, IRBS, IRBZ),
// which are other places (the broker also trades on those two exchanges,
// but they are not among its places here). Every line is in rials.
//
// The board keeps a halted title ("motevaghef") with its last price, and
// drops it only after a long halt, so the board alone does not say what
// trades today. For every kept symbol the rahavard365 asset page
// (/api/v2/asset/<id>, the id from the search) gives the instrument state
// of today's session and the listing state. A title whose instrument is
// "closed" (halted: AGM, disclosure, price check, missing accounts) is
// not written; it comes back on the next run after it reopens. A title
// whose listing is not "accepted" ("paziroft-e shode"), "subject to the
// suspension process" or "trading under caution" (both still trade) is
// not written either: "kharej-e bourse" means it has left the exchange.
// Any other instrument or listing state stops the run, to be sorted by
// hand. The few symbols the search cannot match exactly (fund names
// spelled with or without a space) are kept as the board prints them.
//
//   https://fardabroker.ir/mliveboard
//   https://www.cmsalmas.ir/all_data
//   https://fardabroker.ir/questions
//   https://rahavard365.com/api/v2/search?keyword=<symbol>
//   https://rahavard365.com/api/v2/asset/<id>
//
//   node brokers/tosee/tosee_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const BOARD = "https://www.cmsalmas.ir/all_data";
const SEARCH = "https://rahavard365.com/api/v2/search?keyword=";
const ASSET = "https://rahavard365.com/api/v2/asset/";
// Listing states that still trade, and those that mean the title is gone.
const LISTED = new Set(["پذیرفته شده", "مشمول فرآیند تعلیق", "معاملات تحت احتیاط"]);
const UNLISTED = new Set(["خارج بورس", "تعلیق شده", "حذف شده", "لغو پذیرش"]);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36";

const TSE = { exchange: "Tehran Stock Exchange", mic: "XTEH" };
const IFB = { exchange: "Iran Fara Bourse", mic: "IFBX" };
const MARKET_OF = { "بورس تهران": TSE, "فرابورس": IFB };
// The first four characters of the ISIN name the kind of paper and the
// market that registered it.
const KEPT = {
  IRO1: { ...TSE, type: "STOCK" },
  IRT1: { ...TSE, type: "ETF" },
  IRO3: { ...IFB, type: "STOCK" },
  IRO5: { ...IFB, type: "STOCK" },
  IRO7: { ...IFB, type: "STOCK" },
  IRT3: { ...IFB, type: "ETF" },
};
const CLOSED_END = /سرمایه ?گذاری خصوصی|س\.خ\.|جسورانه|پروژه/;
const REAL_ESTATE = /املاک/;
const LEFT_OUT = new Set([
  "IRR1", "IRR3", "IRR7",
  "IRO4", "IRO9", "IROA", "IROB", "IROF", "IRS1", "IRS3", "IRS4", "IRS7",
  "IRB1", "IRB2", "IRB3", "IRB4", "IRB5", "IRB6", "IRB7", "IRB8", "IRB9", "IRBK", "IRBE", "IRBS", "IRBZ",
  "IRK1", "IRTK", "IRTE", "IREK",
]);
// A full board carries about 370 Tehran and 400 Fara Bourse shares and
// about 280 funds. Fewer than this means the feed is cut.
const FLOOR = { "Tehran Stock Exchange/STOCK": 330, "Iran Fara Bourse/STOCK": 350, ETF: 220 };

async function getJson(url, referer = "https://fardabroker.ir/mliveboard") {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json", Referer: referer },
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) return await response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.cause?.code || error.message || error} ${url}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw new Error(last);
}

// The feed mixes Arabic and Persian forms of yeh and kaf and leaves
// zero-width joiners at word ends.
function clean(value) {
  return String(value ?? "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/‌+(?=\s|$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The market rahavard365 names for a symbol, or "" when it has no exact
// match. A kept symbol it puts on another exchange stops the run.
async function marketOf(row) {
  const found = await getJson(SEARCH + encodeURIComponent(row.ticker), "https://rahavard365.com/");
  if (!Array.isArray(found?.data)) throw new Error(`rahavard365 search changed shape for ${row.ticker}`);
  const names = new Set(
    found.data
      .filter((hit) => clean(hit.trade_symbol).replace(/\s/g, "") === row.ticker.replace(/\s/g, "") && clean(hit.exchange))
      .map((hit) => clean(hit.exchange)),
  );
  if (names.size > 1) throw new Error(`${row.ticker} ${row.isin} is on ${[...names].join(" and ")}`);
  const [name = ""] = names;
  if (name && !MARKET_OF[name]) throw new Error(`${row.ticker} ${row.isin} is on ${name}`);
  const exact = found.data.filter((hit) => clean(hit.trade_symbol).replace(/\s/g, "") === row.ticker.replace(/\s/g, ""));
  const titles = exact.map((hit) => clean(hit.name)).join(" ");
  const ids = [...new Set(exact.filter((hit) => MARKET_OF[clean(hit.exchange)]).map((hit) => String(hit.entity_id || "")))];
  if (ids.length > 1) throw new Error(`${row.ticker} ${row.isin} matches rahavard365 assets ${ids.join(", ")}`);
  return { name, titles, id: ids[0] || "" };
}

// Today's instrument state and the listing state of a matched symbol.
async function stateOf(row, id) {
  const asset = (await getJson(ASSET + id, "https://rahavard365.com/"))?.data?.asset;
  const instrument = asset?.instrument_state?.state;
  const listing = clean(asset?.state?.title);
  if (!asset || !instrument || !listing) throw new Error(`rahavard365 asset ${id} changed shape for ${row.ticker}`);
  if (clean(asset.trade_symbol).replace(/\s/g, "") !== row.ticker.replace(/\s/g, "")) throw new Error(`rahavard365 asset ${id} is ${asset.trade_symbol}, not ${row.ticker}`);
  if (!["open", "closed"].includes(instrument)) throw new Error(`${row.ticker} ${row.isin}: unknown instrument state ${instrument}`);
  if (!LISTED.has(listing) && !UNLISTED.has(listing)) throw new Error(`${row.ticker} ${row.isin}: unknown listing state ${listing}`);
  if (UNLISTED.has(listing)) return `unlisted (${listing})`;
  if (instrument === "closed") return `halted (${clean(asset.instrument_state.description)})`;
  return "";
}

// A fund is an ETF unless its name says closed-end or property.
function fundKind(row, titles = "") {
  if (!row.isin.startsWith("IRT")) return row.type;
  const names = `${row.name} ${titles}`;
  if (CLOSED_END.test(names)) return "";
  return REAL_ESTATE.test(names) ? "STOCK" : "ETF";
}

async function placeMarkets(rows) {
  let next = 0;
  let missed = 0;
  async function worker() {
    while (next < rows.length) {
      const row = rows[next++];
      const { name, titles, id } = await marketOf(row);
      row.type = fundKind(row, titles);
      if (name) Object.assign(row, MARKET_OF[name]);
      else missed += 1;
      if (row.type && id) row.dropped = await stateOf(row, id);
      row.raw = [row.ticker, row.name, row.exchange, row.isin, row.type].join(" ");
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
  // A handful of new or renamed funds have no exact match; many means the
  // search stopped matching symbols.
  if (missed > rows.length * 0.03) throw new Error(`rahavard365 matched ${rows.length - missed} of ${rows.length} symbols`);
  const dropped = { halted: [], unlisted: [] };
  for (const row of rows) if (row.type && row.dropped) dropped[row.dropped.split(" ")[0]].push(row.ticker);
  console.error(`dropped ${dropped.halted.length} halted today (${dropped.halted.join(" ")}), ${dropped.unlisted.length} unlisted (${dropped.unlisted.join(" ")}), ${rows.filter((row) => !row.type).length} closed-end funds; ${missed} kept unchecked (no exact rahavard365 match)`);
  const kept = rows.filter((row) => row.type && !row.dropped);
  for (const row of kept) delete row.dropped;
  return kept;
}

function catalogue(lines) {
  if (!Array.isArray(lines) || lines.length < 1500) throw new Error(`the board printed ${lines?.length ?? 0} lines`);
  const rows = [];
  const seen = new Set();
  const unknown = new Set();
  for (const line of lines) {
    const isin = String(line?.isin || "").trim().toUpperCase();
    if (!/^IR[A-Z0-9]{10}$/.test(isin)) throw new Error(`unreadable ISIN ${JSON.stringify(line?.isin)}`);
    const prefix = isin.slice(0, 4);
    const place = KEPT[prefix];
    if (!place) {
      if (!LEFT_OUT.has(prefix)) unknown.add(prefix);
      continue;
    }
    const ticker = clean(line.symbol_fa);
    const name = clean(line.company) || ticker;
    if (!ticker) throw new Error(`no symbol for ${isin}`);
    if (seen.has(isin)) throw new Error(`repeated ${isin}`);
    seen.add(isin);
    const row = { query: ticker, ticker, name, exchange: place.exchange, mic: place.mic, currency: "IRR", type: place.type, isin };
    row.type = fundKind(row);
    row.raw = [ticker, name, place.exchange, isin, row.type].join(" ");
    rows.push(row);
  }
  // A new kind of paper must be sorted by hand before it is written or dropped.
  if (unknown.size) throw new Error(`unknown ISIN kinds ${[...unknown].join(", ")}`);
  return rows;
}

function checked(rows) {
  const count = (exchange, type) => rows.filter((row) => (!exchange || row.exchange === exchange) && row.type === type).length;
  for (const [key, floor] of Object.entries(FLOOR)) {
    const [exchange, type] = key.includes("/") ? key.split("/") : ["", key];
    if (count(exchange, type) < floor) throw new Error(`${key}: ${count(exchange, type)} lines, expected at least ${floor}`);
  }
  rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.isin.localeCompare(right.isin));
  return rows;
}

const rows = checked(await placeMarkets(catalogue(await getJson(BOARD))));
fs.writeFileSync(new URL("tosee-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const tally = (key) => Object.entries(Object.groupBy(rows, (row) => row[key])).map(([k, v]) => `${v.length} ${k}`).join(", ");
console.error(`${rows.length} listings (${tally("type")}; ${tally("exchange")})`);
