// What InvertirOnline sells in shares and exchange-traded funds, with no login.
// The quote boards are the book. Each board's table is the whole panel.
// Bonds, options, funds, cauciones and currencies stay out.
//
// Argentina is Buenos Aires, which IOL writes BCBA. A local share and a
// CEDEAR are that book. The peso line is the bare ticker. The dollar line
// is the same ticker with C (cable) or D (MEP) on the end, or that ticker
// with one character changed when the letters would otherwise collide.
// The peso price is the dollar price times the peso-per-dollar rate, so a
// last letter C or D stays the peso line when no such sibling exists
// (AMD, BA.C, YPFD). A CEDEAR is not the American book of the same name.
//
// The American panels do not name a board. A share, an ETF and an ADR are
// the national quote, so the place is US and the currency is dollars. The
// country on an ADR panel is the company's country. IOL prints no ISIN, so
// on a US line the code is the one the other catalogues already agree on
// for that ticker. A CEDEAR keeps no American ISIN.
//
//   https://iol.invertironline.com/mercado/cotizaciones
//
//   node brokers/iol/iol_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { stampIsinMatches } from "../../isinMatches.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { catalogueFiles } from "../../catalogues.mjs";
import { resolveVenue } from "../../spreads/venues.mjs";
import fs from "node:fs";
import path from "node:path";

const ORIGIN = "https://iol.invertironline.com";
const QUOTES = `${ORIGIN}/mercado/cotizaciones`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const US_MICS = ["XNAS", "ARCX", "XNYS", "XASE", "BATS"];
// Pesos per dollar on the two Buenos Aires dollar books. Cable sits above MEP.
const PESO_PER_DOLLAR = [800, 4000];

const BOOKS = [
  { country: "Argentina", instrument: "Acciones", path: "/mercado/cotizaciones/argentina/Acciones", exchange: "BCBA" },
  { country: "Argentina", instrument: "Cedears", path: "/mercado/cotizaciones/argentina/Cedears", exchange: "BCBA" },
  { country: "Estados Unidos", instrument: "Acciones", path: "/mercado/cotizaciones/Estados-Unidos", exchange: "US" },
  { country: "Estados Unidos", instrument: "ADRs", path: "/mercado/cotizaciones/estados-unidos/ADRs", exchange: "US" },
  { country: "Estados Unidos", instrument: "Etfs", path: "/mercado/cotizaciones/estados-unidos/Etfs", exchange: "US" },
];

async function textOf(url, body) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        headers: {
          "User-Agent": UA,
          Accept: "text/html",
          ...(body
            ? { "Content-Type": "application/x-www-form-urlencoded", Referer: QUOTES }
            : {}),
        },
        body,
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function decode(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isinOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function forms(ticker) {
  const text = String(ticker || "").trim().toUpperCase();
  const out = new Set([text]);
  if (text.includes(".")) out.add(text.replace(/\./g, "-"));
  if (text.includes("-")) out.add(text.replace(/-/g, "."));
  return [...out];
}

function namedType(name) {
  if (/\bETNs?\b/i.test(name) || /exchange-traded notes/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name) && !/\bETFs?\b/i.test(name)) return "ETC";
  if (/\bETFs?\b/i.test(name) || /exchange-traded funds/i.test(name)) return "ETF";
  return "";
}

function priceOf(order) {
  const text = String(order || "").trim();
  if (!text || text === "-") return null;
  const n = Number(text.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function panelsOf(html) {
  const assigned = html.match(/Cotizacion\.Data\.Panel = '([^']*)'/);
  if (!assigned) throw new Error("IOL page had no panels");
  const values = [...assigned[1].matchAll(/value="([^"]*)"/g)].map((hit) => decode(hit[1])).filter(Boolean);
  if (!values.length) throw new Error("IOL page had no panels");
  values.sort((left, right) => (left === "Todos" ? -1 : right === "Todos" ? 1 : 0));
  return values;
}

function rowsOf(html, label) {
  const rows = [];
  for (const part of html.split('data-symbol="').slice(1)) {
    const cut = part.indexOf('"');
    const ticker = decode(cut < 0 ? "" : part.slice(0, cut)).toUpperCase();
    if (!ticker) throw new Error(`IOL line had no ticker on ${label}`);
    const title = part.slice(0, 500).match(/title="([^"]*)"/);
    const price = part.slice(0, 900).match(/data-field="UltimoPrecio"\s+data-order="([^"]*)"/);
    rows.push({
      ticker,
      name: decode(title?.[1] || "") || ticker,
      price: priceOf(price?.[1]),
    });
  }
  if (!rows.length) throw new Error(`IOL panel was empty: ${label}`);
  return rows;
}

function commonPrefix(left, right) {
  let i = 0;
  while (i < left.length && i < right.length && left[i] === right[i]) i += 1;
  return i;
}

// The peso ticker this dollar line belongs to, or "" when the line is the peso book.
function pesoSibling(symbol, book) {
  const row = book.get(symbol);
  if (!row?.price || !/[CD]$/.test(symbol)) return "";
  const candidates = new Set([symbol.slice(0, -1)]);
  if (symbol.endsWith(".C") || symbol.endsWith(".D")) candidates.add(symbol.slice(0, -2));
  const stem = symbol.slice(0, -1);
  for (const other of book.keys()) {
    if (other === symbol) continue;
    const flat = other.replace(/\./g, "");
    if (flat + "C" === symbol || flat + "D" === symbol) candidates.add(other);
    if (other.length !== stem.length + 1) continue;
    for (let i = 0; i < other.length; i += 1) {
      if (other.slice(0, i) + other.slice(i + 1) === stem) candidates.add(other);
    }
  }
  let best = "";
  let bestScore = -1;
  for (const base of candidates) {
    if (!base || base === symbol || !book.has(base)) continue;
    const parent = book.get(base).price;
    if (!parent) continue;
    const ratio = parent / row.price;
    if (ratio < PESO_PER_DOLLAR[0] || ratio > PESO_PER_DOLLAR[1]) continue;
    const flat = base.replace(/\./g, "");
    const strict =
      symbol === `${base}C` ||
      symbol === `${base}D` ||
      symbol === `${base}.C` ||
      symbol === `${base}.D` ||
      symbol === `${flat}C` ||
      symbol === `${flat}D`;
    const score = (strict ? 100 : 0) + commonPrefix(symbol, flat);
    if (score > bestScore) {
      best = base;
      bestScore = score;
    }
  }
  return best;
}

function isinBook() {
  const book = new Map();
  for (const file of catalogueFiles()) {
    if (path.basename(path.dirname(file)) === "iol") continue;
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = Array.isArray(parsed) ? parsed : parsed.rows || [];
    for (const row of rows) {
      const isin = isinOf(row.isin);
      const ticker = String(row.ticker || "").trim().toUpperCase();
      if (!isin || !ticker) continue;
      const { venue } = resolveVenue(row);
      if (!venue || !US_MICS.includes(venue.mic)) continue;
      for (const key of forms(ticker)) {
        const id = `${venue.mic}|${key}`;
        if (!book.has(id)) book.set(id, new Set());
        book.get(id).add(isin);
      }
    }
  }
  return book;
}

function joined(ticker, isins) {
  const groups = new Map();
  const all = new Set();
  const keys = forms(ticker);
  for (const mic of US_MICS) {
    const ids = new Set();
    for (const key of keys) {
      for (const isin of isins.get(`${mic}|${key}`) || []) ids.add(isin);
    }
    if (!ids.size) continue;
    groups.set(mic, ids);
    for (const isin of ids) all.add(isin);
  }
  if (all.size === 1) return { isin: [...all][0] };
  if (all.size < 2) return { isin: "" };
  const held = { ticker };
  stampIsinMatches(held, groups, ticker);
  return { isin: "", matches: held.matches };
}

async function board(book) {
  const page = await textOf(`${ORIGIN}${book.path}`);
  const panels = panelsOf(page);
  const byTicker = new Map();
  for (const panel of panels) {
    const body = new URLSearchParams({
      pais: book.country,
      instrumento: book.instrument,
      panel,
      actualizar: "true",
    });
    const html = await textOf(QUOTES, body);
    const listed = rowsOf(html, `${book.country} ${book.instrument} / ${panel}`);
    console.error(`${book.country} ${book.instrument} / ${panel}: ${listed.length}`);
    for (const row of listed) {
      if (!byTicker.has(row.ticker)) byTicker.set(row.ticker, row);
    }
  }
  return byTicker;
}

const loaded = [];
for (const book of BOOKS) loaded.push({ book, rows: await board(book) });

const etfTickers = new Set();
for (const { book, rows } of loaded) {
  if (book.instrument === "Etfs") {
    for (const ticker of rows.keys()) etfTickers.add(ticker);
  }
}

const usShareTickers = loaded.find((item) => item.book.instrument === "Acciones" && item.book.exchange === "US").rows;
const usAdrTickers = loaded.find((item) => item.book.instrument === "ADRs").rows;
const adrAlsoShare = [...usAdrTickers.keys()].filter((ticker) => usShareTickers.has(ticker));
if (adrAlsoShare.length) {
  throw new Error(`an ADR was also on the US share panels: ${adrAlsoShare.slice(0, 8).join(", ")}`);
}

const seen = new Set();
const unique = [];
let dupes = 0;
for (const { book, rows } of loaded) {
  const siblings = book.exchange === "BCBA" ? rows : null;
  for (const row of rows.values()) {
    const base = siblings ? pesoSibling(row.ticker, siblings) : "";
    const currency = book.exchange === "US" ? "USD" : base ? "USD" : "ARS";
    const fromName = namedType(row.name) || (base ? namedType(siblings.get(base)?.name || "") : "");
    const type =
      fromName ||
      (book.instrument === "Etfs" || etfTickers.has(row.ticker) || (base && etfTickers.has(base)) ? "ETF" : "STOCK");
    const id = `${row.ticker}|${book.exchange}|${currency}|${type}`;
    if (seen.has(id)) {
      dupes += 1;
      continue;
    }
    seen.add(id);
    unique.push({
      query: row.ticker,
      ticker: row.ticker,
      name: row.name,
      exchange: book.exchange,
      currency,
      type,
      raw: [row.ticker, row.name, book.exchange, currency, type].filter(Boolean).join(" "),
    });
  }
}

unique.sort(
  (left, right) =>
    left.exchange.localeCompare(right.exchange) ||
    left.ticker.localeCompare(right.ticker) ||
    left.currency.localeCompare(right.currency)
);

function expect(ticker, exchange, currency, type) {
  const found = unique.filter((row) => row.ticker === ticker && row.exchange === exchange);
  if (found.length !== 1) throw new Error(`${ticker} on ${exchange} was ${found.length} lines`);
  if (found[0].currency !== currency) throw new Error(`${ticker} on ${exchange} was ${found[0].currency}`);
  if (type && found[0].type !== type) throw new Error(`${ticker} on ${exchange} was ${found[0].type}`);
}

expect("AAPL", "US", "USD", "STOCK");
expect("AAPL", "BCBA", "ARS", "STOCK");
expect("AAPLC", "BCBA", "USD", "STOCK");
expect("AAPLD", "BCBA", "USD", "STOCK");
expect("BA.C", "BCBA", "ARS", "STOCK");
expect("AMD", "BCBA", "ARS", "STOCK");
expect("BKNG", "BCBA", "ARS", "STOCK");
expect("GGAL", "BCBA", "ARS", "STOCK");
expect("GGALD", "BCBA", "USD", "STOCK");
expect("YPFD", "BCBA", "ARS");
expect("YPFDD", "BCBA", "USD");
expect("GOGLD", "BCBA", "USD");
expect("VAL3D", "BCBA", "USD");
expect("AKOBD", "BCBA", "USD");
expect("NAT3D", "BCBA", "USD");
expect("ALAC", "BCBA", "USD");
expect("PETRD", "BCBA", "USD");
expect("BBDCD", "BCBA", "USD");
expect("TECOD", "BCBA", "USD");
expect("TGN4D", "BCBA", "USD");

const bcbaShares = loaded.find((item) => item.book.instrument === "Acciones" && item.book.exchange === "BCBA").rows;
const bcbaCedears = loaded.find((item) => item.book.instrument === "Cedears").rows;
if (bcbaShares.size < 80) throw new Error("the Buenos Aires share board was short");
if (bcbaCedears.size < 900) throw new Error("the CEDEAR board was short");
const dollarCedears = unique.filter(
  (row) => row.exchange === "BCBA" && bcbaCedears.has(row.ticker) && row.currency === "USD"
);
if (dollarCedears.length < 500) throw new Error("dollar CEDEARs were short");
if (unique.filter((row) => row.exchange === "BCBA" && row.type === "ETF").length < 20) throw new Error("CEDEAR ETFs were short");
if (usShareTickers.size < 1400) throw new Error("the US share board was short");
if (etfTickers.size < 120) throw new Error("the US ETF board was short");
if (usAdrTickers.size < 50) throw new Error("the ADR board was short");

const isins = isinBook();
for (const row of unique) {
  if (row.exchange === "US") Object.assign(row, joined(row.ticker, isins));
  else row.isin = "";
}
const apple = unique.find((row) => row.ticker === "AAPL" && row.exchange === "US");
if (!apple.isin) throw new Error("Apple had no ISIN");

const kept = stampRows(withoutObligations(unique));
fs.writeFileSync(new URL("iol-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
const byPlace = new Map();
for (const row of kept) {
  byType.set(row.type, (byType.get(row.type) || 0) + 1);
  const place = `${row.exchange} ${row.currency}`;
  byPlace.set(place, (byPlace.get(place) || 0) + 1);
}
const withIsin = kept.filter((row) => row.isin).length;
console.error(
  `${kept.length} listings (${[...byPlace].map(([place, count]) => `${count} ${place}`).join(", ")}); ` +
    `${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}; ${withIsin} with an ISIN` +
    (dupes ? `; left out ${dupes} duplicate lines` : "") +
    (kept.length < unique.length ? `; ${unique.length - kept.length} bonds left out` : "")
);
