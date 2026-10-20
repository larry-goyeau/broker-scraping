// Shared reading for the Argentine brokers whose own board names BYMA
// symbols but not their currency, type or ISIN (Comafi Bursátil, GIO
// Bursátil). Each scraper reads its broker's list of symbols; this file
// joins them to BYMA's own open data, as brokers/balanzar does:
//
// - BYMA's market data for the leader, general and CEDEAR panels names
//   every symbol quoted today and the currency of its line (ARS is pesos,
//   USD the MEP dollar, EXT the cable dollar; both dollar lines are USD).
//   A symbol the broker lists that BYMA no longer quotes (a cancelled
//   programme, a delisted company left in the broker's table) is not
//   written. A cable line (EXT, or a C line BYMA mislabels USD next to
//   its D line) is written only for a broker that lets clients hold
//   dollars abroad (bymaRows option cable; each scraper cites its
//   broker's own terms).
// - A line on the panels with no market today (no trade, bid, offer or
//   previous close on BYMA, no price on the broker's board) is looked up
//   in BYMA's daily history (chart/historical-series, about two years
//   deep): with no trade in that time it is listed but never quoted, and
//   is not written. One that only did not trade today stays.
// - BYMA's species card gives the kind (Acciones, Cedears), the ISIN (the
//   peso, MEP and cable lines of one certificate share it), the issuer of
//   a local share, the company of a CEDEAR and its symbol on its home
//   market. A kind that is not a share, a CEDEAR or an ADR (a warrant, a
//   fund, a right) is not written. BYMA lists closed-end funds (FCIC:
//   ALAAF, MELIF, the REIT fund) and their dollar lines on the general
//   panel with no card; a symbol with no card is kept only when BYMA's
//   search box or assets/stocks.csv names it and the name is not a fund,
//   or when it is the dollar line of a share that has one (RAGHC).
// - A block line is the same certificate with B on the end (GGALB, AAPDB,
//   GOGLB, GE..B) and a 150-unit minimum. A symbol ending in B is a block
//   when its stem is quoted with the same ISIN, or when another peso line
//   of the list that does not end in B shares its ISIN (GOOGL for GOGLB;
//   the dollar lines ALAC and ALAD do not make ALAB a block). Blocks are
//   not written.
// - A CEDEAR is an ETF when its home symbol is an American ETF in
//   ../../assets/etfs.csv or its name says so; ETN or ETC when the name
//   says so. A local share is a STOCK.
// Every row is BYMA (BCBA, XBUE) in the line's currency, its ticker the
// BYMA symbol.
//
//   https://open.bymadata.com.ar/ (get-market-data, fichatecnica/especies/general,
//   instruments-for-header-search, chart/historical-series/history)

import fs from "node:fs";

export const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const MARKET = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/get-market-data";
const SPECIES = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/bnown/fichatecnica/especies/general";
const SEARCH = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/instruments-for-header-search";
const HISTORY = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/chart/historical-series/history";
const PANELS = [
  ["btnLideres", "local"],
  ["btnGeneral", "local"],
  ["btnCedears", "cedear"],
];
const CASH = { ARS: "ARS", USD: "USD", EXT: "USD" };
const US_BOARDS = new Set(["AMEX", "NASDAQ", "NYSE", "CBOE", "ARCA", "NYSEARCA", "BATS"]);
const KINDS = /^(acciones|cedears|adrs?|a\.d\.r\.s.*)$/i;
const ASIDE = /\b(warrants?|fondo com[uú]n|fci|derechos?(?:\s+de\s+suscripci[oó]n)?|subscription rights?)\b/i;
// A closed-end fund (FCIC, F.C.I. … cerrado, the REIT fund) in a name.
const FUND = /\bF\.?\s?C\.?\s?I\b|\bFCIC?\b|fondo com[uú]n|\bcerrado\b/i;

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function isinOf(value) {
  const text = clean(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

export async function getText(url, headers = {}) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html,application/json,*/*", ...headers },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return await response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.cause?.code || error.message || error} ${url}`;
    }
    await pause(1500 * (attempt + 1));
  }
  throw new Error(last);
}

async function post(url, body) {
  let last = "";
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA, Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(40_000),
      });
      if (response.ok) return await response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await pause(2000 * (attempt + 1));
  }
  throw new Error(last);
}

async function pool(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, run));
  return out;
}

// Symbol -> { currency, panel, cable, live } for every line on BYMA's
// panels today. A symbol comes once per settlement term (CI, 24hs).
// live: a trade, a bid, an offer or a previous close on any term today.
// cable: the line settles in dollars abroad (contado con liquidación):
// BYMA prices it EXT, or it is the C line of a pair whose D line is
// dollars (BYMA labels TGN4C, CEPUC and SAPC USD although they are the
// cable lines next to TGN4D, CEPUD and SAPD). ELPC is BYMA's other slip:
// it is Copel's peso line (its own ELPCC and ELPCD lines are listed next
// to it) yet BYMA prices it EXT; an EXT symbol with its own C and D lines
// is a peso line.
export async function bymaBoard() {
  const board = new Map();
  for (const [flag, panel] of PANELS) {
    const payload = await post(MARKET, { excludeZeroPxAndQty: false, T0: true, T1: true, T2: true, page_number: 1, page_size: 5000, [flag]: true });
    const lines = payload.data || payload;
    if (!Array.isArray(lines) || !lines.length) throw new Error(`BYMA ${flag} was empty`);
    for (const line of lines) {
      const symbol = clean(line.symbol).toUpperCase();
      const currency = CASH[line.denominationCcy];
      if (!symbol) throw new Error(`BYMA ${flag} had a line with no symbol`);
      if (!currency) throw new Error(`BYMA ${symbol} was priced in ${line.denominationCcy}`);
      const live = [line.trade, line.bidPrice, line.offerPrice, line.previousClosingPrice, line.closingPrice].some((value) => Number(value) > 0);
      const prev = board.get(symbol);
      if (prev && (prev.currency !== currency || prev.panel !== panel)) {
        throw new Error(`BYMA ${symbol} was ${prev.panel} ${prev.currency} and ${panel} ${currency}`);
      }
      if (prev) prev.live ||= live;
      else board.set(symbol, { currency, panel, denomination: line.denominationCcy, live });
    }
    await pause(300);
  }
  if (board.size < 1200) throw new Error(`BYMA quoted only ${board.size} symbols`);
  for (const [symbol, line] of board) {
    if (line.denomination === "EXT" && board.get(`${symbol}C`)?.denomination === "EXT" && board.get(`${symbol}D`)?.currency === "USD") {
      line.currency = "ARS";
      line.denomination = "ARS";
    }
  }
  for (const [symbol, line] of board) {
    const stem = symbol.slice(0, -1);
    line.cable =
      line.denomination === "EXT" ||
      (symbol.endsWith("C") && line.currency === "USD" && board.get(`${stem}D`)?.currency === "USD");
  }
  return board;
}

// Days with a trade (volume above zero) on BYMA's daily history of a
// symbol over about two years (the depth BYMA serves), on either term.
// The series carries the last close forward on days with no trade, so a
// close alone is not a trade. BYMA sometimes answers with an empty body:
// that is retried, and null is returned when no answer comes.
export async function tradedDays(symbol) {
  const to = Math.floor(Date.now() / 1000);
  let days = 0;
  for (const term of ["24HS", "CI"]) {
    const url = `${HISTORY}?symbol=${encodeURIComponent(`${symbol} ${term}`)}&resolution=D&from=${to - 800 * 86400}&to=${to}`;
    let series = null;
    for (let attempt = 0; attempt < 4 && !series; attempt += 1) {
      try {
        const parsed = JSON.parse(await getText(url));
        if (parsed && typeof parsed.s === "string") series = parsed;
      } catch {
        // empty or broken answer: try again
      }
      await pause(series ? 250 : 1500 * (attempt + 1));
    }
    if (!series) return null;
    const volume = series.v || [];
    days += (series.t || []).filter((_, index) => Number(volume[index]) > 0).length;
  }
  return days;
}

async function speciesCard(symbol) {
  const payload = await post(SPECIES, { symbol });
  const card = (payload.data || [])[0];
  if (!card) return null;
  return {
    kind: clean(card.tipoEspecie),
    isin: isinOf(card.codigoIsin),
    home: clean(card.simboloMercado).toUpperCase(),
    homeBoard: clean(card.mercadoOrigen).toUpperCase(),
    issuer: clean(card.emisor),
    title: clean(card.denominacion),
  };
}

function usEtfs() {
  const set = new Set();
  const text = fs.readFileSync(new URL("../../assets/etfs.csv", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/).slice(1)) {
    const [ticker, exchange] = line.split(",");
    if (!US_BOARDS.has(String(exchange || "").toUpperCase())) continue;
    const symbol = String(ticker || "").split(":").pop().toUpperCase();
    if (symbol) set.add(symbol);
  }
  if (set.size < 2000) throw new Error("assets/etfs.csv had few American ETFs");
  return set;
}

// The ISIN and name assets/stocks.csv holds for a Buenos Aires symbol, for
// a symbol the species card does not know.
function listedBook() {
  const book = new Map();
  const text = fs.readFileSync(new URL("../../assets/stocks.csv", import.meta.url), "utf8");
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("BCBA:")) continue;
    const [ticker, , isin, ...name] = line.split(",");
    let symbol = ticker.slice(5).toUpperCase();
    if (symbol.endsWith(".CI")) symbol = symbol.slice(0, -3);
    const code = isinOf(isin);
    if (!symbol || !code) continue;
    const prev = book.get(symbol);
    if (prev === undefined) book.set(symbol, { isin: code, name: clean(name.join(",").replace(/^"|"$/g, "")) });
    else if (prev.isin !== code) book.set(symbol, { isin: "", name: "" });
  }
  return book;
}

// BYMA's own search box: the description of a symbol the species card
// does not know (often only the symbol again).
async function searchName(symbol) {
  const found = await post(SEARCH, { value: symbol });
  const hit = (Array.isArray(found) ? found : []).find((item) => clean(item.symbol).toUpperCase() === symbol);
  const text = clean(hit?.description);
  return text.toUpperCase() === symbol ? "" : text;
}

function namedType(name) {
  if (/\bETNs?\b|exchange[- ]traded notes?|\bIPATH\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name) && !/\bETFs?\b/i.test(name)) return "ETC";
  if (
    /\bETFs?\b|exchange[- ]traded funds?/i.test(name) ||
    /\b(SPDR|ISHARES|PROSHARES|DIREXION|GLOBAL X|VANGUARD|VANECK|VAN ECK|SELECT SECTOR|FIRST TRUST|INVESCO QQQ)\b/i.test(name)
  ) {
    return "ETF";
  }
  return "";
}

// entries: [{ symbol, raw, live }] in the broker's own order; live is
// true when the broker's own board shows a price for the line today.
// options.cable: the broker lets its clients trade the cable lines; when
// false they are left out. Returns the rows and the lines left out, with
// the reason.
//
// A line with no market today, neither on BYMA (no trade, bid, offer or
// previous close on any term) nor on the broker's board, is kept only
// when BYMA's daily history shows a trade on it in the last two years; a
// line BYMA lists but never quoted in that time (AEMC, BBA3C, ISRGD) is
// not written. A listed line that only did not trade today is kept.
export async function bymaRows(entries, label, options = {}) {
  const board = await bymaBoard();
  const dropped = [];
  const wanted = [];
  const seen = new Set();
  for (const entry of entries) {
    const symbol = clean(entry.symbol).toUpperCase();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    if (!board.has(symbol)) {
      dropped.push(`${symbol} not quoted on BYMA`);
      continue;
    }
    const line = board.get(symbol);
    if (line.cable && !options.cable) {
      dropped.push(`${symbol} cable line`);
      continue;
    }
    wanted.push({ ...entry, symbol, ...line, live: line.live || Boolean(entry.live) });
  }

  // Cards for the listed symbols and for the stems of those ending in B.
  const lookups = new Set(wanted.map((entry) => entry.symbol));
  for (const entry of wanted) {
    const stem = entry.symbol.replace(/B$/, "").replace(/\.+$/, "");
    if (entry.symbol.endsWith("B") && board.has(stem)) lookups.add(stem);
  }
  const list = [...lookups].sort();
  let looked = 0;
  const cards = new Map(
    await pool(list, 6, async (symbol) => {
      looked += 1;
      if (looked % 250 === 0) console.error(`${label} species cards ${looked}/${list.length}`);
      try {
        return [symbol, await speciesCard(symbol)];
      } catch (error) {
        console.error(`${symbol} species card failed: ${error.message || error}`);
        return [symbol, null];
      }
    })
  );

  const byIsin = new Map();
  for (const [symbol, card] of cards) {
    if (!card?.isin) continue;
    if (!byIsin.has(card.isin)) byIsin.set(card.isin, []);
    byIsin.get(card.isin).push(symbol);
  }
  function isBlock(symbol) {
    if (!symbol.endsWith("B") || symbol.length < 2) return false;
    const isin = cards.get(symbol)?.isin;
    const stem = symbol.replace(/B$/, "").replace(/\.+$/, "");
    if (board.has(stem)) {
      const parent = cards.get(stem)?.isin;
      if (!isin || !parent || isin === parent) return true;
    }
    // Another peso line of the same certificate that is not itself a block
    // (GOOGL for GOGLB). Dollar lines do not count: ALAC and ALAD are the
    // dollar lines of ALAB, AKOBD of AKO.B.
    return (
      Boolean(isin) &&
      (byIsin.get(isin) || []).some((other) => other !== symbol && !other.endsWith("B") && board.get(other)?.currency === "ARS")
    );
  }

  const etfs = usEtfs();
  const listed = listedBook();
  const blocks = new Set(wanted.filter((entry) => isBlock(entry.symbol)).map((entry) => entry.symbol));

  // A symbol with no species card is a share only when BYMA's search, or
  // assets/stocks.csv, names it and the name is not a closed-end fund
  // (INAG, the ADR ATGS), or when it is the dollar line (C, D) of a share
  // that has a card (RAGHC). The rest are closed-end funds (ALAAF, MELIF,
  // the REIT fund) and their dollar lines, which BYMA lists on the
  // general panel with no card, and are not written.
  const bare = wanted.filter((entry) => !cards.get(entry.symbol) && !blocks.has(entry.symbol)).map((entry) => entry.symbol);
  const described = new Map(
    await pool(bare, 3, async (symbol) => {
      try {
        return [symbol, await searchName(symbol)];
      } catch (error) {
        console.error(`${symbol} search failed: ${error.message || error}`);
        return [symbol, ""];
      }
    })
  );
  function bareVerdict(symbol) {
    const named = [described.get(symbol), listed.get(symbol)?.name].filter(Boolean);
    if (named.some((name) => FUND.test(name))) return { drop: "closed-end fund" };
    const stem = /[CD]$/.test(symbol) ? symbol.slice(0, -1) : "";
    if (stem && cards.get(stem) && !FUND.test(cards.get(stem).title)) return { parent: stem };
    if (named.length) return { name: named[0] };
    return { drop: "no species card and no name" };
  }

  const rows = [];
  for (const entry of wanted) {
    const { symbol, currency, panel } = entry;
    let card = cards.get(symbol);
    if (blocks.has(symbol)) {
      dropped.push(`${symbol} block`);
      continue;
    }
    if (!card) {
      const verdict = bareVerdict(symbol);
      if (verdict.drop) {
        dropped.push(`${symbol} ${verdict.drop}`);
        continue;
      }
      if (verdict.parent) card = cards.get(verdict.parent);
      else entry.name = entry.name || verdict.name;
    }
    if (card?.kind && !KINDS.test(card.kind)) {
      dropped.push(`${symbol} ${card.kind}`);
      continue;
    }
    if (ASIDE.test(card?.title || "") || ASIDE.test(entry.name || "")) {
      dropped.push(`${symbol} ${card?.title || entry.name}`);
      continue;
    }
    const usHome = !card?.homeBoard || US_BOARDS.has(card.homeBoard.replace(/\s+/g, "")) || /^NYSE|^NASDAQ/.test(card.homeBoard);
    const home = (card?.home || "").replace("/", ".");
    let type = "STOCK";
    if (panel === "cedear") {
      type = namedType(card?.title || "") || namedType(entry.name || "") || (home && usHome && etfs.has(home) ? "ETF" : "STOCK");
    }
    const isin = card?.isin || listed.get(symbol)?.isin || "";
    const name = (panel === "cedear" ? card?.title : card?.issuer) || clean(entry.name) || symbol;
    rows.push({
      query: symbol,
      ticker: symbol,
      name,
      exchange: "BCBA",
      mic: "XBUE",
      currency,
      type,
      isin,
      raw: clean(entry.raw),
      panel,
    });
  }
  // A line with no market today, on BYMA or on the broker's board, is
  // written only when BYMA's history shows a trade on it.
  const live = new Map(wanted.map((entry) => [entry.symbol, entry.live]));
  const quiet = rows.filter((row) => !live.get(row.ticker)).map((row) => row.ticker);
  const history = new Map(await pool(quiet, 2, async (symbol) => [symbol, await tradedDays(symbol)]));
  const never = new Set(quiet.filter((symbol) => history.get(symbol) === 0));
  const unknown = quiet.filter((symbol) => history.get(symbol) === null);
  if (unknown.length) console.error(`${label}: BYMA history did not answer for ${unknown.join(" ")} (kept)`);
  console.error(`${label}: ${quiet.length} lines with no market today, ${never.size} never traded on BYMA in two years`);
  for (const symbol of never) dropped.push(`${symbol} never quoted on BYMA`);
  const kept = rows.filter((row) => !never.has(row.ticker));
  kept.sort((left, right) => left.ticker.localeCompare(right.ticker));
  return { rows: kept, dropped, board };
}

// Checks shared by both scrapers: a known share, a CEDEAR, an ETF CEDEAR
// and no block line.
export function expectLine(rows, ticker, currency, type, isin) {
  const found = rows.filter((row) => row.ticker === ticker);
  if (found.length !== 1) throw new Error(`${ticker} was ${found.length} lines`);
  if (found[0].currency !== currency) throw new Error(`${ticker} was ${found[0].currency}`);
  if (found[0].type !== type) throw new Error(`${ticker} was ${found[0].type}`);
  if (isin && found[0].isin !== isin) throw new Error(`${ticker} was ${found[0].isin || "blank"}`);
}

export function summary(label, rows, dropped) {
  const counts = new Map();
  for (const row of rows) {
    const key = `${row.panel} ${row.currency} ${row.type}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const reasons = new Map();
  for (const line of dropped) {
    const reason = line.replace(/^\S+\s/, "");
    const key = /^(block|not quoted on BYMA|cable line|never quoted on BYMA)$/.test(reason) ? reason : "other kind";
    reasons.set(key, (reasons.get(key) || 0) + 1);
  }
  console.error(
    `${label}: ${rows.length} listings (${[...counts].sort().map(([key, value]) => `${key} ${value}`).join(", ")}); ` +
      `${rows.filter((row) => row.isin).length} with an ISIN; left out ${[...reasons].map(([key, value]) => `${value} ${key}`).join(", ") || "none"}`
  );
  const other = dropped.filter((line) => !/ (block|not quoted on BYMA|cable line)$/.test(line));
  if (other.length) console.error(other.join("\n"));
}
