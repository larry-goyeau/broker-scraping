// What Balanz sells in Buenos Aires shares and CEDEARs, with no login.
// Balanz does not publish the tickers. A local share is Buenos Aires, and
// an ETF in Argentina is a CEDEAR, so the book is BYMA's own panels: the
// leader panel, the general panel, and the CEDEAR panel. Each symbol is
// one line. Pesos stay pesos. A MEP line and a cable line are both dollars;
// the ticker is what tells them apart.
//
// A fund, a warrant and a subscription right stay out. So does a block
// line, the same certificate with a trailing B. Balanz names no share or
// CEDEAR that stays out beyond those. Futures, bonds and options are not
// these panels.
//
// The species page prints the ISIN and the name. A local name is the
// issuer. A CEDEAR name is the certificate. A name that says ETF, or is
// one of the ETF issuers that omit the word, is an ETF. The peso line and
// its dollar lines share that ISIN.
//
//   https://balanz.com/inversiones/acciones/
//   https://balanz.com/inversiones/cedears/cedear-de-etf/
//   https://open.bymadata.com.ar/
//
//   node brokers/balanzar/balanzar_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const MARKET = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/get-market-data";
const SPECIES = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/bnown/fichatecnica/especies/general";
const SEARCH = "https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/instruments-for-header-search";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const PANELS = [
  ["btnLideres", "local"],
  ["btnGeneral", "local"],
  ["btnCedears", "cedear"],
];
const CASH = { ARS: "ARS", USD: "USD", EXT: "USD" };
const ASIDE = /\b(warrants?|fondo com[uú]n|fci|derechos?(?:\s+de\s+suscripci[oó]n)?|subscription rights?)\b/i;

async function post(url, body) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": UA, Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(40_000),
      });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
  }
  throw new Error(last);
}

function isinOf(value) {
  const text = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

function listedNames() {
  const book = new Map();
  const csvPath = new URL("../../assets/stocks.csv", import.meta.url);
  const [header, ...rows] = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const col = Object.fromEntries(header.map((name, index) => [name.trim(), index]));
  for (const cells of rows) {
    if (String(cells[col.exchange] || "").trim().toUpperCase() !== "BCBA") continue;
    let ticker = String(cells[col.ticker] || "").trim().toUpperCase().split(":").pop();
    if (ticker.endsWith(".CI")) ticker = ticker.slice(0, -3);
    if (!ticker || book.has(ticker)) continue;
    book.set(ticker, {
      name: String(cells[col.name] || "").trim(),
      isin: isinOf(cells[col.isin]),
    });
  }
  return book;
}

async function panel(flag) {
  const payload = await post(MARKET, {
    excludeZeroPxAndQty: false,
    T0: true,
    T1: true,
    T2: true,
    page_number: 1,
    page_size: 5000,
    [flag]: true,
  });
  const rows = payload.data || payload;
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${flag} was empty`);
  const bySymbol = new Map();
  for (const row of rows) {
    const symbol = String(row.symbol || "").trim().toUpperCase();
    if (!symbol) throw new Error(`${flag} had a line with no symbol`);
    const cash = CASH[row.denominationCcy];
    if (!cash) throw new Error(`${symbol} was priced in ${row.denominationCcy}`);
    const prev = bySymbol.get(symbol);
    if (prev && prev.currency !== cash) throw new Error(`${symbol} was ${prev.currency} and ${cash}`);
    if (!prev) bySymbol.set(symbol, { currency: cash });
  }
  return bySymbol;
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

async function speciesOf(symbol) {
  const payload = await post(SPECIES, { symbol });
  const row = (payload.data || [])[0];
  if (!row) return null;
  const kind = String(row.tipoEspecie || "").trim();
  return {
    kind,
    isin: isinOf(row.codigoIsin),
    localName: String(row.emisor || "").trim(),
    cedearName: String(row.denominacion || "").trim(),
  };
}

async function searchName(symbol) {
  const rows = await post(SEARCH, { value: symbol });
  const hit = (Array.isArray(rows) ? rows : []).find((row) => String(row.symbol || "").toUpperCase() === symbol);
  return String(hit?.description || "").trim();
}

function namedType(name) {
  if (/\bETNs?\b/i.test(name)) return "ETN";
  if (/\bETCs?\b/i.test(name) && !/\bETFs?\b/i.test(name)) return "ETC";
  if (/\bETFs?\b/i.test(name) || /exchange-traded funds/i.test(name)) return "ETF";
  if (/\b(SPDR|ISHARES|PROSHARES|DIREXION|GLOBAL X|VANGUARD|VANECK|VAN ECK|SELECT SECTOR|FIRST TRUST|ARK INNOVATION)\b/i.test(name)) {
    return "ETF";
  }
  return "";
}

function aside(name) {
  return ASIDE.test(name);
}

const names = listedNames();
const book = new Map();
for (const [flag, panelName] of PANELS) {
  const rows = await panel(flag);
  console.error(`${flag}: ${rows.size}`);
  for (const [symbol, row] of rows) {
    const prev = book.get(symbol);
    if (prev && prev.panel !== panelName) throw new Error(`${symbol} was on ${prev.panel} and ${panelName}`);
    if (!prev) book.set(symbol, { ...row, panel: panelName });
  }
}

const symbols = [...book.keys()].sort();
let looked = 0;
const species = new Map(
  (await pool(symbols, 8, async (symbol) => {
    looked += 1;
    if (looked % 200 === 0) console.error(`species ${looked}/${symbols.length}`);
    try {
      return [symbol, await speciesOf(symbol)];
    } catch (error) {
      console.error(`${symbol} species failed: ${error.message || error}`);
      return [symbol, null];
    }
  }))
);
console.error(`species ${symbols.length}/${symbols.length}`);

const unnamed = symbols.filter((symbol) => {
  const card = species.get(symbol);
  if (card && (card.localName || card.cedearName)) return false;
  return !names.get(symbol)?.name;
});
const searched = new Map();
if (unnamed.length) {
  console.error(`searching ${unnamed.length} unnamed symbols`);
  for (const [symbol, description] of await pool(unnamed, 6, async (symbol) => [symbol, await searchName(symbol)])) {
    if (description) searched.set(symbol, description);
  }
}

function labelOf(symbol) {
  const row = book.get(symbol);
  const card = species.get(symbol);
  if (row.panel === "cedear") return card?.cedearName || names.get(symbol)?.name || searched.get(symbol) || symbol;
  return card?.localName || card?.cedearName || names.get(symbol)?.name || searched.get(symbol) || symbol;
}

function blocked(symbol) {
  if (!symbol.endsWith("B") || symbol.length < 2) return false;
  const stem = symbol.slice(0, -1);
  if (!book.has(stem)) return false;
  const mine = species.get(symbol)?.isin;
  const parent = species.get(stem)?.isin;
  return !mine || !parent || mine === parent;
}

const dropped = [];
const unique = [];
for (const symbol of symbols) {
  const row = book.get(symbol);
  const card = species.get(symbol);
  const name = labelOf(symbol);
  const kind = card?.kind || "";
  if (blocked(symbol)) {
    dropped.push(`${symbol} block`);
    continue;
  }
  if (kind && !/^acciones$|^cedears$/i.test(kind)) {
    dropped.push(`${symbol} ${kind}`);
    continue;
  }
  if (aside(name) || aside(searched.get(symbol) || "")) {
    dropped.push(`${symbol} ${name}`);
    continue;
  }
  const type = namedType(name) || "STOCK";
  const stem = row.currency === "USD" ? symbol.replace(/[CD]$/, "") : symbol;
  const isin = card?.isin || names.get(symbol)?.isin || names.get(stem)?.isin || "";
  unique.push({
    query: symbol,
    ticker: symbol,
    name,
    exchange: "BCBA",
    currency: row.currency,
    type,
    raw: [symbol, name, "BCBA", row.currency, type].filter(Boolean).join(" "),
    ...(isin ? { isin } : {}),
  });
}

unique.sort(
  (left, right) =>
    left.ticker.localeCompare(right.ticker) || left.currency.localeCompare(right.currency)
);

function line(ticker) {
  return unique.find((row) => row.ticker === ticker);
}

function expect(ticker, currency, type, isin) {
  const found = unique.filter((row) => row.ticker === ticker);
  if (found.length !== 1) throw new Error(`${ticker} was ${found.length} lines`);
  if (found[0].currency !== currency) throw new Error(`${ticker} was ${found[0].currency}`);
  if (found[0].type !== type) throw new Error(`${ticker} was ${found[0].type}`);
  if (isin && found[0].isin !== isin) throw new Error(`${ticker} was ${found[0].isin || "blank"}`);
}

expect("GGAL", "ARS", "STOCK", "ARP495251018");
expect("YPFD", "ARS", "STOCK", "ARP9897X1319");
expect("AAPL", "ARS", "STOCK", "ARDEUT116183");
expect("AAPLC", "USD", "STOCK", "ARDEUT116183");
expect("AAPLD", "USD", "STOCK", "ARDEUT116183");
expect("SPY", "ARS", "ETF", "ARCAVA460131");
expect("ARKK", "ARS", "ETF");
if (line("CRE3W")) throw new Error("the Cresud warrant was kept");
if (line("AAPLB") || line("GGALB")) throw new Error("a block line was kept");
if (unique.some((row) => row.ticker === "REIT" || row.ticker === "REITC" || row.ticker === "REITD")) {
  throw new Error("the closed-end fund was kept");
}
const local = unique.filter((row) => book.get(row.ticker).panel === "local");
const cedears = unique.filter((row) => book.get(row.ticker).panel === "cedear");
if (local.length < 350) throw new Error("the Buenos Aires board was short");
if (cedears.length < 1200) throw new Error("the CEDEAR board was short");
if (cedears.filter((row) => row.type === "ETF").length < 40) throw new Error("CEDEAR ETFs were short");

const kept = stampRows(withoutObligations(unique));
fs.writeFileSync(new URL("balanzar-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const withIsin = kept.filter((row) => row.isin).length;
console.error(
  `${kept.length} listings (${local.length} Buenos Aires, ${cedears.length} CEDEAR; ` +
    `${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}); ` +
    `${withIsin} with an ISIN; left out ${dropped.length}`
);
if (dropped.length) console.error(dropped.slice(0, 40).join("\n"));
