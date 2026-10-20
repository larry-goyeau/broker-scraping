// What Nomura Securities (野村證券, Japan) sells in its online service
// (オンラインサービス), with no login.
//
// Abroad, the online service sells the shares and ETFs Nomura has chosen on
// four markets: the US (NYSE, Nasdaq and Cboe BZX primary listings), Hong
// Kong, Germany (XETRA) and Australia. Nomura's public foreign-stock search
// is that list: its help page says it shows, for each market, the names
// "野村オンラインサービスで売買の取扱いを行っている銘柄". The search takes a
// market filter and pages by 100 at most (MAXDISP=100, BEFORE=offset):
//   US shares   no filter (the page's default)
//   US ETFs     KEY8=ETF&TARGET4=NULL
//   Hong Kong   KEY7=/HK_D&TARGET3=NULL&TARGET4=NULL
//   Germany     KEY7=/XE,/XE_D&TARGET3=NULL&TARGET4=NULL
//   Australia   KEY7=/AUI_D&TARGET3=NULL&TARGET4=NULL
// and the "all markets" filter (KEY7 with every suffix, SearchType=0) must
// count exactly their sum. Each line gives the quote code (@AAPL/UR), the
// English and Japanese names, Nomura's own code (A0030) and the NISA flag.
// No line prints an ISIN, a venue or a currency. Other markets
// (London, Euronext, Milan, Singapore and so on, which the ETF lineup pages
// also show) are sold at the branches only and are left out.
//
// Types. A US line is an ETF when the ETF filter returns it, else a STOCK;
// an ETF whose name says ETN is an ETN. A Hong Kong, German or Australian
// line is an ETF when ../../assets/etfs.csv knows the code on that
// exchange, when its name says ETF, UCITS, TRACKER or FUND, or when Nomura's
// foreign-ETF lineup pages list it (2800 HK, EUN2 GT, STW AU and others);
// ETC or ETN when the name says so. The rest are shares.
//
// Venue, ISIN and currency. A US code is joined to ../../assets/stocks.csv
// and etfs.csv for its venue and ISIN (usRow in
// ../mitsubishiufjesmart/japan.mjs); when the lineup pages name the
// exchange of an ETF (NYSEアーカ, ナスダック, CBOE BZX) that exchange is used.
// US lines stay one row in dollars: the US book is one NBBO. A Hong Kong
// code takes its ISIN and trading currency from HKEX's List of Securities;
// a German line is XETRA in euros and an Australian line ASX in Australian
// dollars, their ISIN from the asset lists on XETR and ASX.
//
// Other currency lines. The row Nomura lists stays as it is. When the same
// place also trades that title in another currency the account can hold
// (depositHas("nomurajp") in ../../deposits.mjs: JPY, USD, EUR, AUD), one row
// is added for that line: same ISIN and place, its own currency and ticker,
// and a raw that names the file it came from.
//   Hong Kong: HKEX's List of Securities has one counter per trading
//   currency under the same ISIN (column "Trading Currency"). A USD, EUR,
//   AUD or JPY counter of a listed code is added with its own stock code
//   (2836 iShares India -> 9836 in USD). RMB counters (80700 and the like)
//   are not: CNY/CNH is not a Nomura deposit currency.
//   Xetra: Deutsche Börse's list of all tradable Xetra instruments
//   (t7-xetr-allTradableInstruments.csv, linked from the Tradable
//   Instruments page) gives each line's ISIN, mnemonic and currency. A
//   USD, AUD or JPY line of the same ISIN is added with its mnemonic. On
//   20 October 2026 all 66 titles traded in euros only, so none was added.
//   The file also settles the ISIN of a mnemonic the asset lists leave
//   open (QIA). If the file cannot be read, nothing is added and the run
//   says so.
//   ASX quotes these shares and ETFs in Australian dollars only, and the
//   four Japanese exchanges in yen only: nothing is added there. US
//   venues are one NBBO market in dollars: nothing is added either.
//
// At home the online service trades listed domestic shares and ETFs.
// Nomura names no exchange for its online domestic orders; its domestic
// quote search (msearch.exe, F=nlist) offers Tokyo, Nagoya, Sapporo and
// Fukuoka and broker-list.json gives all four. So the home book is built as
// for Mitsubishi UFJ eSmart, with the readers of japan.mjs: Tokyo is the JPX
// month-end file (Prime, Standard and Growth, domestic and foreign, and the
// ETF・ETN section, a name that says ETN being an ETN); the REIT/fund
// section, 出資証券 and TOKYO PRO Market are left out as in the other
// Japanese catalogues. Nagoya is the exchange's Premier, Main and Next
// search plus its ETF board; Fukuoka is the monthly listed-securities PDF
// with today's sole-listing page on top; Sapporo is its own page, sole and
// dual sections. A name listed on several of the four exchanges is written
// once per exchange (Japan has no consolidated book). A code JASDEC does not
// handle stays out.
// Nomura's own domestic quote search, read in full per exchange (KEY2=T, M,
// S, FK, pages of 100), is today's list, so it corrects the month-end files
// both ways: a code it lists that they lack (a listing since month-end, the
// 1319 ETF on Fukuoka and Sapporo) is added, typed ETF when its name says
// 上場投信 or ETF and ETN when it says ETN; PRO Market lines (TPM, FPM,
// Sapporo PRO Frontier SPFM), 投資法人/投資証券/出資証券 names and codes the
// JPX file files under REIT/fund or 出資証券 stay out. A code the files carry
// that the search no longer lists on that exchange has been delisted there
// and is dropped.
//
//   https://advance.quote.nomura.co.jp/meigara/nomura2/qsearch.exe?F=users/nomura/fs_stklist
//   https://quote.nomura.co.jp/nomura/cgi-bin/qsearch.exe?F=nomura_help_01
//   https://www.nomura.co.jp/solution/financial-assets/fstock/fetf/
//   https://www.nomura.co.jp/solution/financial-assets/fstock/fetf/lineup/<page>.html
//   https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
//   https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra
//   https://advance.quote.nomura.co.jp/meigara/nomura/msearch.exe?F=nlist&KEY2=<T|M|S|FK>
//   (and the exchange sources listed in ../mitsubishiufjesmart/japan.mjs)
//
//   node brokers/nomurajp/nomurajp_scraping.mjs

import {
  attachJapanIsins,
  decodeEntities,
  fetchText,
  fold,
  fukuokaListing,
  hkexCounters,
  hkOtherCounters,
  hkRow,
  jasdecRefused,
  jpRow,
  nagoyaEtfs,
  nagoyaListing,
  normalize,
  parseCsv,
  sapporoListing,
  textOf,
  tokyoListing,
  usRow,
  writeCatalogue,
} from "../mitsubishiufjesmart/japan.mjs";
import { depositHas } from "../../deposits.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";

const SEARCH = "https://advance.quote.nomura.co.jp/meigara/nomura2/qsearch.exe?F=users/nomura/fs_stklist";
const HELP = "https://quote.nomura.co.jp/nomura/cgi-bin/qsearch.exe?F=nomura_help_01";
const LINEUP = "https://www.nomura.co.jp/solution/financial-assets/fstock/fetf/";
const DOMESTIC = "https://advance.quote.nomura.co.jp/meigara/nomura/msearch.exe?F=nlist";
const XETRA_PAGE = "https://www.cashmarket.deutsche-boerse.com/cash-en/trading/Tradable-Instruments-Xetra";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);
const PAGE = 100;
const WORKERS = 4;
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const MARKETS = {
  US: { params: {}, suffixes: ["UR"] },
  "US ETF": { params: { KEY8: "ETF", TARGET4: "NULL" }, suffixes: ["UR"] },
  HK: { params: { KEY7: "/HK_D", TARGET3: "NULL", TARGET4: "NULL" }, suffixes: ["HK_D"] },
  DE: { params: { KEY7: "/XE,/XE_D", TARGET3: "NULL", TARGET4: "NULL" }, suffixes: ["XE", "XE_D"] },
  AU: { params: { KEY7: "/AUI_D", TARGET3: "NULL", TARGET4: "NULL" }, suffixes: ["AUI_D"] },
};
const ALL = { KEY7: "/UR,/HK_D,/XE,/XE_D,/AUI_D", TARGET3: "NULL", TARGET4: "NULL", SearchType: "0" };

// Lineup page exchange -> US mic. Other exchanges there are branch-only.
const LINEUP_US = { "NYSEアーカ": "ARCX", "ナスダック": "XNAS", "CBOE BZX": "BATS", "NYSE": "XNYS", "ニューヨーク": "XNYS" };
const LINEUP_SUFFIX = { US: "US", HK: "HK", GT: "DE", AU: "AU" };

// Run `work` over `items`, at most WORKERS at once.
async function pool(items, work) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(WORKERS, items.length) }, async () => {
      while (next < items.length) {
        const at = next++;
        out[at] = await work(items[at], at);
      }
    })
  );
  return out;
}

function searchUrl(params, before = 0) {
  const url = new URL(SEARCH);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("MAXDISP", String(PAGE));
  if (before) {
    url.searchParams.set("GO_BEFORE", "");
    url.searchParams.set("BEFORE", String(before));
  }
  return url.href;
}

function hitCount(html) {
  const match = html.match(/showHit\("(\d+)"\)/);
  if (!match) throw new Error("the search page shows no hit count");
  return Number(match[1]);
}

const unquote = (value) => value.replace(/\\(.)/g, "$1");

// One search page: every <tr> with a live getMeigaraName call.
function searchLines(html) {
  const lines = [];
  for (const [row] of html.matchAll(/<tr>[\s\S]*?<\/tr>/g)) {
    // The live call quotes the English name with ' unless the name holds a
    // ', and then with "; the other spelling sits in a /* */ comment.
    const live = row.replace(/\/\*[\s\S]*?\*\//g, "");
    const arg = `(?:"((?:[^"\\\\]|\\\\.)*)"|'((?:[^'\\\\]|\\\\.)*)')`;
    const hit = live.match(new RegExp(`nameLists = getMeigaraName\\(${arg},${arg},${arg}\\);`));
    if (!hit) {
      if (row.includes("getMeigaraName")) throw new Error(`search line not read: ${row.slice(0, 300)}`);
      continue;
    }
    const call = [hit[0], hit[1] ?? hit[2], hit[3] ?? hit[4], hit[5] ?? hit[6]];
    const quote = unquote(call[1]).match(/^@(.+)\/([A-Z_]+)$/);
    const shown = row.match(/<span class="_fw-n _mr-10">\[([^\]/]+)\/([A-Z]\d{4})\]<\/span>/);
    if (!quote || !shown) throw new Error(`search line not read: ${row.slice(0, 300)}`);
    lines.push({
      symbol: quote[1],
      suffix: quote[2],
      code: shown[2],
      shown: shown[1],
      english: normalize(decodeEntities(unquote(call[2]))),
      japanese: fold(decodeEntities(unquote(call[3]))),
      nisa: /NISA（成長投資）/.test(row),
    });
  }
  return lines;
}

// Every line of one market filter, all pages.
async function market(label) {
  const { params, suffixes } = MARKETS[label];
  const first = await fetchText(searchUrl(params));
  const total = hitCount(first);
  const offsets = [];
  for (let before = PAGE; before < total; before += PAGE) offsets.push(before);
  const pages = [first, ...(await pool(offsets, (before) => fetchText(searchUrl(params, before))))];
  const lines = pages.flatMap(searchLines);
  if (lines.length !== total) throw new Error(`${label}: the search counts ${total} and ${lines.length} were read`);
  for (const line of lines) {
    if (!suffixes.includes(line.suffix)) throw new Error(`${label}: ${line.symbol}/${line.suffix} is not on this market`);
  }
  return { label, total, lines };
}

async function checkHelp() {
  const text = textOf(await fetchText(HELP));
  for (const phrase of ["野村オンラインサービスで売買の取扱いを行っている銘柄", "XETRA", "香港証券取引所", "オーストラリア証券取引所"]) {
    if (!text.includes(phrase)) throw new Error(`the search help page no longer says ${phrase}`);
  }
}

// Foreign ETF lineup pages: ticker key ("STW AU") -> { venue, name }.
async function lineup() {
  const index = await fetchText(LINEUP);
  const pages = [...new Set([...index.matchAll(/href="(\/solution\/financial-assets\/fstock\/fetf\/lineup\/[a-z0-9-]+\.html)"/g)].map((m) => m[1]))];
  if (pages.length < 8) throw new Error(`the ETF page links only ${pages.length} lineup pages`);
  const funds = new Map();
  for (const html of await pool(pages, (path) => fetchText(new URL(path, LINEUP).href))) {
    for (const [row] of html.matchAll(/<tr[\s\S]*?<\/tr>/g)) {
      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((cell) => textOf(cell[1]));
      const hit = cells[0]?.match(/^(.*)／([A-Z]\d{4})\s*＜([^＞]+)＞/);
      if (!hit || cells.length < 4) continue;
      const parts = hit[3].trim().split(/\s+/);
      // The bull/bear page writes US tickers without " US".
      const place = parts.length > 1 ? LINEUP_SUFFIX[parts.at(-1)] || parts.at(-1) : "US";
      funds.set(`${parts[0]} ${place}`, { name: hit[1].trim(), code: hit[2], venue: cells.at(-2), currency: cells.at(-1) });
    }
  }
  if (funds.size < 100) throw new Error(`the lineup pages list only ${funds.size} funds`);
  return funds;
}

// Asset-list lines on one exchange: code -> { isin, etf } (several ISINs kept).
function assetLines(exchange) {
  const out = new Map();
  for (const [file, etf] of [[STOCKS, false], [ETFS, true]]) {
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    for (const line of table.slice(1)) {
      if (normalize(line[1]).toUpperCase() !== exchange) continue;
      const code = normalize(line[0]).toUpperCase().split(":").pop();
      const isin = normalize(line[2]).toUpperCase();
      if (!out.has(code)) out.set(code, { isins: new Set(), etf: false });
      const entry = out.get(code);
      if (ISIN.test(isin)) entry.isins.add(isin);
      if (etf) entry.etf = true;
    }
  }
  return out;
}

// The account holds this currency without converting it.
const holds = (currency) => depositHas("nomurajp", "", currency);

// Deutsche Börse's list of every tradable Xetra instrument, active lines
// only: { byIsin: isin -> [{ mnemonic, currency }], byMnemonic: mnemonic -> isin }.
// Two title lines, then a header; fields split on ";" (no quoting).
async function xetraInstruments() {
  const page = await fetchText(XETRA_PAGE);
  const href = page.match(/href="([^"]*t7-xetr-allTradableInstruments\.csv)"/);
  if (!href) throw new Error("the Tradable Instruments page does not link the Xetra file");
  const lines = (await fetchText(new URL(decodeEntities(href[1]), XETRA_PAGE).href)).split(/\r?\n/);
  if (!/^Market:;XETR/.test(lines[0] || "")) throw new Error(`the Xetra file starts with ${lines[0]}`);
  const header = (lines[2] || "").split(";");
  const at = Object.fromEntries(["Product Status", "Instrument Status", "ISIN", "Mnemonic", "Currency"].map((name) => [name, header.indexOf(name)]));
  if (Object.values(at).some((index) => index < 0)) throw new Error(`Xetra file columns moved: ${header.slice(0, 20).join(", ")}`);
  const byIsin = new Map();
  const byMnemonic = new Map();
  for (const line of lines.slice(3)) {
    const cells = line.split(";");
    if (cells[at["Product Status"]] !== "Active" || cells[at["Instrument Status"]] !== "Active") continue;
    const isin = normalize(cells[at.ISIN]).toUpperCase();
    const mnemonic = normalize(cells[at.Mnemonic]).toUpperCase();
    const currency = normalize(cells[at.Currency]).toUpperCase();
    if (!ISIN.test(isin) || !mnemonic || !/^[A-Z]{3}$/.test(currency)) continue;
    if (!byIsin.has(isin)) byIsin.set(isin, []);
    byIsin.get(isin).push({ mnemonic, currency });
    byMnemonic.set(mnemonic, isin);
  }
  if (byIsin.size < 3000) throw new Error(`the Xetra file lists only ${byIsin.size} ISINs`);
  return { byIsin, byMnemonic, updated: (lines[1] || "").split(";")[1] || "" };
}

function fundType(name, listedAsEtf) {
  if (/\bETN\b/i.test(name)) return "ETN";
  if (/\bETC\b/i.test(name)) return "ETC";
  if (listedAsEtf || /\b(ETF|UCITS|TRACKER|FUND|ETFS)\b/i.test(name)) return "ETF";
  return "STOCK";
}

const note = (line) => [line.japanese, `Nomura ${line.code}`, line.nisa ? "NISA" : ""].filter(Boolean).join(" ");

// Nomura's domestic quote search, every line of each exchange:
// exchange -> [{ code, name, label }], label being 福証, 福証FPM, 名証メイン...
const DOMESTIC_KEYS = { Tokyo: "T", Nagoya: "M", Sapporo: "S", Fukuoka: "FK" };

function domesticLines(html) {
  const lines = [];
  for (const [row] of html.matchAll(/<tr>[\s\S]*?<\/tr>/g)) {
    const hit = row.match(/QCODE=([0-9A-Z]+)&amp;TEMPLATE=nomura_tp_kabu_01[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span class="_fw-n">\[([0-9A-Z]+)\]\s*([^<]*)<\/span>/);
    if (!hit) continue;
    lines.push({ code: hit[3], name: fold(textOf(hit[2].replace(/<!--[\s\S]*?-->/g, ""))), label: normalize(hit[4]) });
  }
  return lines;
}

async function domesticListing() {
  const out = {};
  for (const [exchange, key] of Object.entries(DOMESTIC_KEYS)) {
    const url = (before) => `${DOMESTIC}&KEY2=${key}&MAXDISP=${PAGE}${before ? `&GO_BEFORE=&BEFORE=${before}` : ""}`;
    const first = await fetchText(url(0));
    const total = hitCount(first);
    const offsets = [];
    for (let before = PAGE; before < total; before += PAGE) offsets.push(before);
    const pages = [first, ...(await pool(offsets, (before) => fetchText(url(before))))];
    const lines = pages.flatMap(domesticLines);
    if (lines.length !== total) throw new Error(`domestic ${exchange}: the search counts ${total} and ${lines.length} were read`);
    out[exchange] = lines;
  }
  return out;
}

// A domestic line the exchange readers do not give: PRO Market (TPM, FPM,
// Sapporo PRO Frontier SPFM), a code the JPX file files in a section left
// out above (8421 出資証券, REIT and fund units), REIT, infrastructure and other 投資法人 units and 出資証券 stay out
// as above; an 上場投信 or ETF name is an ETF, an ETN name an ETN.
function domesticType({ name, label }) {
  if (/(TPM|FPM|SPFM)$|PRO/i.test(label)) return "";
  if (/投資法人|投資証券|出資証券/.test(name)) return "";
  if (/ETN/i.test(name)) return "ETN";
  if (/上場投信|上場投資信託|ETF/i.test(name)) return "ETF";
  return "STOCK";
}

const TOKYO_STOCK = new Set([
  "プライム（内国株式）",
  "スタンダード（内国株式）",
  "グロース（内国株式）",
  "プライム（外国株式）",
  "スタンダード（外国株式）",
  "グロース（外国株式）",
]);

// ---- foreign book ----
await checkHelp();
const books = [];
for (const label of Object.keys(MARKETS)) books.push(await market(label));
const allTotal = hitCount(await fetchText(searchUrl(ALL)));
const sum = books.reduce((total, book) => total + book.total, 0);
if (allTotal !== sum) throw new Error(`the all-markets search counts ${allTotal}, the markets add up to ${sum}`);
const byLabel = Object.fromEntries(books.map((book) => [book.label, book.lines]));
const etfCodes = new Set(byLabel["US ETF"].map((line) => line.code));
for (const line of byLabel.US) if (etfCodes.has(line.code)) throw new Error(`${line.symbol} is in both US filters`);

const funds = await lineup();
const counters = await hkexCounters();
const xetra = assetLines("XETR");
const asx = assetLines("ASX");

const rows = [];
const doubtful = [];
for (const [label, type] of [["US", "STOCK"], ["US ETF", "ETF"]]) {
  for (const line of byLabel[label]) {
    const kind = type === "ETF" ? (fundType(line.english, true) === "ETN" ? "ETN" : "ETF") : "STOCK";
    // The quote code writes a class share as BRK'.B; the shown ticker is BRK.B.
    const row = usRow({ symbol: line.shown, name: line.english, type: kind, note: note(line) });
    const fund = funds.get(`${line.shown} US`);
    const mic = fund && LINEUP_US[fund.venue];
    if (mic && row.mic !== mic) {
      if (row.mic && row.mic !== "OTCM") doubtful.push(`${line.shown}: asset lists say ${row.mic}, lineup says ${fund.venue}`);
      row.exchange = mic;
      row.mic = mic;
    }
    if (fund && type === "STOCK") doubtful.push(`${line.shown}: in the ETF lineup but returned by the share filter`);
    rows.push(row);
  }
}

const hkAssets = assetLines("HKEX");
for (const line of byLabel.HK) {
  const code = String(Number(line.symbol));
  const listed = hkAssets.get(code)?.etf || funds.has(`${code} HK`) || funds.has(`${line.symbol} HK`);
  rows.push(hkRow({ code, name: line.english, type: fundType(line.english, listed), note: note(line) }));
}
const { added: hkAdded, unlisted } = hkOtherCounters(rows, counters, holds);
for (const row of hkAdded) row.raw = `HKEX List of Securities: ${row.raw}`;
// Counters of a listed ISIN left out because the account cannot hold their currency.
const hkSkipped = {};
{
  const listedIsins = new Set(rows.filter((row) => row.exchange === "HKEX").map((row) => row.isin));
  const listedCodes = new Set(rows.filter((row) => row.exchange === "HKEX").map((row) => row.ticker));
  for (const counter of counters.values()) {
    if (!listedIsins.has(counter.isin) || listedCodes.has(counter.code) || holds(counter.currency)) continue;
    hkSkipped[counter.currency] = (hkSkipped[counter.currency] || 0) + 1;
  }
}

for (const [label, exchange, mic, currency, assets, place] of [
  ["DE", "XETRA", "XETR", "EUR", xetra, "DE"],
  ["AU", "ASX", "XASX", "AUD", asx, "AU"],
]) {
  for (const line of byLabel[label]) {
    const asset = assets.get(line.symbol.toUpperCase());
    const isins = [...(asset?.isins || [])];
    const type = fundType(line.english, asset?.etf || funds.has(`${line.symbol} ${place}`));
    if (!isins.length) doubtful.push(`${exchange} ${line.symbol}: no ISIN in the asset lists`);
    const row = {
      query: isins.length === 1 ? isins[0] : line.symbol,
      ticker: line.symbol,
      name: line.english || line.japanese,
      exchange,
      mic,
      currency,
      type,
      isin: isins.length === 1 ? isins[0] : "",
      raw: [line.symbol, line.english, note(line), type].filter(Boolean).join(" "),
    };
    if (isins.length > 1) stampIsinMatches(row, new Map([[mic === "XETR" ? "XETR" : "ASX", isins]]), line.symbol);
    rows.push(row);
  }
}

// Xetra lines of the same ISIN in another currency the account holds.
const xetraAdded = [];
let xetraFile = "";
try {
  const { byIsin, byMnemonic, updated } = await xetraInstruments();
  xetraFile = `read (updated ${updated})`;
  const added = [];
  for (const row of rows) {
    if (row.exchange !== "XETRA") continue;
    const listed = byMnemonic.get(row.ticker);
    if (!row.isin && listed && row.matches?.includes(listed)) {
      delete row.matches;
      row.isin = listed;
      row.query = listed;
    } else if (row.isin && listed && listed !== row.isin) {
      doubtful.push(`XETRA ${row.ticker}: asset lists say ${row.isin}, Xetra file says ${listed}`);
    }
    for (const line of byIsin.get(row.isin) || []) {
      if (line.currency === row.currency || line.mnemonic === row.ticker || !holds(line.currency)) continue;
      added.push({
        ...row,
        ticker: line.mnemonic,
        currency: line.currency,
        raw: `Xetra all tradable instruments: ${line.mnemonic} ${line.currency} line of ${row.raw}`,
      });
    }
  }
  rows.push(...added);
  xetraAdded.push(...added);
} catch (error) {
  xetraFile = `NOT READ, no Xetra currency line added (${error.message})`;
}

// Lineup funds on an online market that the online list lacks.
const online = new Set([
  ...[...byLabel.US, ...byLabel["US ETF"]].map((line) => `${line.shown} US`),
  ...byLabel.HK.map((line) => `${Number(line.symbol)} HK`),
  ...byLabel.DE.map((line) => `${line.symbol} DE`),
  ...byLabel.AU.map((line) => `${line.symbol} AU`),
]);
const lineupOnly = [...funds.keys()].filter((key) => /\s(US|HK|DE|AU)$/.test(key) && !online.has(key.replace(/^0+(?=\d)/, "")));
const branchOnly = [...funds.keys()].filter((key) => !/\s(US|HK|DE|AU)$/.test(key));

// ---- home book ----
const [tokyo, nagoya, nagoyaFunds, fukuoka, sapporo, refused] = await pool(
  [tokyoListing, nagoyaListing, nagoyaEtfs, fukuokaListing, sapporoListing, jasdecRefused],
  (read) => read()
);
const nomuraHome = await domesticListing();
const dropped = {};
const drop = (why) => (dropped[why] = (dropped[why] || 0) + 1);
const leftOut = new Set();
for (const line of tokyo) {
  if (!TOKYO_STOCK.has(line.section) && !["ETF・ETN", "PRO Market"].includes(line.section)) leftOut.add(line.code);
  if (refused.has(line.code)) drop("JASDEC");
  else if (TOKYO_STOCK.has(line.section)) rows.push(jpRow({ ...line, exchange: "Tokyo", type: "STOCK" }));
  else if (line.section === "ETF・ETN") {
    rows.push(jpRow({ ...line, exchange: "Tokyo", type: fold(line.name).includes("ETN") ? "ETN" : "ETF" }));
  } else drop(line.section);
}
for (const [exchange, lines] of [["Nagoya", nagoya], ["Fukuoka", fukuoka], ["Sapporo", sapporo]]) {
  for (const line of lines) {
    if (refused.has(line.code)) drop("JASDEC");
    else rows.push(jpRow({ ...line, exchange, type: "STOCK" }));
  }
}
for (const line of nagoyaFunds) rows.push(jpRow({ ...line, exchange: "Nagoya", type: "ETF" }));

// Nomura's own domestic search fills what the exchange files miss: listings
// since the month-end files, and 1319 on Fukuoka and Sapporo.
const added = [];
const nomuraOnly = {};
const unknownToNomura = [];
for (const [exchange, lines] of Object.entries(nomuraHome)) {
  const have = new Set(rows.filter((row) => row.exchange === exchange).map((row) => row.ticker));
  const listed = new Set(lines.map((line) => line.code));
  for (const line of lines) {
    if (have.has(line.code) || refused.has(line.code)) continue;
    if (leftOut.has(line.code)) {
      nomuraOnly[exchange] = (nomuraOnly[exchange] || 0) + 1;
      continue;
    }
    const type = domesticType(line);
    if (!type) {
      nomuraOnly[exchange] = (nomuraOnly[exchange] || 0) + 1;
      continue;
    }
    rows.push(jpRow({ code: line.code, name: line.name, exchange, type, section: `${line.label} (Nomura search)` }));
    added.push(`${exchange} ${line.code} ${line.name} ${type}`);
  }
  // A code the month-end files still carry but Nomura's live search no
  // longer lists has been delisted from that exchange since: dropped.
  for (const code of have) if (!listed.has(code)) unknownToNomura.push(`${exchange} ${code}`);
}
const gone = new Set(unknownToNomura);
for (let at = rows.length - 1; at >= 0; at -= 1) if (gone.has(`${rows[at].exchange} ${rows[at].ticker}`)) rows.splice(at, 1);
attachJapanIsins(rows);

const output = writeCatalogue(import.meta.url, "nomurajp-parsed.json", rows, {
  "Tokyo STOCK": 3500,
  "Tokyo ETF": 300,
  Nagoya: 150,
  Fukuoka: 5,
  Sapporo: 5,
  HKEX: 200,
  XETRA: 50,
  ASX: 15,
});

// ---- checks ----
const venues = new Map();
for (const row of output) {
  const key = `${row.exchange}|${row.mic}|${row.currency}`;
  if (!venues.has(key)) venues.set(key, { count: 0, venue: resolveVenue(row)?.venue?.mic || "" });
  venues.get(key).count += 1;
}
const failed = [...venues].filter(([, hit]) => !hit.venue);
console.error(`Search: ${books.map((book) => `${book.label} ${book.total}`).join(", ")}; all markets ${allTotal}`);
console.error(`Venues: ${[...venues].map(([key, hit]) => `${key} ${hit.count} -> ${hit.venue || "UNRESOLVED"}`).join("; ")}`);
if (failed.length) console.error(`resolveVenue failed for: ${failed.map(([key]) => key).join(", ")}`);
const ours = {};
for (const row of output) if (["Tokyo", "Nagoya", "Sapporo", "Fukuoka"].includes(row.exchange)) ours[row.exchange] = (ours[row.exchange] || 0) + 1;
console.error(`Nomura domestic quote search: ${Object.entries(nomuraHome).map(([key, lines]) => `${key} ${lines.length} (ours ${ours[key] || 0})`).join(", ")}`);
console.error(`Added from it: ${added.join("; ") || "none"}`);
console.error(`In it but left out (PRO, REIT/fund units): ${JSON.stringify(nomuraOnly)}`);
console.error(`In the exchange files but not in it (dropped): ${unknownToNomura.join(", ") || "none"}`);
console.error(`Left out at home: ${Object.entries(dropped).map(([why, count]) => `${count} ${why}`).join(", ")}`);
console.error(`HK codes HKEX does not list: ${unlisted.join(", ") || "none"}`);
console.error(`HK counters added: ${hkAdded.map((row) => `${row.ticker} ${row.currency} (${row.isin})`).join(", ") || "none"}`);
console.error(`HK counters not held by the account: ${Object.entries(hkSkipped).map(([ccy, count]) => `${count} ${ccy}`).join(", ") || "none"}`);
console.error(`Xetra instrument file ${xetraFile}; lines added: ${xetraAdded.map((row) => `${row.ticker} ${row.currency} (${row.isin})`).join(", ") || "none"}`);
console.error(`Lineup funds on an online market but not in the online list: ${lineupOnly.join(", ") || "none"}`);
console.error(`Lineup funds on branch-only markets: ${branchOnly.length}`);
if (doubtful.length) console.error(`Doubtful:\n  ${doubtful.join("\n  ")}`);
