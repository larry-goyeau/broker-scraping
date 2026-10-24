// What Slayz sells, with no login. Slayz is the app of Dinamik Menkul
// Değerler A.Ş. (Istanbul). It sells Borsa Istanbul shares and funds in
// lira and US shares and ETFs in dollars. Its public market pages
// (/canli-borsa, /urunler/borsa-istanbul, /urunler/abd-borsalari) are
// fed by one JSON list per market, the same list the app shows. Each
// line names the ticker, the board (BIST, NASDAQ, NYSE, ARCA, AMEX,
// BATS, OTC), a type (2 is an ETF) and whether a buy order is open.
// That list is the catalogue.
//
// The fees are published on /ucretler and the product pages: 0% on
// Borsa Istanbul shares, a flat $1 per US order, 5% BSMV on top.
//
// Kept: a line the client can buy (buyStatus). Left out: the index
// lines (sector "Endeks", the BIST indices and the US index ETFs the
// list repeats under NASDAQ with buying shut), subscription rights
// (".R" codes and "Rüçhan Hakkı" names), the ".HE" lines (not a listing
// of their own: the share trades under its plain code, which the list
// also holds), the Darphane gold certificate ALTINS1 and the real estate
// certificate DMLKTG, and the ATPAY venture-capital fund, which is no
// exchange-traded fund.
//
// Borsa Istanbul funds are printed with the fund marker of the board,
// "GLDTR(F)" in the name and GLDTRF as the code; they are kept as ETF
// under their BIST code (GLDTR), as in ../gcm. USDTR has the marker in
// its name only.
//
// The list is not kept up to date: it still offers to buy shares gone
// in a merger, a take-private or a ticker change (BK is now BNY, PSTG is
// P, MARKA is USHOL on Borsa Istanbul, the Ziraat dividend fund ZTM15 has
// been ZTM25 since 2024-08-05) and shares off the board. So:
// - a Borsa Istanbul line is kept only when ../ziraat/bist.mjs, the list
//   of every BIST share (the stock codes of KAP's BIST companies page that
//   TradingView files as a share or trust) and exchange-traded fund (KAP's
//   BYF funds), has its code as the same kind;
// - a US line on an exchange is kept only when Nasdaq Trader's symbol
//   directories of the day list it (./../raseed/usTape.mjs, which refuses
//   a directory older than the New York date), has a volume in the list
//   (the stale lines carry volume null) and has no open halt (no
//   resumption date) in the NYSE current trade halts download or the
//   Nasdaq Trader trade-halts RSS. A line the list has as a share on one
//   board that the directory has as an ETF on another is a ticker given
//   to a fund since (LAZR) and is left out. The OTC ADRs are not in the
//   directories and stay as the list gives them.
// Any of these sources failing or changing shape throws.
//
// The list prints no ISIN. On Borsa Istanbul ../../accepted.mjs fills
// it from the BIST lines of the stock and ETF lists. A US exchange line
// takes its venue (the primary listing) from the directory, and is an
// ETF when the directory flags it so or the list does (type 2 or an ETF
// sector); a closed-end fund such as DXYZ is a share. Its ISIN comes
// from ../../assets through usRow in ../mitsubishiufjesmart/japan.mjs.
// Some of the list's names are stale (GTR is named Goodyear but is a
// WisdomTree fund), so a US name comes from the asset lists when the
// ISIN is known. A Borsa Istanbul fund takes the asset lists' name only
// when it shares a word with the list's name (the asset lists name
// QTEMZ after an older fund). The US is one NBBO market: one row per title. Each
// title is quoted in one currency (TRY on BIST, USD in the US), and the
// US FAQ says lira must be changed to dollars first, so there is one row
// per title.
//
// broker-list.json carries no restriction for Slayz.
//
//   https://slayz.app/ucretler
//   https://slayz.app/urunler/borsa-istanbul
//   https://slayz.app/urunler/abd-borsalari
//   https://slayz.app/canli-borsa
//   https://webapp.slayz.app/api/Security?Language=tr&Market=tr
//   https://webapp.slayz.app/api/Security?Language=tr&Market=us
//   https://www.kap.org.tr/tr/bist-sirketler
//   https://www.kap.org.tr/tr/YatirimFonlari/BYF
//   ftp://ftp.nasdaqtrader.com/symboldirectory/nasdaqlisted.txt
//   ftp://ftp.nasdaqtrader.com/symboldirectory/otherlisted.txt
//   https://www.nyse.com/api/trade-halts/current/download
//   https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts
//
//   node brokers/slayz/slayz_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { parseCsv, usRow } from "../mitsubishiufjesmart/japan.mjs";
import fs from "node:fs";
import { LISTING, openHalts, tapeKey, usDirectory } from "../raseed/usTape.mjs";
import { bistListings } from "../ziraat/bist.mjs";

const API = "https://webapp.slayz.app/api/Security?Language=tr&Market=";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const STOCKS = new URL("../../assets/stocks.csv", import.meta.url);
const ETFS = new URL("../../assets/etfs.csv", import.meta.url);

const FLOOR = { BIST: { STOCK: 550, ETF: 14 }, US: { STOCK: 2300, ETF: 220 } };
const US_BOARD = { NASDAQ: "XNAS", NYSE: "XNYS", ARCA: "ARCX", BATS: "BATS", AMEX: "XASE", OTC: "OTCM" };
const US_MICS = new Set([...Object.values(LISTING), "OTCM"]);
const CERTIFICATE = new Set(["ALTINS1", "DMLKTG"]);
const ETF_SECTOR = /ETF|Borsa Yatırım Fon/i;
// Words of a fund name that say nothing of which fund it is.
const FUND_WORDS = new Set("BORSA YATIRIM FONU FONLARI PORTFOY PORT PORTFOLIO YONETIMI YONETIM HISSE SENEDI YOGUN ENDEKSI ENDEKS ENDEKSLI CAPITALISATION UNITS ETF FUND ASSET MANAGEMENT".split(" "));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function market(code) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(API + code, {
        headers: { "User-Agent": UA, Accept: "application/json", Origin: "https://slayz.app", Referer: "https://slayz.app/" },
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${API}${code}`);
      const body = await response.json();
      if (body?.success !== true || !Array.isArray(body.data)) throw new Error(`${code}: no data list`);
      return body.data;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(1500 * 2 ** attempt);
  }
  throw new Error(last);
}

// Names of the asset lists: BIST by code, the US by ISIN.
function assetNames() {
  const bist = new Map();
  const byIsin = new Map();
  for (const file of [STOCKS, ETFS]) {
    const table = parseCsv(fs.readFileSync(file, "utf8"));
    if (table[0]?.slice(0, 4).join(",").toLowerCase() !== "ticker,exchange,isin,name") throw new Error(`${file.pathname} header is ${table[0]}`);
    for (const [symbol, place, isin, name] of table.slice(1)) {
      const title = clean(name);
      if (!title) continue;
      if (place === "BIST") {
        const code = String(symbol).split(":").pop().toUpperCase();
        if (!bist.has(code)) bist.set(code, title);
      } else if (isin && !byIsin.has(isin)) byIsin.set(isin, title);
    }
  }
  return { bist, byIsin };
}

const fold = (value) =>
  clean(value)
    .toLocaleUpperCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9 ]/g, " ");
const nameWords = (value) => new Set(fold(value).split(/\s+/).filter((word) => word.length >= 4 && !FUND_WORDS.has(word)));

function check(line) {
  for (const key of ["ticker", "companyName", "tStockMarketName", "securityType", "buyStatus", "primarySectorName"]) {
    if (!(key in line)) throw new Error(`a line has no ${key}: ${JSON.stringify(line).slice(0, 200)}`);
  }
}

const names = assetNames();
const [tr, us, bist, tape, halts] = await Promise.all([market("tr"), market("us"), bistListings(), usDirectory(), openHalts()]);
const listed = new Map(bist.rows.map((row) => [row.ticker, row.type]));
const leftOut = { index: 0, right: 0, he: 0, certificate: 0, fund: [], closed: [], notListed: [], unlisted: [], noVolume: [], halted: [], reused: [] };

const rows = [];
for (const line of tr) {
  check(line);
  const code = clean(line.ticker).toUpperCase();
  const name = clean(line.companyName);
  if (line.tStockMarketName !== "BIST") throw new Error(`${code} is on ${line.tStockMarketName} in the BIST list`);
  if (line.primarySectorName === "Endeks") {
    leftOut.index += 1;
    continue;
  }
  if (/\.R$/.test(code) || /rüçhan/i.test(name)) {
    leftOut.right += 1;
    continue;
  }
  if (/\.HE$/.test(code)) {
    leftOut.he += 1;
    continue;
  }
  if (CERTIFICATE.has(code) || /sertifika/i.test(name)) {
    leftOut.certificate += 1;
    continue;
  }
  if (!line.buyStatus) {
    leftOut.closed.push(code);
    continue;
  }
  const marker = name.match(/^([A-Z0-9]{3,6})\(F\d?\)/);
  let ticker = code;
  let type = "STOCK";
  const fundName = /\bBYF\b|BORSA YATIRIM|Borsa Yatırım/i.test(name);
  if (marker || fundName || line.primarySectorName === "Borsa Yatırım Fonları") {
    // An exchange-traded fund says so in its name (BYF, borsa yatırım
    // fonu) or sits in the fund or "BIST" sector with the Ziraat funds.
    if (!fundName && !["BIST", "Borsa Yatırım Fonları"].includes(line.primarySectorName)) {
      leftOut.fund.push(code);
      continue;
    }
    ticker = marker ? marker[1] : code.replace(/F$/, "");
    if (!code.startsWith(ticker)) throw new Error(`fund ${code} is named ${name}`);
    type = "ETF";
  }
  if (!/^[A-Z0-9]{3,6}$/.test(ticker)) throw new Error(`unreadable BIST code ${code} (${name})`);
  if (!listed.has(ticker)) {
    leftOut.notListed.push(ticker);
    continue;
  }
  if (listed.get(ticker) !== type) throw new Error(`${code} is a ${type} here and a ${listed.get(ticker)} on BIST`);
  const assetName = names.bist.get(ticker);
  const sameFund = assetName && [...nameWords(assetName)].some((word) => nameWords(name).has(word));
  rows.push({
    query: ticker,
    ticker,
    name: (type === "ETF" ? sameFund && assetName : assetName) || name,
    exchange: "BIST",
    mic: "XIST",
    currency: "TRY",
    type,
    raw: [code, name, line.primarySectorName, line.marketCode].filter(Boolean).join(" | "),
  });
}

const boardKept = [];
for (const line of us) {
  check(line);
  const code = clean(line.ticker).toUpperCase();
  const name = clean(line.companyName);
  const board = clean(line.tStockMarketName).toUpperCase();
  if (line.primarySectorName === "Endeks" || line.marketCode) {
    leftOut.index += 1;
    continue;
  }
  if (!US_BOARD[board]) throw new Error(`${code} is on an unknown board ${board}`);
  if (!line.buyStatus) {
    leftOut.closed.push(code);
    continue;
  }
  if (!/^[A-Z][A-Z0-9]*(?:\.[A-Z])?$/.test(code)) throw new Error(`unreadable US ticker ${code} (${name})`);
  const brokerEtf = line.securityType === 2 || ETF_SECTOR.test(line.primarySectorName);
  let row;
  let type;
  if (board === "OTC") {
    // OTC lines are not in the directories: the asset lists give the ISIN.
    type = brokerEtf ? "ETF" : "STOCK";
    row = usRow({ symbol: code, name, type });
    if (row.mic !== "OTCM") {
      boardKept.push(`${code}:${board}`);
      row.mic = "OTCM";
      row.exchange = row.mic;
      row.isin = "";
      row.query = code;
      delete row.matches;
    }
  } else {
    const listed = tape.byKey.get(tapeKey(code));
    if (!listed) {
      leftOut.unlisted.push(code);
      continue;
    }
    if (line.volume === null) {
      leftOut.noVolume.push(code);
      continue;
    }
    if (halts.has(tapeKey(code))) {
      leftOut.halted.push(halts.get(tapeKey(code)));
      continue;
    }
    if (!listed.mic) throw new Error(`${code} is listed on exchange code ${listed.code}`);
    // A share in the list that the directory has as an ETF on another
    // board: the ticker went to a fund after the company left (LAZR was
    // Luminar on Nasdaq, now a Tema ETF on NYSE Arca).
    if (listed.etf && !brokerEtf && US_BOARD[board] !== listed.mic) {
      leftOut.reused.push(`${code} (${name} -> ${listed.name})`);
      continue;
    }
    type = listed.etf || brokerEtf ? "ETF" : "STOCK";
    row = usRow({ symbol: code, name, type });
    // The ISIN on file is kept only from an exchange line of the asset lists.
    if (!US_MICS.has(row.mic) || row.mic === "OTCM") {
      row.isin = "";
      row.query = code;
      delete row.matches;
    }
    if (US_BOARD[board] !== listed.mic) boardKept.push(`${code}:${board}->${listed.mic}`);
    row.mic = listed.mic;
    row.exchange = row.mic;
  }
  rows.push({
    query: row.query,
    ticker: row.ticker,
    name: (row.isin && names.byIsin.get(row.isin)) || name,
    exchange: row.exchange,
    mic: row.mic,
    currency: "USD",
    type,
    isin: row.isin || "",
    raw: [code, name, board, line.primarySectorName, `type ${line.securityType}`].join(" | "),
    ...(row.matches ? { matches: row.matches } : {}),
  });
}

const seen = new Set();
for (const row of rows) {
  const key = `${row.mic}:${row.ticker}`;
  if (seen.has(key)) throw new Error(`${key} listed twice`);
  seen.add(key);
}

const count = {};
for (const row of rows) {
  const place = row.mic === "XIST" ? "BIST" : "US";
  count[place] ??= { STOCK: 0, ETF: 0 };
  count[place][row.type] += 1;
}
for (const [place, floor] of Object.entries(FLOOR)) {
  for (const [type, least] of Object.entries(floor)) {
    if ((count[place]?.[type] || 0) < least) throw new Error(`only ${count[place]?.[type] || 0} ${place} ${type}`);
  }
}

rows.sort((a, b) => (a.mic === "XIST") - (b.mic === "XIST") || a.ticker.localeCompare(b.ticker));
const stamped = stampRows(withoutObligations(rows));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(new URL("slayz-parsed.json", import.meta.url), JSON.stringify(stamped, null, 2));

const byMic = {};
for (const row of stamped) byMic[row.mic] = (byMic[row.mic] || 0) + 1;
const types = { STOCK: 0, ETF: 0 };
for (const row of stamped) types[row.type] += 1;
console.error(
  `slayz: ${stamped.length} rows (${types.STOCK} STOCK, ${types.ETF} ETF); ` +
    `BIST ${count.BIST.STOCK} STOCK ${count.BIST.ETF} ETF, US ${count.US.STOCK} STOCK ${count.US.ETF} ETF; ` +
    `${Object.entries(byMic).map(([mic, n]) => `${mic} ${n}`).join(", ")}; ISIN ${stamped.filter((row) => row.isin).length}; ` +
    `left out ${leftOut.index} index, ${leftOut.right} rights, ${leftOut.he} .HE, ${leftOut.certificate} certificates, ` +
    `funds ${leftOut.fund.join(" ") || "none"}, buying shut ${leftOut.closed.join(" ") || "none"}; ` +
    `BIST lines no share or fund on KAP ${leftOut.notListed.length} (${leftOut.notListed.join(" ") || "none"}); ` +
    `US (directories of ${tape.created["nasdaqlisted.txt"]} ET) not listed ${leftOut.unlisted.length} (${leftOut.unlisted.join(" ") || "none"}), ` +
    `no volume ${leftOut.noVolume.length} (${leftOut.noVolume.join(" ") || "none"}), halted ${leftOut.halted.length} [${halts.sources.join(", ")}] (${leftOut.halted.join("; ") || "none"}), ` +
    `ticker now a fund ${leftOut.reused.length} (${leftOut.reused.join("; ") || "none"}); ` +
    `venue moved from the list's board ${boardKept.join(" ") || "none"}`
);
