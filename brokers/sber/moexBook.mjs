// Moscow Exchange equity listing, read from the exchange's own public ISS
// API (no login, no token), for the brokers that sell every share and
// exchange fund of the Moscow Exchange stock market.
//
//   https://iss.moex.com/iss/engines/stock/markets/shares/boards/TQBR/securities.json
//   https://iss.moex.com/iss/engines/stock/markets/foreignshares/boards/FQBR/securities.json
//
// Boards read are the T+ order books of the shares market (TQBR shares,
// depositary receipts and, since 2026, most exchange funds; TQTF and the
// dollar, euro, Hong Kong dollar and yuan fund boards) and of the foreign
// shares market (FQBR and its yuan, Hong Kong dollar and dollar boards).
// The odd-lot board SMAL, the settlement board SPEQ, negotiated deals and
// the MTQR OTC book are not exchange books and are not read.
//
// A line counts when its board STATUS is "A" (admitted and traded); "N"
// is a suspended or delisted line. STATUS does not depend on the hour, so
// a scraper using this can run at any time.
//
// SECTYPE gives the kind: 1 ordinary share, 2 preferred share, D
// depositary receipt (STOCK); J exchange-traded unit fund (BPIF) and E
// foreign ETF (ETF); 9 open-ended, A interval and B closed-end unit funds
// (FUND: not ETFs). MOEX writes the rouble SUR; it is stored RUB.
//
// The helper also fetches broker pages for the run-time checks. Several
// Russian sites present a chain that ends in the Russian national root CA
// (Node does not trust it) or need legacy TLS renegotiation: those requests
// alone go through an https.Agent with rejectUnauthorized: false and
// SSL_OP_LEGACY_SERVER_CONNECT (the curl -k equivalent).

import crypto from "node:crypto";
import https from "node:https";
import { resolveVenue } from "../../spreads/venues.mjs";

export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
export const MOEX = { exchange: "Moscow Exchange", mic: "MISX" };

const ISS = "https://iss.moex.com/iss/engines/stock/markets";
const BOARDS = [
  ["shares", "TQBR"],
  ["shares", "TQTF"],
  ["shares", "TQIF"],
  ["shares", "TQTD"],
  ["shares", "TQTE"],
  ["shares", "TQFD"],
  ["shares", "TQFE"],
  ["shares", "TQTH"],
  ["shares", "TQTY"],
  ["foreignshares", "FQBR"],
  ["foreignshares", "FQBH"],
  ["foreignshares", "FQBY"],
  ["foreignshares", "TQBD"],
];
const KIND = { 1: "STOCK", 2: "STOCK", D: "STOCK", J: "ETF", E: "ETF", 9: "FUND", A: "FUND", B: "FUND" };
const COLUMNS = "SECID,SHORTNAME,SECNAME,ISIN,CURRENCYID,FACEUNIT,SECTYPE,STATUS,LISTLEVEL,LOTSIZE,BOARDID";
// Eurasian Economic Union issuers are not "foreign" for the Russian
// qualified-investor rules.
const EAEU = new Set(["RU", "AM", "BY", "KZ", "KG"]);
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}\d$/;

const lenient = new https.Agent({
  rejectUnauthorized: false,
  secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
  keepAlive: false,
});

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function foreignIssuer(isin) {
  return !EAEU.has(String(isin).slice(0, 2));
}

async function issJson(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: AbortSignal.timeout(90_000) });
      if (response.ok) return response.json();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * (attempt + 1));
  }
  throw new Error(last);
}

// Every admitted line of the equity boards: [{ secid, shortName, name,
// isin, currency, kind, sectype, board, listLevel, foreign }].
export async function moexBook() {
  const lines = [];
  for (const [market, board] of BOARDS) {
    const body = await issJson(`${ISS}/${market}/boards/${board}/securities.json?iss.meta=off&iss.only=securities&securities.columns=${COLUMNS}`);
    const { columns, data } = body.securities;
    for (const cells of data) {
      const item = Object.fromEntries(columns.map((name, index) => [name, cells[index]]));
      if (item.STATUS !== "A") continue;
      const kind = KIND[item.SECTYPE];
      if (!kind) throw new Error(`MOEX ${board} ${item.SECID}: SECTYPE ${item.SECTYPE}`);
      const isin = normalize(item.ISIN).toUpperCase();
      if (!ISIN.test(isin)) throw new Error(`MOEX ${board} ${item.SECID}: ISIN ${item.ISIN}`);
      const currency = normalize(item.CURRENCYID).toUpperCase().replace(/^SUR$/, "RUB");
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`MOEX ${board} ${item.SECID}: currency ${item.CURRENCYID}`);
      lines.push({
        secid: normalize(item.SECID),
        shortName: normalize(item.SHORTNAME),
        name: normalize(item.SECNAME) || normalize(item.SHORTNAME),
        isin,
        currency,
        kind,
        sectype: item.SECTYPE,
        board: item.BOARDID || board,
        listLevel: item.LISTLEVEL,
        foreign: foreignIssuer(isin),
      });
    }
  }
  const seen = new Set();
  for (const line of lines) {
    const key = `${line.isin}|${line.currency}`;
    if (seen.has(key)) throw new Error(`MOEX ${key} on two boards`);
    seen.add(key);
  }
  return lines;
}

// A catalogue row for one MOEX line. `name` overrides the exchange name
// (a broker's own label), `notes` go to raw.
export function moexRow(line, { name = "", notes = [] } = {}) {
  const row = {
    query: line.secid,
    ticker: line.secid,
    name: normalize(name) || line.name,
    exchange: MOEX.exchange,
    mic: MOEX.mic,
    currency: line.currency,
    type: line.kind,
    isin: line.isin,
    raw: [
      line.secid,
      line.shortName,
      line.name,
      line.isin,
      `${line.board} ${line.currency}`,
      `SECTYPE ${line.sectype}`,
      `list level ${line.listLevel}`,
      line.foreign ? "foreign issuer (qualified investors, or unqualified after the test, where the issuer's country allows)" : "",
      ...notes,
    ]
      .map(normalize)
      .filter(Boolean)
      .join(" | "),
  };
  const { venue } = resolveVenue(row);
  if (!venue || venue.mic !== row.mic) throw new Error(`${row.ticker}: no venue for ${row.exchange}`);
  return row;
}

// The rows of a broker that sells every share and exchange fund of the
// Moscow Exchange: STOCK and ETF lines quoted in one of `currencies`.
// Unit funds that are not ETFs (OPIF, IPIF, ZPIF) and lines in other
// currencies are counted in `left`.
export async function moexCatalogue({ currencies = ["RUB"], notes = [] } = {}) {
  const lines = await moexBook();
  const rows = [];
  const left = {};
  const leave = (reason) => (left[reason] = (left[reason] || 0) + 1);
  for (const line of lines) {
    if (line.kind === "FUND") {
      leave(`unit fund, not an ETF (SECTYPE ${line.sectype})`);
      continue;
    }
    if (!currencies.includes(line.currency)) {
      leave(`${line.kind} quoted in ${line.currency}, not an account currency`);
      continue;
    }
    rows.push(moexRow(line, { notes }));
  }
  return { rows, left, lines };
}

// Floors and anchor lines a full MOEX catalogue must hold.
export function checkFloors(rows, { stocks = 200, etfs = 80, anchors = [] } = {}) {
  const count = (type) => rows.filter((row) => row.mic === MOEX.mic && row.type === type).length;
  if (count("STOCK") < stocks) throw new Error(`only ${count("STOCK")} MOEX shares`);
  if (count("ETF") < etfs) throw new Error(`only ${count("ETF")} MOEX ETFs`);
  for (const [isin, label] of anchors) {
    if (!rows.some((row) => row.isin === isin)) throw new Error(`${label} (${isin}) is missing`);
  }
}

export const ANCHORS = [
  ["RU0009029540", "Sberbank"],
  ["RU0007661625", "Gazprom"],
  ["RU0009024277", "Lukoil"],
];
export const ETF_ANCHORS = [["RU000A101X76", "TMOS ETF"]];

// GET a URL and return { status, type, body } (body a Buffer), following
// redirects. `lenient` uses the agent described in the header.
export function getPage(url, { lenient: loose = false, headers = {}, hops = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "GET",
        agent: loose ? lenient : undefined,
        timeout: 90_000,
        headers: { "User-Agent": UA, Accept: "text/html,application/pdf,*/*", "Accept-Language": "ru-RU,ru;q=0.9", ...headers },
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const location = response.headers.location;
          if (response.statusCode >= 300 && response.statusCode < 400 && location && hops > 0) {
            resolve(getPage(new URL(location, url).href, { lenient: loose, headers, hops: hops - 1 }));
            return;
          }
          resolve({ status: response.statusCode, type: String(response.headers["content-type"] || ""), body: Buffer.concat(chunks), headers: response.headers });
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error(`timeout ${url}`)));
    request.on("error", reject);
    request.end();
  });
}

export function pageText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;| /g, " ")
    .replace(/&laquo;/g, "«")
    .replace(/&raquo;/g, "»")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

// Throws unless every phrase is on the page (text compared with spaces
// collapsed). A PDF is only checked for HTTP 200 and its content type.
export async function checkPages(pages) {
  for (const { url, phrases = [], pdf = false, lenient: loose = false } of pages) {
    let page;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        page = await getPage(url, { lenient: loose });
        if (page.status === 200) break;
      } catch (error) {
        page = { status: String(error.message || error) };
      }
      await sleep(2000 * (attempt + 1));
    }
    if (page.status !== 200) throw new Error(`${url} answered ${page.status}`);
    if (pdf) {
      if (!/pdf/i.test(page.type) && page.body.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${url} is no longer a PDF`);
      continue;
    }
    const text = pageText(page.body.toString("utf8"));
    for (const phrase of phrases) {
      if (!text.includes(normalize(phrase))) throw new Error(`${url} no longer says: ${phrase}`);
    }
  }
}

export function countRows(rows) {
  const counts = {};
  for (const row of rows) {
    const key = `${row.exchange} ${row.type} ${row.currency}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}
