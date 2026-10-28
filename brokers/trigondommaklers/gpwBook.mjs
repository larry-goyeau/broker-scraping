// The Warsaw Stock Exchange book, for a broker that sells what is listed
// on the GPW. The rows are the exchange's own quote boards, which print
// every line with its ISIN, its GPW code and its currency:
//
//   - the GPW main market (Główny Rynek): continuous trading and the two
//     single-price auction boards, together every listed share line;
//   - NewConnect, the GPW's alternative market (NC Focus, Base, Alert);
//   - the GPW ETF board: ETFs, the ETC and the ETNs (the short name's
//     prefix is the product);
//   - GlobalConnect, the GPW's foreign-share segment, only when asked
//     (globalConnect: true); its company list prints the ISIN.
//
// A line stays out when it is suspended: the board marks it "/Z" after the
// short name, or the GPW suspension page still has a suspension in force
// on that market (MIC XWAR, XNCO or XGLO) with no later lifting. A line the
// exchange has announced it withdraws or excludes from trading stays out
// too. A NewConnect company the exchange lists but that is not on the
// quote board is not trading and stays out. A company in liquidation ("w
// likwidacji") or in bankruptcy ("w upadłości") stays out. A line with no
// reference price and no trade has never traded and stays out. Rights,
// warrants, certificates of closed-end funds that are not ETFs, bonds,
// structured products and futures are on other boards and are not read.
//
// A share's name is the ../../assets/stocks.csv name of the GPW or
// NewConnect line with that ISIN, else the company name on the exchange's
// list. An ETP's name is the description on the GPW ETF card (Polish),
// else the etfs.csv name, else the short name.
//
//   https://www.gpw.pl/akcje
//   https://www.gpw.pl/spolki
//   https://www.gpw.pl/etfy
//   https://newconnect.pl/notowania
//   https://newconnect.pl/spolki
//   https://gpwglobalconnect.pl/spolki
//   https://www.gpw.pl/zawieszenia-i-wykluczenia
//
//   import { gpwBook, writeGpwCatalogue } from "../trigondommaklers/gpwBook.mjs";
//   const rows = await gpwBook();                       // GPW + NewConnect + ETPs
//   await writeGpwCatalogue(import.meta.url, "x-parsed.json", { globalConnect: true });
//
//   node brokers/trigondommaklers/gpwBook.mjs          (prints the counts)

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import https from "node:https";

export const EXCHANGE = "Warsaw Stock Exchange";

const GPW = "https://www.gpw.pl/ajaxindex.php";
const NC = "https://newconnect.pl/ajaxindex.php";
const GC = "https://gpwglobalconnect.pl/ajaxindex.php";
const MAIN_BOARDS = [
  `${GPW}?action=GPWQuotations&start=showTable&tab=all&lang=PL&type=&full=1&format=html`,
  `${GPW}?action=GPWQuotations&start=listSingle&tab=all&lang=PL&type=fix1&full=1&format=html`,
  `${GPW}?action=GPWQuotations&start=listSingle&tab=all&lang=PL&type=fix2&full=1&format=html`,
];
const NC_BOARD = `${NC}?action=NCExternalDataFrontController&start=showTable&tab=all&lang=PL&type=ALL&full=1&system_type=&format=html`;
const SUSPENSIONS = "https://www.gpw.pl/zawieszenia-i-wykluczenia";
const COMPANY_PAGE = "https://www.gpw.pl/spolki";
const NC_COMPANY_PAGE = "https://newconnect.pl/spolki";
// Any ETF card carries the description of every GPW ETP, keyed by ISIN.
const ETF_CARD = "https://www.gpw.pl/etf?isin=";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "pl,en;q=0.8",
};
const MIC = { GPW: "XWAR", NewConnect: "XNCO", GlobalConnect: "XGLO" };

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&oacute;/g, "ó")
    .replace(/&ndash;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function toIsin(value) {
  const text = normalize(value).toUpperCase();
  return /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(text) ? text : "";
}

function number(value) {
  const text = normalize(value).replace(/\s/g, "").replace(",", ".");
  const parsed = Number(text);
  return text && text !== "-" && Number.isFinite(parsed) ? parsed : null;
}

// The GPW sites reset an HTTP/2 client; HTTP/1.1 answers.
function request(url, body = null, redirects = 0) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const headers = { ...HEADERS };
    if (body != null) {
      headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
      headers["Content-Length"] = Buffer.byteLength(body);
      headers["X-Requested-With"] = "XMLHttpRequest";
    }
    const req = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: body == null ? "GET" : "POST",
        ALPNProtocols: ["http/1.1"],
        headers,
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 4) {
          res.resume();
          resolve(request(new URL(res.headers.location, url).href, body, redirects + 1));
          return;
        }
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) reject(new Error(`${url} answered ${res.statusCode}`));
          else resolve(Buffer.concat(chunks).toString("utf8"));
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.setTimeout(30_000, () => req.destroy(new Error(`${url} timed out`)));
    req.end(body ?? undefined);
  });
}

async function fetchText(url, body = null) {
  let last;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const text = await request(url, body);
      await sleep(700);
      return text;
    } catch (error) {
      last = error;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw last;
}

// The search form of a company list page, sent as the page sends it, with
// every box ticked and room for the whole list.
function formBody(html) {
  const start = html.indexOf('id="search-form"') >= 0 ? html.indexOf('id="search-form"') : html.indexOf("id='search-form'");
  if (start < 0) throw new Error("company list page has no search form");
  const form = html.slice(start, html.indexOf("</form>", start));
  const params = new URLSearchParams();
  for (const match of form.matchAll(/<input([^>]*)>/g)) {
    const attrs = match[1];
    const name = attrs.match(/name=["']([^"']+)["']/)?.[1];
    if (!name) continue;
    const value = attrs.match(/value=["']([^"']*)["']/)?.[1];
    const checkbox = /type=["']?checkbox/.test(attrs);
    if (checkbox && !/checked/.test(attrs)) continue;
    params.append(name, checkbox ? value ?? "on" : value ?? "");
  }
  if (!params.get("action")) throw new Error("company list form has no action");
  params.set("offset", "0");
  params.set("limit", "3000");
  return params.toString();
}

// ISIN -> { code, name } from a company list answer.
function companies(html) {
  const list = new Map();
  for (const match of html.matchAll(/spolka\?isin=([A-Z0-9]{12})"[^>]*>\s*<strong class="name">([\s\S]*?)<\/strong>/g)) {
    const isin = toIsin(match[1]);
    const code = normalize(match[2].match(/\(([^)]+)\)\s*<\/span>/)?.[1]);
    const name = normalize(match[2].replace(/<span[\s\S]*<\/span>/, ""));
    if (isin) list.set(isin, { code, name });
  }
  return list;
}

// One row per line of a quote board, read through the board's own header.
function boardLines(html, label) {
  const header = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/)?.[1] ?? "";
  const titles = [...header.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((match) => normalize(match[1]));
  const at = (pattern) => titles.findIndex((title) => pattern.test(title));
  const col = {
    name: at(/^Nazwa$/),
    isin: at(/^ISIN$/),
    code: at(/^Skrót$/),
    currency: at(/^Waluta$/),
    reference: at(/^Kurs odn\./),
    last: at(/^Kurs ost\. trans\./),
    flag: at(/^Flaga$/),
  };
  if (Object.values(col).some((index) => index < 0)) throw new Error(`${label} header moved: ${titles.join(" | ")}`);
  const lines = [];
  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => normalize(cell[1]));
    const isin = toIsin(cells[col.isin]);
    if (!isin) continue;
    const short = cells[col.name];
    lines.push({
      isin,
      short: short.replace(/(\s\/[^\s]+)+$/, "").trim(),
      code: cells[col.code].toUpperCase(),
      currency: cells[col.currency].toUpperCase(),
      suspended: /\s\/Z\b/.test(short),
      traded: number(cells[col.reference]) != null || number(cells[col.last]) != null,
    });
  }
  return lines;
}

function etpLines(html) {
  const lines = [];
  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = match[1];
    const isin = toIsin(row.match(/id="id_ISIN"[^>]*>([^<]*)</)?.[1]);
    if (!isin) continue;
    const short = normalize(row.match(/id="id_Nazwa"[^>]*>([\s\S]*?)<\/td>/)?.[1]);
    const reference = number(row.match(/class="right rel col6">([^<]*)</)?.[1]);
    const last = number(row.match(/class="right last col11">([^<]*)</)?.[1]);
    lines.push({
      isin,
      short: short.replace(/(\s\/[^\s]+)+$/, "").trim(),
      code: short.replace(/(\s\/[^\s]+)+$/, "").trim().toUpperCase(),
      currency: normalize(row.match(/id="id_Waluta"[^>]*>([^<]*)</)?.[1]).toUpperCase(),
      suspended: /\s\/Z\b/.test(short),
      traded: reference != null || last != null,
    });
  }
  return lines;
}

function etpDescriptions(html) {
  const names = new Map();
  for (const match of html.matchAll(/"([A-Z]{2}[A-Z0-9]{9}\d)":\s*`\s*<h3 class="etf-title">([^<]*)<\/h3>/g)) {
    const name = normalize(match[2])
      .replace(/^Informacje ogólne\s*-\s*/i, "")
      .replace(/\s*\([A-Z0-9]+\)\s*$/, "")
      .trim();
    if (name) names.set(match[1], name);
  }
  return names;
}

function when(value) {
  const text = normalize(value);
  if (!text) return null;
  const date = new Date(text.replace(" ", "T") + "+02:00");
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

// MIC -> set of ISINs and GPW codes the exchange holds out of trading:
// the latest event on that key is a suspension still in force, or a
// withdrawal or exclusion the exchange has announced.
function heldOut(html) {
  const events = [];
  for (const match of html.matchAll(/<tr[^>]*data-rodzaj-operacji="([^"]*)"[^>]*>([\s\S]*?)<\/tr>/g)) {
    const kind = normalize(match[1]).toLowerCase();
    const cells = [...match[2].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((cell) => normalize(cell[1]));
    if (cells.length < 12) continue;
    const until = when(cells[5]);
    events.push({
      kind,
      mic: cells[7],
      published: when(cells[1]) ?? 0,
      live: cells[6] === "TAK" && (until == null || until > Date.now()),
      keys: [
        ...cells[10].split(",").map(toIsin).filter(Boolean),
        ...cells[11].split(",").map((code) => normalize(code).toUpperCase()).filter(Boolean),
      ],
    });
  }
  if (events.length < 10) throw new Error(`GPW suspension page has ${events.length} events`);
  const latest = new Map();
  for (const event of events) {
    for (const key of event.keys) {
      const id = `${event.mic}:${key}`;
      const prior = latest.get(id);
      if (!prior || event.published >= prior.published) latest.set(id, event);
    }
  }
  const out = new Map();
  for (const [id, event] of latest) {
    if (!event.live) continue;
    if (!/^(zawieszenie|wycofanie|wykluczenie)/.test(event.kind)) continue;
    const [mic, key] = [id.slice(0, id.indexOf(":")), id.slice(id.indexOf(":") + 1)];
    if (!out.has(mic)) out.set(mic, new Set());
    out.get(mic).add(key);
  }
  return out;
}

function listedNames() {
  const names = new Map();
  for (const file of ["stocks.csv", "etfs.csv"]) {
    const text = fs.readFileSync(new URL(`../../assets/${file}`, import.meta.url), "utf8");
    for (const line of text.split("\n")) {
      const [, exchange, isin, ...rest] = line.split(",");
      if (exchange !== "GPW" && exchange !== "NEWCONNECT") continue;
      const name = rest.join(",").replace(/^"|"$/g, "").trim();
      if (isin && name && !names.has(isin)) names.set(isin, name);
    }
  }
  return names;
}

function companyName(name) {
  return name
    .replace(/\bSPÓŁKA AKCYJNA\b/g, "SA")
    .replace(/\bSPÓŁKA EUROPEJSKA\b/g, "SE")
    .replace(/\s+Z SIEDZIBĄ W .*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function productOf(code) {
  if (/^ETC/.test(code)) return "ETC";
  if (/^ETN/.test(code)) return "ETN";
  return "ETF";
}

const WOUND_UP = /\bW (LIKWIDACJI|UPADŁOŚCI)\b/i;

// Returns { rows, leftOut }. rows are in the house shape (query, ticker,
// name, exchange[, mic], currency, type, raw, isin); exchange is "GPW",
// "NewConnect" or "GlobalConnect", as the other Polish scrapers write it.
export async function gpwBookDetail({ newConnect = true, etps = true, globalConnect = false, mic = false } = {}) {
  const held = heldOut(await fetchText(SUSPENSIONS));
  const names = listedNames();
  const leftOut = [];
  const rows = [];
  const seen = new Set();

  function add(line, exchange, type, name, exchangeFirst = false) {
    const blocked = held.get(MIC[exchange]) ?? new Set();
    const why = line.suspended
      ? "suspended (/Z)"
      : blocked.has(line.isin) || blocked.has(line.code)
        ? "suspended or withdrawn"
        : WOUND_UP.test(name)
          ? "in liquidation or bankruptcy"
          : !line.traded
            ? "never traded"
            : !/^[A-Z]{3}$/.test(line.currency)
              ? "no currency"
              : "";
    if (why) {
      leftOut.push(`${exchange} ${line.code} ${line.isin} ${why}`);
      return;
    }
    const key = `${line.isin}:${exchange}:${line.currency}`;
    if (seen.has(key)) return;
    seen.add(key);
    const clean = (exchangeFirst ? name : names.get(line.isin)) || names.get(line.isin) || companyName(name) || line.short;
    const row = { query: line.isin, ticker: line.code, name: clean, exchange };
    if (mic) row.mic = MIC[exchange];
    Object.assign(row, {
      currency: line.currency,
      type,
      raw: [line.code, clean, exchange, line.currency, type].join(" "),
      isin: line.isin,
    });
    rows.push(row);
  }

  // Main market.
  const mainList = companies(await fetchText(GPW, formBody(await fetchText(COMPANY_PAGE))));
  if (mainList.size < 300) throw new Error(`GPW company list has ${mainList.size} companies`);
  const mainLines = [];
  for (const [index, url] of MAIN_BOARDS.entries()) mainLines.push(...boardLines(await fetchText(url), `GPW board ${index}`));
  if (mainLines.length < 300) throw new Error(`GPW share boards have ${mainLines.length} lines`);
  for (const line of mainLines) add(line, "GPW", "STOCK", mainList.get(line.isin)?.name ?? "");

  // NewConnect.
  if (newConnect) {
    const ncList = companies(await fetchText(NC, formBody(await fetchText(NC_COMPANY_PAGE))));
    if (ncList.size < 250) throw new Error(`NewConnect company list has ${ncList.size} companies`);
    const ncLines = boardLines(await fetchText(NC_BOARD), "NewConnect board");
    if (ncLines.length < 250) throw new Error(`NewConnect board has ${ncLines.length} lines`);
    const onBoard = new Set(ncLines.map((line) => line.isin));
    for (const [isin, company] of ncList) {
      if (!onBoard.has(isin)) leftOut.push(`NewConnect ${company.code} ${isin} not on the quote board`);
    }
    // The board leaves the currency blank: NewConnect quotes in zloty.
    for (const line of ncLines) add({ ...line, currency: line.currency || "PLN" }, "NewConnect", "STOCK", ncList.get(line.isin)?.name ?? "");
  }

  // ETFs, ETCs and ETNs.
  if (etps) {
    const lines = etpLines(await fetchText(GPW, "action=GPWQuotationsETF&start=ajaxList&page=etfy"));
    if (lines.length < 20) throw new Error(`GPW ETF board has ${lines.length} lines`);
    const described = etpDescriptions(await fetchText(`${ETF_CARD}${lines[0].isin}`));
    for (const line of lines) add(line, "GPW", productOf(line.code), described.get(line.isin) ?? "", true);
  }

  // GlobalConnect.
  if (globalConnect) {
    const html = await fetchText(
      GC,
      "format=html&lang=PL&offset=0&limit=500&action=GCCompany&start=listAjax&order=gls_nazwa&order_type=ASC&searchText="
    );
    const list = companies(html);
    if (list.size < 20) throw new Error(`GlobalConnect list has ${list.size} companies`);
    for (const [isin, company] of list) {
      if (/\bETF\b/i.test(company.name) || /^ETF/i.test(company.code)) continue;
      const line = { isin, short: company.code, code: company.code.toUpperCase(), currency: "PLN", suspended: false, traded: true };
      add(line, "GlobalConnect", "STOCK", company.name);
    }
  }

  rows.sort(
    (left, right) =>
      left.type.localeCompare(right.type) ||
      left.exchange.localeCompare(right.exchange) ||
      left.ticker.localeCompare(right.ticker)
  );
  return { rows, leftOut };
}

export async function gpwBook(options = {}) {
  return (await gpwBookDetail(options)).rows;
}

// Writes <file> next to the calling scraper (here = import.meta.url) with
// stampRows and withoutObligations applied, and prints the counts.
export async function writeGpwCatalogue(here, file, options = {}) {
  const { rows, leftOut } = await gpwBookDetail(options);
  const kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  report(kept, leftOut);
  return kept;
}

function report(rows, leftOut) {
  const books = new Map();
  for (const row of rows) books.set(`${row.exchange} ${row.type}`, (books.get(`${row.exchange} ${row.type}`) || 0) + 1);
  console.error(
    `${rows.length} listings over ${new Set(rows.map((row) => row.isin)).size} instruments ` +
      `(${[...books].map(([label, count]) => `${count} ${label}`).join(", ")})`
  );
  if (leftOut.length) console.error(`${leftOut.length} lines left out:\n  ${leftOut.join("\n  ")}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { rows, leftOut } = await gpwBookDetail({ globalConnect: process.argv.includes("--global-connect") });
  report(rows, leftOut);
}
