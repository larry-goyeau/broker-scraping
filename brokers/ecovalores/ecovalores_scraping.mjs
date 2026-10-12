// What Eco Valores sells in Buenos Aires shares and CEDEARs, with no login.
// The account is ByMA. A foreign company there is a CEDEAR of that place.
// The Interactive Brokers account Eco opens by invitation stays out.
//
// The producer panel is the book. Acciones and CEDEARs, each symbol one
// line. Pesos stay pesos. MEP is USD and cable is EXT; both are dollars,
// and the ticker tells them apart. A line with no ISIN is a stub (a
// warrant, a right, a name that is only the code) and stays out. So does
// a block line: a trailing B that shares the ISIN of another line. The
// letter before that B is not always the parent ticker. AAPCB is Apple's
// block, while AAPC is another company. A symbol that itself ends in B
// stays: Globant is GLOB, and the cable and MEP lines are built on it.
// Andina drops the dot (AKO.B, AKOBC). Astera drops the B (ALAB, ALAC).
//
// A name that says ETF, or is one of the ETF issuers that omit the word,
// is an ETF. The peso line and its dollar lines share that ISIN.
//
//   https://bonos.ecovalores.com.ar/api/especies/
//   https://www.ecovalores.com.ar/preguntas-frecuentes.php
//
//   node brokers/ecovalores/ecovalores_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const API = "https://bonos.ecovalores.com.ar/api/especies/";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const KINDS = ["ACCION", "CEDEAR"];
const CASH = { ARS: "ARS", USD: "USD", EXT: "USD" };
const TICKER = /^[A-Z0-9.]{1,12}$/;
const ASIDE = /\b(warrants?|fondo com[uú]n|fci|derechos?(?:\s+de\s+suscripci[oó]n)?|subscription rights?)\b/i;

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
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

async function kind(categoria) {
  const rows = [];
  let page = 1;
  while (page <= 40) {
    const payload = await get(`${API}?categoria=${categoria}&page=${page}&page_size=100`);
    const batch = Array.isArray(payload.results) ? payload.results : [];
    rows.push(...batch);
    if (!payload.next || !batch.length) break;
    page += 1;
  }
  return rows;
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

function labelOf(name) {
  return String(name || "").replace(/^CEDEAR\s+/i, "").replace(/\s+/g, " ").trim();
}

const seen = new Map();
const dropped = [];
for (const categoria of KINDS) {
  const rows = await kind(categoria);
  console.error(`${categoria}: ${rows.length}`);
  for (const row of rows) {
    const ticker = String(row.ticker || "").trim().toUpperCase();
    const isin = isinOf(row.isin);
    if (!TICKER.test(ticker)) {
      dropped.push(`${ticker || "blank"} ticker`);
      continue;
    }
    if (!isin) {
      dropped.push(`${ticker} no ISIN`);
      continue;
    }
    const prev = seen.get(ticker);
    if (prev) {
      if (prev.isin !== isin) throw new Error(`${ticker} had ${prev.isin} and ${isin}`);
      continue;
    }
    seen.set(ticker, {
      ticker,
      name: labelOf(row.nombre),
      isin,
      categoria,
      moneda: String(row.moneda || "").trim().toUpperCase(),
    });
  }
}

function cashOf(row) {
  const printed = CASH[row.moneda];
  if (printed) return printed;
  if (/[CD]$/.test(row.ticker)) {
    const parent = seen.get(row.ticker.slice(0, -1));
    if (parent && parent.isin === row.isin) return "USD";
  }
  return "ARS";
}

function bare(ticker) {
  return ticker.replace(/\./g, "");
}

function isSettlement(ticker, other) {
  const code = bare(ticker);
  const base = bare(other);
  if (code === `${base}C` || code === `${base}D`) return true;
  if (base.endsWith("B")) {
    const stem = base.slice(0, -1);
    if (code === `${stem}C` || code === `${stem}D`) return true;
  }
  return false;
}

function blocked(row) {
  if (!row.ticker.endsWith("B")) return false;
  const family = [...seen.values()].filter((other) => other.isin === row.isin && other.ticker !== row.ticker);
  if (family.some((other) => `${bare(other.ticker)}B` === bare(row.ticker))) return true;
  return family.some((other) => !other.ticker.endsWith("B") && !isSettlement(other.ticker, row.ticker));
}

const unique = [];
for (const row of seen.values()) {
  if (blocked(row)) {
    dropped.push(`${row.ticker} block`);
    continue;
  }
  if (ASIDE.test(row.name)) {
    dropped.push(`${row.ticker} ${row.name}`);
    continue;
  }
  const type = namedType(row.name) || "STOCK";
  const currency = cashOf(row);
  unique.push({
    query: row.ticker,
    ticker: row.ticker,
    name: row.name,
    exchange: "BCBA",
    currency,
    type,
    raw: [row.ticker, row.name, "BCBA", currency, type].filter(Boolean).join(" "),
    isin: row.isin,
    categoria: row.categoria,
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
expect("IEB", "ARS", "STOCK", "ARP3594C1107");
expect("GLOB", "ARS", "STOCK", "ARBCOM460150");
expect("BRKB", "ARS", "STOCK", "ARBCOM4603L1");
expect("AKO.B", "ARS", "STOCK", "ARBCOM4603Q0");
expect("ALAB", "ARS", "STOCK", "AR0717084534");
expect("B", "ARS", "STOCK", "ARDEUT112562");
expect("IBB", "ARS", "ETF", "AR0377480402");
expect("XLB", "ARS", "ETF", "AR0441163851");
expect("SPY", "ARS", "ETF", "ARCAVA460131");
expect("GLD", "ARS", "ETF", "AR0082060689");
expect("IBIT", "ARS", "ETF", "AR0626566167");
if (line("AAPLB") || line("GGALB") || line("AAPCB") || line("GGACB")) throw new Error("a block line was kept");
if (!line("AAPC")) throw new Error("Advance Auto Parts was dropped");
if (line("CRE3W")) throw new Error("the Cresud warrant was kept");

const local = unique.filter((row) => row.categoria === "ACCION");
const cedears = unique.filter((row) => row.categoria === "CEDEAR");
if (local.length < 140) throw new Error(`the Buenos Aires board was short (${local.length})`);
if (cedears.length < 1000) throw new Error("the CEDEAR board was short");
if (cedears.filter((row) => row.type === "ETF").length < 40) throw new Error("CEDEAR ETFs were short");

const published = unique.map(({ categoria, ...row }) => row);
const kept = stampRows(withoutObligations(published));
fs.writeFileSync(new URL("ecovalores-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const byType = new Map();
for (const row of kept) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const withIsin = kept.filter((row) => row.isin).length;
console.error(
  `${kept.length} listings (${local.length} Buenos Aires, ${cedears.length} CEDEAR; ` +
    `${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")}); ` +
    `${withIsin} with an ISIN; left out ${dropped.length}`
);
if (dropped.length) console.error(dropped.slice(0, 40).join("\n"));
