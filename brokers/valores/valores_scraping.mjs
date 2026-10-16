// What Valores Bancolombia sells in shares and ETFs, with no login.
// The share page says the local book is whatever is listed on the BVC,
// and the foreign book is the foreign names available there. It does
// not print either list. The BVC equity board does: one line per
// nemotécnico, so a preferred share is not dropped because the issuer
// file only kept the ordinary. A subscription right (DH) stays out.
// The MGC board is the whole foreign list, not only the names Valores
// sponsors. A cattle fund the board still calls a share stays. Every
// line here trades in pesos.
//
//   https://valores.bancolombia.com/productos-servicios/acciones
//   https://www.bvc.com.co/mercado-local-en-linea
//
//   node brokers/valores/valores_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const ORIGIN = "https://www.bvc.com.co";
const BOARD = "https://rest.bvc.com.co/market-information/rv/lvl-2";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const OUTPUT = new URL("valores-parsed.json", import.meta.url);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

async function handshake() {
  const url = `${ORIGIN}/api/handshake?ts=${Date.now()}&r=${Math.random().toString(36).slice(2)}`;
  const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`BVC handshake ${response.status}`);
  const body = await response.json();
  if (!body?.token) throw new Error("BVC handshake returned no token");
  return body.token;
}

async function board(kind) {
  const filters = `filters[marketDataRv][board]=${kind}`;
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const token = await handshake();
      const response = await fetch(`${BOARD}?${filters}`, {
        headers: {
          "User-Agent": UA,
          Accept: "application/json",
          Origin: ORIGIN,
          token,
          k: Buffer.from(filters).toString("base64"),
        },
        signal: AbortSignal.timeout(40_000),
      });
      if (response.status === 401 || response.status === 429 || response.status >= 500) {
        last = new Error(`BVC ${kind} answered ${response.status}`);
        await sleep(400 * (attempt + 1));
        continue;
      }
      if (!response.ok) throw new Error(`BVC ${kind} answered ${response.status}`);
      const body = await response.json();
      const rows = body?.data?.tab;
      if (!Array.isArray(rows) || rows.length < 40) throw new Error(`BVC published no ${kind} board`);
      return rows;
    } catch (error) {
      last = error;
      if (attempt === 3) break;
      await sleep(400 * (attempt + 1));
    }
  }
  throw last;
}

function isRight(mnemonic) {
  return mnemonic.startsWith("DH");
}

function isEtf(name, mnemonic) {
  if (mnemonic === "CASH") return true;
  return /fondo burs[aá]til|\bETF\b|\bUCITS\b|ishares|vanguard|\bspdr\b|invesco|global x|horizons/i.test(name);
}

function notAShare(name) {
  return /fondo de inversi[oó]n/i.test(name) && !isEtf(name, "");
}

function rowFrom(line, mgc) {
  const ticker = clean(line.mnemonic).toUpperCase();
  const name = clean(line.issuer) || ticker;
  if (!ticker) return null;
  if (isRight(ticker) || notAShare(name)) return null;
  const kind = isEtf(name, ticker) ? "ETF" : "STOCK";
  return {
    query: ticker,
    ticker,
    name,
    exchange: "BVC",
    currency: "COP",
    type: kind,
    raw: [ticker, name, mgc ? "MGC" : "BVC", kind].join(" "),
    isin: "",
  };
}

const equity = await board("EQTY");
const mgc = await board("MGC");
const results = [];
for (const line of equity) {
  const row = rowFrom(line, false);
  if (row) results.push(row);
}
for (const line of mgc) {
  const row = rowFrom(line, true);
  if (row) results.push(row);
}
if (results.filter((row) => !row.raw.includes(" MGC ")).length < 80) {
  throw new Error("BVC published too few local share codes");
}

const seen = new Set();
const unique = [];
for (const row of results) {
  const key = `${row.ticker}:${row.type}`;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(row);
}
unique.sort((left, right) => left.ticker.localeCompare(right.ticker) || left.type.localeCompare(right.type));

const stamped = stampRows(withoutObligations(unique));
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const byType = new Map();
for (const row of stamped) byType.set(row.type, (byType.get(row.type) || 0) + 1);
const mgcCount = stamped.filter((row) => row.raw.includes(" MGC ")).length;
const withIsin = stamped.filter((row) => row.isin).length;
console.error(
  `${stamped.length} listings, ${withIsin} avec ISIN, ${mgcCount} MGC ` +
    `(${[...byType].map(([type, count]) => `${count} ${type}`).join(", ")})`,
);
