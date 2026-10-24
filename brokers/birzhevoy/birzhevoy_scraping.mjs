// What Birzhevoy Broker (OOO "Birzhevoy Broker", Dushanbe, broker.tj) sells
// in shares, with no login. Its tariff table prices "Акции, облигации,
// еврооблигации, депозитарные расписки, инвестиционные паи, ипотечные
// сертификаты участия, обращающиеся на NASDAQ, NYSE, Казахстанская фондовая
// биржа (KASE) и биржа AIX" at 0,3 % (Инвестор) or 0,2 % (Трейдер), and
// Nasdaq Dubai lines "от 0,12%". A footnote on the same page says
// "*Неквалифицированным инвесторам ETF доступны только после прохождения
// тестирования" (non-qualified investors get ETFs only after a test).
//
// The book is the share catalogue of the site (broker.tj/catalog), read
// from the API behind it. The site asks for markets[] = eu, us and sa
// under "all"; on 23 October 2026 every line it returns (8,299) has
// market "us" and a ticker ending .NASDAQ or .NYSE, written in CQS form
// (BRK/B, ABRpD for a preferred, GRP/U for a unit, VAL/WS for a warrant).
// A line of another market or suffix stops the run, so the European and
// Tadawul lines the site's code allows for get a mapping when they appear.
// The API also holds three new lines with no market, which the site does
// not show: left out.
//
// KASE, AIX and Nasdaq Dubai: the tariff prices them but the site lists
// none of their lines, so each exchange's own list is taken whole (owner's
// choice, 2026-10-24): every KASE share, KASE Global share and depositary
// receipt, and every AIX share, GDR, ADS and ETF unit (./kazakhBook.mjs);
// the Nasdaq Dubai shares and the 21Shares Bitcoin ETP read from DFM's list
// (../alwathbah/uaeBook.mjs). Each line keeps its own trading currency.
//
// US: one NBBO market, one row a title. The suffix is not the listing
// (NYSE American and Arca lines are filed .NYSE), and the catalogue keeps
// dead lines: about a quarter of it on 23 October 2026 (Ansys, Walgreens,
// Yandex NV, First Republic preferreds, SPAC units long gone). A line is
// kept when the US symbol directories of the day list it, and is placed on
// the exchange they name (../raseed/usTape.mjs reads them). Warrants and
// rights are left out (the tariff names no warrant); units and preferred
// shares stay as shares. The ISIN comes from the asset lists through usRow
// in ../mitsubishiufjesmart/japan.mjs (a preferred ABR$D is ABR/PD there).
//
// ETFs: there is no ETF tab, but the share tab holds about 920 ETFs, nearly
// all Nasdaq-listed (QQQ, TQQQ, IBIT); SPY, VOO, GLD and most Arca
// funds are not in it. The directory's ETF flag makes a line an
// ETF. They are kept, since the public list holds them: the test depends on
// the client, not on the title, and the page shows no remark for it (owner,
// 2026-10-24).
//
// Restrictions: broker-list.json names none.
//
//   https://broker.tj/services/broker-account   (tariff, ETF footnote)
//   https://broker.tj/catalog
//   https://api.broker.tj/api/v4/stock/share?limit=5000&page=1&markets[]=eu&markets[]=us&markets[]=sa
//   https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt
//   https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt
//   https://kase.kz/en/markets/shares-and-adr-gdr
//   https://market.aixkz.com/official-list
//   https://www.dfm.ae/the-exchange/market-information/listed-securities/equities
//
//   node brokers/birzhevoy/birzhevoy_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usRow } from "../mitsubishiufjesmart/japan.mjs";
import { usDirectory } from "../raseed/usTape.mjs";
import { aixListings, kaseListings } from "./kazakhBook.mjs";
import { nasdaqDubaiListings } from "../alwathbah/uaeBook.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const TARIFF = "https://broker.tj/services/broker-account";
const API = "https://api.broker.tj/api/v4/stock/share";
const LIMIT = 5000;
const OUTPUT = new URL("birzhevoy-parsed.json", import.meta.url);

const PLACE = {
  XNAS: "Nasdaq",
  XNYS: "New York Stock Exchange",
  XASE: "NYSE American",
  ARCX: "NYSE Arca",
  BATS: "Cboe BZX",
  TXSE: "Texas Stock Exchange",
};
const US_MICS = new Set(Object.keys(PLACE));

const EVIDENCE = [
  /обращающиеся на NASDAQ, NYSE, Казахстанская фондовая биржа \(KASE\) и биржа AIX 0,3 % 0,2 %/,
  /Неквалифицированным инвесторам ETF доступны только после прохождения тестирования/,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url, accept) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "ru" },
        signal: AbortSignal.timeout(90_000),
      });
      if (response.ok) return await response.text();
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
    await sleep(1500 * (attempt + 1));
  }
  throw new Error(last);
}

function words(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

async function catalogue() {
  const items = [];
  let total = null;
  for (let page = 1; page < 20; page += 1) {
    const url = `${API}?limit=${LIMIT}&page=${page}&markets[]=eu&markets[]=us&markets[]=sa`;
    const body = JSON.parse(await get(url, "application/json"));
    if (!Array.isArray(body.items) || !Number.isInteger(body.total)) throw new Error(`${url} answered no items`);
    total ??= body.total;
    items.push(...body.items);
    if (!body.hasNextPage) break;
  }
  if (items.length !== total) throw new Error(`the catalogue announced ${total} lines and gave ${items.length}`);
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error("the catalogue repeats a line");
  // 8,299 lines on 23 October 2026.
  if (items.length < 7000) throw new Error(`the catalogue has only ${items.length} lines`);
  return items;
}

// CQS form to the directories' ACT form: ABRpD -> ABR$D, TYp -> TY$,
// BRK/B -> BRK.B, GRP/U -> GRP.U. A stray trailing dot (KLC.) goes; one
// line already writes BRK.B.
function actSymbol(base) {
  const code = base.replace(/\.$/, "");
  if (!/^[A-Z0-9]+(?:p[A-Z]?|(?:[/.][A-Z]+)+)?$/.test(code)) return null;
  return code.replace(/p([A-Z]?)$/, "$$$1").replace(/\//g, ".");
}

// The asset lists write a preferred as ABR/PD (ABR/P for a single series).
function assetSymbol(act) {
  return act.includes("$") ? act.replace(/\$([A-Z]?)$/, "/P$1") : act;
}

// A warrant or a right. nasdaqlisted.txt names the line's kind after " - "
// ("Alvotech - Warrant"); otherlisted.txt writes .WS in the symbol, and
// its names can speak of a "right" of an ADR (América Movil, RLX: "each
// representing the right to receive ... shares"), so only "warrant" counts
// there.
function warrantOrRight(act, listed) {
  if (/\.(WS|RT)(\.[A-Z])?$/.test(act)) return true;
  if (listed.code !== "Q") return /\bWarrants?\b/i.test(listed.name);
  const kind = listed.name.split(" - ").slice(1).join(" - ");
  if (/\bUnits?\b/i.test(kind)) return false;
  return /\b(Warrants?|Rights?)\b/i.test(kind);
}

const tariff = words(await get(TARIFF, "text/html"));
for (const pattern of EVIDENCE) if (!pattern.test(tariff)) throw new Error(`${TARIFF} no longer says ${pattern}`);

const items = await catalogue();
const { symbols: directory, created } = await usDirectory();

const rows = [];
const seen = new Set();
const left = { "not in the US directories": [], "warrant or right": [], "same title twice": [], "unreadable ticker": [] };
for (const item of items) {
  const ticker = String(item.ticker || "").trim();
  const title = String(item.title || "").replace(/\s+/g, " ").replace(/^"|"$/g, "").trim();
  const match = ticker.match(/^(.+)\.(NASDAQ|NYSE)$/);
  if (item.market !== "us" || !match) throw new Error(`catalogue line ${ticker} of market ${item.market}: no mapping for it yet`);
  const act = actSymbol(match[1]);
  if (!act) {
    left["unreadable ticker"].push(ticker);
    continue;
  }
  const listed = directory.get(act);
  if (!listed) {
    left["not in the US directories"].push(ticker);
    continue;
  }
  if (!listed.mic || !US_MICS.has(listed.mic)) throw new Error(`${act} is on an unknown exchange code ${listed.code}`);
  if (warrantOrRight(act, listed)) {
    left["warrant or right"].push(ticker);
    continue;
  }
  if (seen.has(act)) {
    left["same title twice"].push(ticker);
    continue;
  }
  seen.add(act);
  const type = listed.etf ? "ETF" : "STOCK";
  const found = usRow({ symbol: assetSymbol(act), name: title, type });
  const display = act.replace("$", "-");
  const isin = US_MICS.has(found.mic) ? found.isin : "";
  rows.push({
    query: isin || display,
    ticker: display,
    name: title || listed.name,
    exchange: PLACE[listed.mic],
    mic: listed.mic,
    currency: "USD",
    type,
    isin,
    raw: [ticker, title, listed.name, listed.code].join(" | "),
    ...(!isin && found.matches && US_MICS.has(found.mic) ? { matches: found.matches } : {}),
  });
}

for (const [ticker, mic] of [["AAPL", "XNAS"], ["BRK.B", "XNYS"], ["QQQ", "XNAS"], ["ABR-E", "XNYS"]]) {
  if (!rows.some((row) => row.ticker === ticker && row.mic === mic)) throw new Error(`${ticker} is missing or not on ${mic}`);
}
// 2,143 of 8,299 on 23 October 2026.
if (left["not in the US directories"].length > items.length * 0.35) throw new Error(`${left["not in the US directories"].length} lines are in no US directory`);

const [kase, aix, dubai] = [await kaseListings(), await aixListings(), await nasdaqDubaiListings()];
for (const extra of [...kase.rows, ...aix.rows, ...dubai.rows]) {
  rows.push(extra);
}
left["KASE, AIX or Nasdaq Dubai line with no ISIN"] = [...kase.leftOut, ...aix.leftOut, ...dubai.leftOut];

rows.sort((a, b) => a.exchange.localeCompare(b.exchange) || a.ticker.localeCompare(b.ticker));
const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const counts = {};
for (const row of stamped) counts[`${row.exchange} ${row.type}`] = (counts[`${row.exchange} ${row.type}`] || 0) + 1;
console.error(`US directories of ${created["nasdaqlisted.txt"]} ET; ${items.length} catalogue lines`);
for (const [reason, list] of Object.entries(left)) console.error(`left out, ${reason} (${list.length}): ${list.slice(0, 40).join(" ")}${list.length > 40 ? " ..." : ""}`);
console.error(`dropped as bonds: ${rows.length - stamped.length}; no ISIN: ${stamped.filter((row) => !row.isin && !row.matches).length}`);
console.error(Object.entries(counts).map(([key, count]) => `${key}: ${count}`).join("; "));
console.error(`wrote ${OUTPUT.pathname} (${stamped.length} rows)`);
