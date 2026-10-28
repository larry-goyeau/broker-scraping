// The whole of BYMA's share and CEDEAR board (Bolsas y Mercados Argentinos,
// BCBA / XBUE), shared by the scrapers of the brokers whose only place is
// BYMA and that publish no list of their own. It is the same reading as
// ../bancosantafe/bymaWhole.mjs (the Grupo Petersen banks), with three
// changes so that fifty scrapers can share it:
//
// - Cable lines (C, contado con liquidación: dollars settled abroad) are
//   read and flagged, not dropped. Each scraper chooses with the option
//   cable, from its own broker's terms (a fee line for CCL / cable, or a
//   page that lets clients hold dollars abroad). By default they are left
//   out, as in bymaWhole.mjs. A USD line ending in C whose peso stem is the
//   same certificate but which has no D line next to it (EC, next to Eni's
//   E) is a cable line too.
// - On a day BYMA does not trade (a weekend or a holiday: every line of the
//   panels shows zero volume, and market-open answers false) there is no
//   "traded today" to spare a line the history lookup, so every line is
//   looked up in BYMA's daily history. bymaWhole.mjs stops on such a day.
// - The result is kept in byma-book.json next to this file and served from
//   there while it is under MAX_AGE_DAYS old, so the scrapers do not each
//   ask BYMA for some 1,500 species cards and as many histories.
//
// What is read, all from BYMA's own open data (no login):
// - Every symbol on the leader, general and CEDEAR panels (get-market-data),
//   through ../comafi/byma.mjs, which gives each line its currency (ARS, or
//   USD for the MEP and cable dollar lines), its type (a local share is a
//   STOCK; a CEDEAR is an ETF when its home symbol is an American ETF in
//   assets/etfs.csv or its name says so) and its ISIN from BYMA's species
//   card (fichatecnica/especies/general; assets/stocks.csv when the card has
//   none). Left out there: block lines (GGALB), closed-end funds (ALAAF,
//   MELIF, REIT), kinds that are not a share, a CEDEAR or an ADR (rights,
//   warrants, funds), the older of two lines of one certificate (SCOOD next
//   to SCCOD), and lines BYMA shows no trade on in two years.
// - A CEDEAR of a bond (a maturity date or a coupon in its name: DJNJ3) is
//   not a share and is not returned (../acuantoesta/bymaActivity.mjs).
// - Suspended, delisted and dormant lines: BYMA publishes no suspension
//   list in its open data (no such endpoint, and the species card carries
//   no status), and a delisted line leaves the panels. So a line is kept
//   only when it trades: every line with no trade today is looked up in
//   BYMA's daily history (chart/historical-series, 24HS term, about 800
//   days) and left out with no trade in two years, a last trade more than
//   180 days old, or under 5 trade days and none in the last 30
//   (bymaActivity.mjs). A price on a panel is not a market: BYMA carries
//   stub bids and frozen previous closes on lines that have not traded for
//   years.
//
// Bonds, letras, ONs, options and cauciones are other products and are not
// on these panels' share and CEDEAR kinds.
//
//   https://open.bymadata.com.ar/
//
// Use, from a scraper:
//   import { bymaBook } from "../bancogalicia/bymaBook.mjs";
//   const { rows } = await bymaBook("Banco Galicia", { cable: false });
// rows are in the house shape (query, ticker, name, exchange BCBA, mic XBUE,
// currency, type, isin, raw); scrapers pass them through stampRows and
// withoutObligations as the other BYMA scrapers do. Options: cable (keep
// the cable C lines, default false), fresh (ignore byma-book.json and read
// BYMA again, default false).
//
//   node brokers/bancogalicia/bymaBook.mjs          (rebuilds byma-book.json)

import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { bymaBoard, bymaRows, expectLine, getText, pause, summary, UA } from "../comafi/byma.mjs";
import { isBondCedear, withoutDormant } from "../acuantoesta/bymaActivity.mjs";

const MARKET = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/get-market-data";
const MARKET_OPEN = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/market-open";
const PANELS = ["btnLideres", "btnGeneral", "btnCedears"];
const BOOK = new URL("byma-book.json", import.meta.url);
const MAX_AGE_DAYS = 3;

// Symbols with a trade today on any settlement term of BYMA's panels. An
// empty set on a day BYMA does not trade; a short one on a trading day
// stops the run (a partial answer).
async function tradedToday() {
  const traded = new Set();
  let lines = 0;
  for (const flag of PANELS) {
    let data = null;
    let last = "";
    for (let attempt = 0; attempt < 5 && !data; attempt += 1) {
      try {
        const response = await fetch(MARKET, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": UA, Accept: "application/json" },
          body: JSON.stringify({ excludeZeroPxAndQty: false, T0: true, T1: true, T2: true, page_number: 1, page_size: 5000, [flag]: true }),
          signal: AbortSignal.timeout(40_000),
        });
        if (response.ok) {
          const payload = await response.json();
          const list = payload.data || payload;
          if (Array.isArray(list) && list.length) data = list;
          else last = `BYMA ${flag} was empty`;
        } else {
          last = `${response.status} ${MARKET}`;
        }
      } catch (error) {
        last = String(error.message || error);
      }
      if (!data) await pause(2000 * (attempt + 1));
    }
    if (!data) throw new Error(last);
    lines += data.length;
    for (const line of data) {
      if (Number(line.volume) > 0 || Number(line.tradeVolume) > 0 || Number(line.volumeAmount) > 0) traded.add(String(line.symbol || "").trim().toUpperCase());
    }
    await pause(300);
  }
  if (traded.size === 0) {
    const open = (await getText(MARKET_OPEN)).trim();
    if (open !== "false") throw new Error(`no BYMA line traded today among ${lines}, yet market-open answered ${open}`);
    return { traded, closed: true };
  }
  if (traded.size < 300) throw new Error(`only ${traded.size} BYMA lines traded today`);
  return { traded, closed: false };
}

// Reads BYMA. Rows carry a cable field (true for a cable C line).
async function build(label) {
  const board = await bymaBoard();
  const entries = [...board.entries()].map(([symbol, line]) => ({
    symbol,
    raw: ["BYMA", line.panel === "cedear" ? "CEDEARs" : "acciones", symbol, line.denomination].join(" | "),
  }));
  const read = await bymaRows(entries, label, { cable: true });
  const dropped = [...read.dropped];

  const byTicker = new Map(read.rows.map((row) => [row.ticker, row]));
  const isCable = (row) => {
    if (read.board.get(row.ticker)?.cable) return true;
    if (!row.ticker.endsWith("C") || row.currency !== "USD" || !row.isin) return false;
    const stem = byTicker.get(row.ticker.slice(0, -1));
    return stem?.currency === "ARS" && stem.isin === row.isin && !read.board.has(`${row.ticker.slice(0, -1)}D`);
  };
  const bonds = new Set(read.rows.filter(isBondCedear).map((row) => row.ticker));
  for (const ticker of bonds) dropped.push(`${ticker} CEDEAR of a bond: ${byTicker.get(ticker).name}`);

  const { traded, closed } = await tradedToday();
  if (closed) console.error(`${label}: BYMA does not trade today; every line is looked up in its history`);
  const active = await withoutDormant(
    read.rows.filter((row) => !bonds.has(row.ticker)),
    traded,
    label
  );
  dropped.push(...active.dropped);
  const rows = active.rows.map((row) => ({ ...row, cable: isCable(row) }));
  console.error(
    `${label}: ${board.size} symbols on BYMA's panels, ${traded.size} traded today, ${active.checked} others checked on BYMA's history; left out ` +
      `${active.counts.never} with no trade in two years, ${active.counts.stale} last traded over 180 days ago, ` +
      `${active.counts.few} with under 5 trade days and none in 30, ${bonds.size} bond CEDEARs`
  );

  const local = rows.filter((row) => !row.cable);
  expectLine(local, "GGAL", "ARS", "STOCK", "ARP495251018");
  expectLine(local, "GGALD", "USD", "STOCK", "ARP495251018");
  expectLine(local, "YPFD", "ARS", "STOCK", "ARP9897X1319");
  expectLine(local, "AAPL", "ARS", "STOCK", "ARDEUT116183");
  expectLine(local, "AAPLD", "USD", "STOCK", "ARDEUT116183");
  expectLine(local, "SPY", "ARS", "ETF", "ARCAVA460131");
  expectLine(rows.filter((row) => row.cable), "AAPLC", "USD", "STOCK", "ARDEUT116183");
  for (const left of ["GGALB", "AAPLB", "REIT"]) {
    if (rows.some((row) => row.ticker === left)) throw new Error(`${left} was kept`);
  }
  if (local.filter((row) => row.panel === "local").length < 90) throw new Error("Buenos Aires shares were short");
  if (local.filter((row) => row.panel === "cedear").length < 600) throw new Error("CEDEARs were short");
  if (local.filter((row) => row.panel === "cedear" && row.type === "ETF").length < 100) throw new Error("CEDEAR ETFs were short");

  summary(label, rows, dropped);
  return { built: new Date().toISOString(), rows: rows.map(({ panel, ...row }) => row), dropped };
}

function cached() {
  try {
    const book = JSON.parse(fs.readFileSync(BOOK, "utf8"));
    const age = Date.now() - Date.parse(book.built);
    if (Array.isArray(book.rows) && book.rows.length > 1000 && age >= 0 && age < MAX_AGE_DAYS * 86_400_000) return book;
  } catch {
    // no book yet, or a broken one: read BYMA
  }
  return null;
}

// Rows of BYMA's whole share and CEDEAR board, and the lines left out.
// options.cable: keep the cable (C) lines. options.fresh: read BYMA again.
export async function bymaBook(label, options = {}) {
  let book = options.fresh ? null : cached();
  if (book) {
    console.error(`${label}: BYMA board from byma-book.json, read ${book.built.slice(0, 10)}`);
  } else {
    book = await build(label);
    fs.writeFileSync(BOOK, JSON.stringify(book, null, 1));
  }
  const dropped = [...book.dropped];
  const rows = [];
  for (const { cable, ...row } of book.rows) {
    if (cable && !options.cable) dropped.push(`${row.ticker} cable line`);
    else rows.push(row);
  }
  return { rows, dropped };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const { rows } = await bymaBook("BYMA", { cable: true, fresh: true });
  const counts = {};
  for (const row of rows) counts[`${row.type} ${row.currency}`] = (counts[`${row.type} ${row.currency}`] || 0) + 1;
  console.error(`BYMA: ${rows.length} rows with cable lines (${Object.entries(counts).map(([key, n]) => `${key} ${n}`).join(", ")})`);
}
