// The BODIVA share book, for the Angolan brokers that trade only the
// Luanda exchange (Bolsa de Dívida e Valores de Angola, MIC XBDV). Shared
// module: a broker scraper calls bodivaBook() and writes its own file.
//
// Source: the exchange's own "Livros" table (books), printed on
// bodiva.ao/estatistica, is one JSON list of every instrument with an open
// book: trading code, ISIN, type ("Acções", "Unidade de Participação",
// treasury bills and bonds "BT-..", "OT-..", private bonds "Instrumento de
// Dívida"), last price and the date of the last trade ("entryDate"). It
// carries no name, so names come from the exchange's issuer list
// (/api/v1/Emitentes), matched by a fixed code -> issuer table below; a new
// share code the table does not know throws, so a listing is never missed.
// Both endpoints are public GETs the site itself calls; nothing signs in.
//
// Kept: every "Acções" line, type STOCK, in kwanzas (AOA). Seven companies
// are listed today: BAI (2022), BCGA (2022), ENSA (2024), BODIVA (2024),
// BFA (2025), Unitel (2026) and Standard Bank de Angola (2026, "a sétima
// empresa cotada", https://forbesafricalusofona.com/?p=176951).
// Left out: treasury and private bonds (debt), and the fund units of the
// MBUP segment (closed-end funds with a maturity date, not ETFs; same rule
// as the NEPSE book), unless the caller asks for them with { funds: true },
// in which case they come back as type FUND. Angola lists no ETF, ETN or
// ETC. Banco de Comércio e Indústria (2021) and ACREP (2024) are in the
// issuer list as "Acções" but were sold through one-off privatisation
// auctions at the exchange and have no book: they never trade and are not
// in the list, so they stay out.
//
// Suspended lines: BODIVA publishes no machine-readable suspension list.
// A share whose book shows no trade at all (entryDate empty) or no trade
// for more than STALE_DAYS (60) days is dropped as suspended or never
// traded; listed shares here trade nearly every session. The market
// summary of the last session (/website/api/GetAllMarketSummary_no.php)
// is read as a cross-check: each share it prints must be in the book.
//
//   https://www.bodiva.ao/estatistica
//   https://www.bodiva.ao/capizar/last-quotation/api/v1/getLastQuotation_no.php
//   https://www.bodiva.ao/api/v1/Emitentes
//   https://www.bodiva.ao/website/api/GetAllMarketSummary_no.php
//
//   import { bodivaBook } from "../bfacm/bodivaBook.mjs";
//   const rows = await bodivaBook();            // shares only
//   const all = await bodivaBook({ funds: true }); // shares + fund units
//
//   node brokers/bfacm/bodivaBook.mjs           (prints the counts)

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const SITE = "https://www.bodiva.ao";
const BOOKS = `${SITE}/capizar/last-quotation/api/v1/getLastQuotation_no.php`;
const ISSUERS = `${SITE}/api/v1/Emitentes`;
const SUMMARY = `${SITE}/website/api/GetAllMarketSummary_no.php`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/130 Safari/537.36";
export const EXCHANGE = "BODIVA";
export const MIC = "XBDV";
const STALE_DAYS = 60;
const SHARE = "Acções";
const FUND = "Unidade de Participação";

// Share code -> issuer id in /api/v1/Emitentes.
const ISSUER_OF = {
  BAIAAAAA: 6, // Banco Angolano de Investimento
  BCGAAAAA: 7, // Banco Caixa Geral Angola
  BDVAAAAA: 16, // BODIVA, SA
  BFAAAAAA: 5, // Banco de Fomento Angola
  ENSAAAAA: 14, // ENSA, SA.
  SBAOAAAA: 4, // Standard Bank Angola
  UNTLAAAA: 17, // Unitel S.A.
};
// Fund-unit code -> name, used with { funds: true }; issuer: Standard Gestão de Activos.
const FUND_NAMES = {
  STDRUFVA: "Standard Gestão de Activos - fund units (series A)",
  STDRUFVB: "Standard Gestão de Activos - fund units (series B)",
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

async function getJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { stdout } = await exec("curl", ["-fsSL", "--max-time", "30", "-A", UA, url], { maxBuffer: 20_000_000, encoding: "utf8" });
      return JSON.parse(stdout);
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await pause(1000 * (attempt + 1));
  }
  throw new Error(`${url}: ${last}`);
}

const dayNumber = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

export async function bodivaBook({ funds = false } = {}) {
  const books = await getJson(BOOKS);
  await pause(600);
  const issuers = await getJson(ISSUERS);
  await pause(600);
  const summary = await getJson(SUMMARY);
  if (!Array.isArray(books) || books.length < 100) throw new Error(`BODIVA books list printed ${books?.length ?? 0} lines`);
  if (!Array.isArray(issuers) || issuers.length < 5) throw new Error("BODIVA issuer list is empty or changed shape");
  if (!Array.isArray(summary)) throw new Error("BODIVA market summary changed shape");

  const issuerName = new Map(issuers.map((issuer) => [issuer.id, clean(issuer.designacao)]));
  const today = dayNumber(new Date(Date.now() + 3_600_000).toISOString().slice(0, 10)); // Luanda, UTC+1
  const rows = [];
  const dropped = [];
  const seen = new Set();
  for (const line of books) {
    const typology = clean(line.typology);
    const code = clean(line.symbol).toUpperCase();
    const isin = clean(line.isin).toUpperCase();
    if (typology !== SHARE && typology !== FUND) continue;
    if (!/^[A-Z0-9]{8}$/.test(code) || !/^AO[A-Z0-9]{10}$/.test(isin)) throw new Error(`unreadable BODIVA book ${JSON.stringify(line)}`);
    if (seen.has(isin)) throw new Error(`BODIVA repeats ${isin}`);
    seen.add(isin);
    const type = typology === SHARE ? "STOCK" : "FUND";
    if (type === "FUND" && !funds) continue;
    if (type === "FUND" && line.maturityDate && dayNumber(line.maturityDate) < today) {
      dropped.push(`${code} (matured ${line.maturityDate})`);
      continue;
    }
    const last = clean(line.entryDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(last)) {
      dropped.push(`${code} (never traded)`);
      continue;
    }
    if (today - dayNumber(last) > STALE_DAYS) {
      dropped.push(`${code} (no trade since ${last}, suspended)`);
      continue;
    }
    let name;
    if (type === "STOCK") {
      if (!(code in ISSUER_OF)) throw new Error(`BODIVA share ${code} (${isin}) is new: add it to ISSUER_OF`);
      name = issuerName.get(ISSUER_OF[code]);
      if (!name) throw new Error(`BODIVA issuer ${ISSUER_OF[code]} for ${code} is gone from the issuer list`);
    } else {
      name = FUND_NAMES[code] || `BODIVA fund units ${code}`;
    }
    rows.push({
      query: code,
      ticker: code,
      name,
      exchange: EXCHANGE,
      currency: "AOA",
      type,
      isin,
      mic: MIC,
      raw: [code, name, EXCHANGE, isin, typology, type].join(" "),
    });
  }

  // Every share of the last session's summary must be in the book.
  for (const line of summary) {
    if (clean(line.TYPOLOGY) !== SHARE) continue;
    const isin = clean(line.ISIN_AUX).toUpperCase();
    if (!seen.has(isin)) throw new Error(`BODIVA summary share ${line.SYMBOL} (${isin}) is not in the books list`);
  }
  if (rows.filter((row) => row.type === "STOCK").length < 5) throw new Error("BODIVA book kept fewer than 5 shares");

  rows.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
  bodivaBook.dropped = dropped;
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = await bodivaBook({ funds: process.argv.includes("--funds") });
  const byType = {};
  for (const row of rows) byType[row.type] = (byType[row.type] || 0) + 1;
  for (const row of rows) console.log(`${row.ticker}\t${row.isin}\t${row.type}\t${row.name}`);
  console.error(`${rows.length} BODIVA lines ${JSON.stringify(byType)}; dropped ${bodivaBook.dropped.length}${bodivaBook.dropped.length ? `: ${bodivaBook.dropped.join(", ")}` : ""}`);
}
