// The Saudi Exchange's Nomu parallel market, read from the exchange's own
// public pages (saudiexchange.sa), with no login, for a broker whose list
// names Nomu companies (./adibsec_scraping.mjs). The Main Market is read by
// ../investsky/tadawulBook.mjs; this is the other board.
//
// The Nomu market watch loads its table from the same portal call as the
// Main Market watch (NJgetMainNomucMarketDetails), on its own page. It
// prints every Nomu line of the session with its symbol, name, sector, last
// trade, bid, ask and volume. The REITs sector holds the Nomu real estate
// funds (Alwaha REIT): a share, as on the Main Market.
//
//   https://www.saudiexchange.sa/wps/portal/saudiexchange/ourmarkets/nomuc-market-watch?locale=en
//
// Suspensions: the Nomu issuers page lists every suspension of a Nomu
// company (NJgetNomuSuspendedDelistedComp, form type Suspension), with its
// start and, once lifted, its end date. As in tadawulBook, a line is
// suspended when its latest suspension is open and the session shows no
// trade, no bid and no ask on it. Before the session opens (fewer than 30
// lines traded), an open suspension younger than a year is enough.
//
//   https://www.saudiexchange.sa/wps/portal/saudiexchange/ourmarkets/nomuc-market-watch/issuers-trading-information?locale=en
//
//   import { nomuBook } from "../adibsec/nomuBook.mjs";
//   const { lines, suspended } = await nomuBook();
//   lines: Map symbol -> { symbol, name, sector, quiet }
//   suspended: Map symbol -> "9537 Amwaj International Co. (suspended 2026-10-04)"

const SITE = "https://www.saudiexchange.sa";
const PAGES = {
  watch: `${SITE}/wps/portal/saudiexchange/ourmarkets/nomuc-market-watch?locale=en`,
  issuers: `${SITE}/wps/portal/saudiexchange/ourmarkets/nomuc-market-watch/issuers-trading-information?locale=en`,
};
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const FLOOR = 80;
const DAY = 86_400_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "*/*", "Accept-Language": "en-US,en;q=0.9" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

async function portalJson(page, name, params) {
  const html = await get(page);
  const base = html.match(/<base href="([^"]+)"/)?.[1];
  const call = html.match(new RegExp(`['"](p0/[^'"]*=NJ${name}=/)['"]`))?.[1];
  if (!base || !call) throw new Error(`${page} no longer calls NJ${name}`);
  const text = await get(`${new URL(call, base).href}?${new URLSearchParams(params)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`NJ${name} is not JSON: ${text.slice(0, 120)}`);
  }
}

// "2026-09-13" or "13-09-2026" -> ms, "-" or "" -> null.
function day(text) {
  const value = clean(text);
  let found = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (found) return Date.UTC(+found[1], +found[2] - 1, +found[3]);
  found = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (found) return Date.UTC(+found[3], +found[2] - 1, +found[1]);
  if (!value || value === "-") return null;
  throw new Error(`Nomu suspension date ${value}`);
}

export async function nomuBook() {
  const board = (await portalJson(PAGES.watch, "getMainNomucMarketDetails", {
    sectorParameter: "all",
    tableViewParameter: "1",
    iswatchListSelected: "NO",
    requestLocale: "en",
  }))?.data;
  if (!Array.isArray(board) || board.length < FLOOR) throw new Error(`the Nomu market watch has ${board?.length ?? "no"} lines`);
  await sleep(800);
  const list = (await portalJson(PAGES.issuers, "getNomuSuspendedDelistedComp", {
    renderType: "onload",
    fromDate: "",
    toDate: "",
    formType: "Suspension",
    requestLocale: "en",
  }))?.data;
  if (!Array.isArray(list) || list.length < 20) throw new Error(`the Nomu suspension list has ${list?.length ?? "no"} lines`);

  const latest = new Map();
  for (const item of list) {
    const symbol = clean(item.symbol);
    const from = day(item.fromDate);
    if (!symbol || from === null) throw new Error(`unreadable Nomu suspension ${JSON.stringify(item).slice(0, 160)}`);
    if (!latest.has(symbol) || latest.get(symbol).from < from) latest.set(symbol, { from, to: day(item.toDate), name: clean(item.name) });
  }

  const inSession = board.filter((line) => Number(line.volumeTraded) > 0).length >= 30;
  const now = Date.now();
  const lines = new Map();
  const suspended = new Map();
  for (const line of board) {
    const symbol = clean(line.companySymbol);
    const name = clean(line.companyName);
    if (!/^\d{4}$/.test(symbol) || !name) throw new Error(`unreadable Nomu line ${JSON.stringify(line).slice(0, 200)}`);
    if (lines.has(symbol)) throw new Error(`${symbol} repeats on Nomu`);
    const quiet = !(Number(line.volumeTraded) > 0) && !(Number(line.bidPrice) > 0) && !(Number(line.askPrice) > 0);
    lines.set(symbol, { symbol, name, sector: clean(line.sectorName), quiet });
  }
  for (const [symbol, entry] of latest) {
    if (entry.to !== null && entry.to < now - DAY) continue;
    const line = lines.get(symbol);
    const open = line ? (inSession ? line.quiet : now - entry.from < 365 * DAY) : true;
    if (open) suspended.set(symbol, `${symbol} ${entry.name} (suspended ${new Date(entry.from).toISOString().slice(0, 10)})`);
  }
  return { lines, suspended, inSession };
}
