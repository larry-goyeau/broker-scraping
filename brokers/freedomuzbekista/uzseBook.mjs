// The share book of the Republican Stock Exchange "Tashkent" (UZSE), with no
// login, for the Uzbek brokers whose clients order on it (Freedom Broker
// Uzbekistan in ./freedomuzbekista, Jett in ../jett). Uzbekistan has one
// stock exchange; it lists no ETF, ETN or ETC, and every line trades in
// sums (UZS).
//
// uzseListings() gives the exchange's share market (STK). The exchange's
// own list of that market is the search list behind its "Данные о курсе
// акции" page (/isu_infos/names?mkt_id=STK: ISIN, ticker, issuer); it
// carries the ordinary and the preferred line of each issuer in the
// quotation list and drops a line the day it is delisted (TAPA, SANE and
// the nine lines delisted on 14.09.2026 are gone from it). Each line is
// held to the quotation list (/isu_infos, "Компании включенные в биржевой
// котировальный лист"), which names the issuer's category: Premium,
// Standard, Transit and Privatizatsiya are kept; an issuer listed only in
// the Bond category is there for its bonds, so its stray share line stays
// out (OALB, last traded 28.02.2018; IMKF3, never traded), and so does a
// debt line (an ISIN that does not start with UZ7, such as CRMTN).
//
// Suspended lines stay out. The exchange prints no suspension list; it
// announces each suspension and each resumption on its notice board
// ("ВНИМАНИЕ: ПРИОСТАНОВЛЕНИЕ ТОРГОВ / ОБРАЩЕНИЯ / ОПЕРАЦИЙ ...", "Торги
// акциями ... возобновлены"), with the ISINs of the lines. The board is
// read back NOTICE_DAYS days; for each ISIN the latest of these notices
// wins, so a capitalisation pause that has been lifted (Trastbank,
// 14.08 to 25.08.2026) does not remove the line, and a liquidation does.
// A quotation-list line that has orders on the last trading day, or a
// trade after its suspension notice, is trading again even when no
// resumption was posted (UZNF: "ВРЕМЕННАЯ ПРИОСТАНОВКА ТОРГОВ" 22.04.2026,
// trading daily since its IPO). Off-exchange lines have only the notices.
//
// Never-traded lines stay out: a line with no order in the exchange's
// order list of the last trading day (/asking_prices.xlsx) is opened on
// its own page, and is dropped when the exchange prints no last trade.
//
//   https://uzse.uz/isu_infos                          (quotation list)
//   https://uzse.uz/isu_infos/names?mkt_id=STK          (share market)
//   https://uzse.uz/isu_infos/STK?isu_cd=<ISIN>         (last trade)
//   https://uzse.uz/asking_prices.xlsx?ord_dd=<dd.mm.yyyy>&mkt_id=STK&isu_cd=
//   https://uzse.uz/boards/notice/list?page=<n>         (suspensions)
//
// uzseListings({ otc: true }) adds the exchange's off-exchange board (ВТП,
// "внебиржевая торговая площадка", run by UZSE: the shares outside the
// quotation list). Both brokers of this place price it: Freedom Broker's
// tariff covers "Организованный биржевой рынок, а также организованный
// внебиржевой рынок АО РФБ «Тошкент»" (https://ffin.uz/file/2026/09/16/tarify_fiz_lits__2__docx.docx),
// Jett's plans page "торговлю акциями вне листинга (SMS)"
// (https://jett.uz/ru/plans). Its
// list (/otcmarkets/isu_elsis) keeps lines in liquidation, so the same
// suspension notices apply, and only the lines in the exchange's list of
// OTC lines that have traded (/otcmarkets/trade_results_search/) are kept.
// Bond lines (no share type) and a line whose code is not an Uzbek share
// ISIN stay out. A broker turns this on when its own pages say it sells
// shares outside the listing.
//
//   https://uzse.uz/otcmarkets/isu_elsis/
//   https://uzse.uz/otcmarkets/isu_elsis                (JSON)
//   https://uzse.uz/otcmarkets/trade_results_search/
//
// Call:
//   import { uzseListings, UZSE } from "../freedomuzbekista/uzseBook.mjs";
//   const { rows, leftOut, listed, otc } = await uzseListings({ otc: true });
// rows are in the house row shape (query, ticker, name, exchange, mic,
// currency, type, isin, raw), not yet stamped (stampRows) or written.
// A run makes about 50 gentle calls and takes three to four minutes.
//
// An issuer of the National Investment Fund kind (UZNF, "Milliy
// investitsiya jamg'armasi", Daromad Plus) is a joint-stock company whose
// shares trade like any other, so it is a STOCK, not a FUND.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SITE = "https://uzse.uz";
export const UZSE = { exchange: "Tashkent Republican Stock Exchange", mic: "XSTE" };
const NOTICE_DAYS = 730;
const KEPT_CATEGORIES = { A: "Premium", C: "Standard", P: "Transit", D: "Privatizatsiya" };

// The code the Central Securities Depository gives each line, as the
// exchange prints it. The preferred lines' codes (UZ700156K011, AGBAP)
// carry a K and no ISO 6166 check digit; they are the only codes these
// lines have, at the exchange and at the depository, so they are kept.
const isUzCode = (value) => /^UZ7[0-9A-Z]{8}[0-9]$/.test(value);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) =>
  String(value ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
// "<Agrobank> aksiyadorlik tijorat banki" -> "Agrobank aksiyadorlik tijorat banki"
const issuerName = (value) => clean(value).replace(/[<>«»"]/g, "").replace(/\s+/g, " ").trim();

async function get(path, kind = "text") {
  const url = path.startsWith("http") ? path : `${SITE}${path}`;
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await sleep(attempt ? 2000 * attempt : 800);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: kind === "json" ? "application/json" : "*/*", "Accept-Language": "ru" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      if (kind === "json") return await response.json();
      if (kind === "buffer") return Buffer.from(await response.arrayBuffer());
      return await response.text();
    } catch (error) {
      last = `${url}: ${error.message}`;
    }
  }
  throw new Error(last);
}

// dd.mm.yyyy of a date, in Tashkent.
function uzDay(date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Tashkent", day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type).value;
  return `${pick("day")}.${pick("month")}.${pick("year")}`;
}
const dayValue = (text) => {
  const [d, m, y] = text.split(".").map(Number);
  return Date.UTC(y, m - 1, d);
};

// The quotation list: ISIN of the issuer's ordinary share -> category code.
async function quotationList() {
  const page = await get("/isu_infos");
  const match = page.match(/var DATA = (\[[\s\S]*?\]);\s*\n/);
  if (!match) throw new Error("UZSE quotation list: no DATA on /isu_infos");
  const list = JSON.parse(match[1]);
  if (list.length < 60) throw new Error(`UZSE quotation list has ${list.length} lines`);
  return list;
}

// Reads the first sheet of an .xlsx with inline strings (the exchange's
// exports), with the system unzip, as other scrapers of this repo do.
async function xlsxRows(buffer) {
  const { execFile } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "uzse-"));
  const file = path.join(dir, "book.xlsx");
  fs.writeFileSync(file, buffer);
  try {
    const xml = await new Promise((resolve, reject) =>
      execFile("unzip", ["-p", file, "xl/worksheets/sheet1.xml"], { maxBuffer: 50_000_000, encoding: "utf8" }, (error, stdout) =>
        error ? reject(error) : resolve(stdout),
      ),
    );
    return [...xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((row) =>
      [...row[1].matchAll(/<c r="([A-Z]+)\d+"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)].map((cell) =>
        clean((cell[2] || "").replace(/<[^>]+>/g, "")),
      ),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ISINs with an order in the order list of the last trading day.
async function quotedToday() {
  const now = Date.now();
  for (let back = 0; back < 10; back += 1) {
    const day = uzDay(new Date(now - back * 86_400_000));
    const rows = await xlsxRows(await get(`/asking_prices.xlsx?ord_dd=${day}&mkt_id=STK&isu_cd=`, "buffer"));
    if (rows.length && rows[0][0] !== "Рынок") throw new Error(`UZSE order list ${day}: header ${rows[0].join("|")}`);
    const codes = new Set(rows.slice(1).filter((row) => row[0] === "STK").map((row) => row[2]));
    if (codes.size >= 40) return { day, codes };
  }
  throw new Error("UZSE order list: no trading day with orders in the last ten days");
}

// The last trade date the exchange prints on a line's page, "" if none.
async function lastTrade(isin) {
  const page = await get(`/isu_infos/STK?isu_cd=${isin}`);
  if (!page.includes(`class="isin">${isin}<`)) throw new Error(`UZSE page of ${isin} does not show it`);
  const match = page.match(/Дата последней сделки<\/span><b>([^<]*)</);
  return clean(match?.[1]);
}

// Suspension and resumption notices: ISIN -> { state, day, title }.
async function suspensions() {
  const cutoff = Date.now() - NOTICE_DAYS * 86_400_000;
  const notices = [];
  for (let pageNo = 1; pageNo <= 40; pageNo += 1) {
    const page = await get(`/boards/notice/list?page=${pageNo}`);
    const items = [...page.matchAll(/<div class="board-title">\s*<a href="\/boards\/(\d+)">\s*<span class="board-title-text">([\s\S]*?)<\/span>\s*<span class="board-date">\s*([\d.]+)\s*<\/span>/g)].map(
      (m) => ({ id: m[1], title: clean(m[2]), day: m[3] }),
    );
    if (!items.length) throw new Error(`UZSE notice board page ${pageNo}: no notice`);
    notices.push(...items);
    if (items.every((item) => dayValue(item.day) < cutoff)) break;
  }
  const relevant = notices.filter((n) => dayValue(n.day) >= cutoff && /ПРИОСТАНОВ|ВОЗОБНОВ/i.test(n.title));
  const state = new Map();
  // Oldest first, so the latest notice on a line wins.
  relevant.sort((a, b) => dayValue(a.day) - dayValue(b.day) || Number(a.id) - Number(b.id));
  for (const notice of relevant) {
    const page = await get(`/boards/${notice.id}`);
    const body = page.match(/<div class="board-content">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const isins = [...new Set(clean(body.replace(/<[^>]+>/g, " ")).match(/\bUZ[0-9A-Z]{10}\b/g) || [])];
    if (!isins.length) continue;
    const resumed = /ВОЗОБНОВ/i.test(notice.title);
    for (const isin of isins) state.set(isin, { suspended: !resumed, day: notice.day, title: notice.title });
  }
  return { state, read: relevant.length };
}

function row({ ticker, name, isin, preferred, note }) {
  return {
    query: ticker,
    ticker,
    name: preferred ? `${name} (preferred)` : name,
    exchange: UZSE.exchange,
    mic: UZSE.mic,
    currency: "UZS",
    type: "STOCK",
    isin,
    raw: [ticker, name, UZSE.exchange, "UZS", isin, preferred ? "preferred share" : "ordinary share", note].filter(Boolean).join(" "),
  };
}

export async function uzseListings({ otc = false } = {}) {
  const leftOut = [];
  const listing = await quotationList();
  const market = await get("/isu_infos/names?mkt_id=STK", "json");
  if (!Array.isArray(market) || market.length < 60) throw new Error(`UZSE share market: ${market?.length ?? 0} lines`);
  const { state: notices, read } = await suspensions();
  const { day: orderDay, codes: quoted } = await quotedToday();

  // Category of each issuer, by the ISIN of its ordinary share. A
  // preferred line is the ordinary ticker plus P (AGBA, AGBAP) under the
  // same issuer; its code is not in the quotation list.
  const categoryByIsin = new Map(listing.map((item) => [clean(item.isin), item.cat]));
  const byTicker = new Map(market.map(([isin, ticker, name]) => [clean(ticker).toUpperCase(), { isin: clean(isin).toUpperCase(), name: issuerName(name) }]));
  const ordinaryOf = (ticker, name) => {
    const base = ticker.endsWith("P") ? byTicker.get(ticker.slice(0, -1)) : null;
    return base && base.name === name && categoryByIsin.has(base.isin) ? base.isin : "";
  };

  const rows = [];
  const seen = new Set();
  for (const [rawIsin, rawTicker, rawName] of market) {
    const isin = clean(rawIsin).toUpperCase();
    const ticker = clean(rawTicker).toUpperCase();
    const name = issuerName(rawName);
    if (!/^UZ7/.test(isin)) {
      leftOut.push(`${ticker} ${isin} not a share`);
      continue;
    }
    if (!isUzCode(isin)) throw new Error(`UZSE ${ticker}: ISIN ${isin}`);
    const ordinary = categoryByIsin.has(isin) ? isin : ordinaryOf(ticker, name);
    const preferred = ordinary !== isin;
    const category = categoryByIsin.get(ordinary);
    if (!category) throw new Error(`UZSE ${ticker} ${isin}: issuer not in the quotation list`);
    if (!KEPT_CATEGORIES[category]) {
      leftOut.push(`${ticker} issuer listed for its bonds only`);
      continue;
    }
    const notice = notices.get(isin);
    // A share line with orders on the last trading day, or traded after
    // its suspension notice, trades again: not every resumption gets a
    // notice (UZNF, paused 22.04.2026 before its IPO, trades daily).
    const last = quoted.has(isin) ? orderDay : await lastTrade(isin);
    if (notice?.suspended && (!last || dayValue(last) <= dayValue(notice.day))) {
      leftOut.push(`${ticker} suspended (${notice.day})`);
      continue;
    }
    if (!last) {
      leftOut.push(`${ticker} never traded`);
      continue;
    }
    if (seen.has(isin)) throw new Error(`UZSE ${isin} twice`);
    seen.add(isin);
    rows.push(row({ ticker, name, isin, preferred, note: `quotation list ${KEPT_CATEGORIES[category]}` }));
  }
  if (rows.length < 80) throw new Error(`UZSE share market gave ${rows.length} lines`);
  for (const isin of ["UZ7043200003", "UZ7037560008", "UZ7000550002", "UZ700055K015"]) {
    if (!rows.some((r) => r.isin === isin)) throw new Error(`UZSE ${isin} is missing`);
  }
  const listed = rows.length;

  if (otc) {
    const board = await get("/otcmarkets/isu_elsis", "json");
    const lines = Array.isArray(board) ? board : Object.values(board || {});
    const traded = new Set((await get("/otcmarkets/trade_results_search/", "json")).map((item) => clean(item[0])));
    if (lines.length < 300 || traded.size < 200) throw new Error(`UZSE OTC board: ${lines.length} lines, ${traded.size} traded`);
    for (const item of lines) {
      const isin = clean(item.STK_CD).toUpperCase();
      const ticker = clean(item.STK_ABBR_CD).toUpperCase();
      if (item.ODSTK_PRSTK_TP !== "0" && item.ODSTK_PRSTK_TP !== "1") {
        leftOut.push(`OTC ${ticker} not a share`);
        continue;
      }
      if (!isUzCode(isin)) {
        leftOut.push(`OTC ${ticker} code ${isin} is not an Uzbek share ISIN`);
        continue;
      }
      if (seen.has(isin)) continue;
      const notice = notices.get(isin);
      if (notice?.suspended) {
        leftOut.push(`OTC ${ticker} suspended (${notice.day})`);
        continue;
      }
      if (!traded.has(isin)) {
        leftOut.push(`OTC ${ticker} never traded`);
        continue;
      }
      seen.add(isin);
      rows.push(row({ ticker, name: issuerName(item.STK_NM), isin, preferred: item.ODSTK_PRSTK_TP === "1", note: "off-exchange board (ВТП)" }));
    }
  }
  return { rows, leftOut, listed, otc: rows.length - listed, orderDay, noticesRead: read };
}
