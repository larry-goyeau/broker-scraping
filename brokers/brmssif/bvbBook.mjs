// The Bucharest Stock Exchange book, for the brokers that sell every
// tradable line of the BVB (BRM SSIF, Share Invest). The list is the
// exchange's own: its Shares and Fund Units pages, one table per market
// segment, each line with its symbol, ISIN, name, last price and category.
//
//   https://www.bvb.ro/FinancialInstruments/Markets/Shares
//     - "Piata Reglementata" (the regulated main market: Premium, Standard
//       and Int'l categories),
//     - "AeRO" (the multilateral trading system for smaller companies:
//       AeRO Premium, Standard and Baza),
//     - "SMT Intl" (German blue chips traded in lei on the BVB's MTF).
//   https://www.bvb.ro/FinancialInstruments/Markets/FundUnits
//     - ETF and ETF-Int'l lines (ETF), "Units" lines (closed-end
//       alternative investment funds such as STK Emergent, BET-FI Index
//       Invest: FUND, left out by default as in the other place books).
//
// The segment tables are ASP.NET update panels: the first table comes with
// the page, the others with an async postback of the segment button.
//
// Each line's own page says whether it can be traded ("Stare:
// Tranzactionabila") or is suspended ("Stare: Suspendata (08.08.2022 -
// dizolvare si lichidare societate)"); a line that is not tradable stays
// out, as does a line the exchange shows with no trade at all (no price,
// no date). A line that trades rarely but is tradable stays. Being on the
// BVB's special observation list is not a suspension.
//
//   https://www.bvb.ro/FinancialInstruments/Details/FinancialInstrumentsDetails.aspx?s=PRIN
//
// Warrants, certificates (turbos and other structured products), bonds and
// rights are on other BVB pages and are not read. Every table is priced in
// lei ("Pret (RON)"); a table in another currency stops the run.
//
// The crawl (5 tables and about 360 line pages) is kept for 12 hours in the
// system temp folder, so the scrapers run back to back read the BVB once.
// The BVB's TLS handshake hangs with curl on macOS; Node's fetch works.

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = "https://www.bvb.ro";
const SHARES = `${BASE}/FinancialInstruments/Markets/Shares`;
const FUNDS = `${BASE}/FinancialInstruments/Markets/FundUnits`;
const DETAILS = `${BASE}/FinancialInstruments/Details/FinancialInstrumentsDetails.aspx?s=`;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const CONTROL = "ctl00$ctl00$body$rightColumnPlaceHolder$MSCtrl";
const PANEL = `${CONTROL}$updsgm`;
const CACHE = path.join(os.tmpdir(), "bvb-book-cache.json");
const CACHE_HOURS = 12;

// The tables read: page, segment button (none: the table the page opens
// on) and the segment name kept on each row.
const TABLES = [
  { page: SHARES, button: null, segment: "Regulated market" },
  { page: SHARES, button: ["ms3", "AeRO"], segment: "AeRO" },
  { page: SHARES, button: ["ms4", "SMT Intl"], segment: "SMT Intl" },
  { page: FUNDS, button: null, segment: "Regulated market" },
  { page: FUNDS, button: ["ms3", "AeRO"], segment: "AeRO" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function text(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function load(url, init = {}) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, Accept: "text/html", ...(init.headers || {}) },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      return { html: await response.text(), cookies: response.headers.getSetCookie?.() || [] };
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(2000 * 2 ** attempt);
  }
  throw new Error(last);
}

// The HTML of one segment table: the page itself, or the async postback
// of the segment button.
async function table({ page, button }) {
  const first = await load(page);
  if (!button) return first.html;
  await sleep(1000);
  const form = new URLSearchParams();
  form.set("ctl00$ctl00$MasterScriptManager", `${PANEL}|${CONTROL}$${button[0]}`);
  for (const [, name, value] of first.html.matchAll(/<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"/g)) {
    form.set(name, value.replace(/&amp;/g, "&"));
  }
  form.set("__ASYNCPOST", "true");
  form.set(`${CONTROL}$${button[0]}`, button[1]);
  const cookie = first.cookies.map((line) => line.split(";")[0]).join("; ");
  const { html } = await load(page, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-MicrosoftAjax": "Delta=true",
      "X-Requested-With": "XMLHttpRequest",
      Referer: page,
      Cookie: cookie,
    },
    body: form,
  });
  const active = html.match(/value="([^"]*)" id="ms\d" disabled="disabled"/);
  if (!active || active[1] !== button[1]) throw new Error(`${page}: segment ${button[1]} did not open`);
  return html;
}

function parseTable(html, { page, segment }) {
  const grid = html.slice(html.indexOf('id="gv"'));
  const header = grid.match(/Pret \(([A-Z]{3})\)/);
  if (!header) throw new Error(`${page} ${segment}: no price column`);
  if (header[1] !== "RON") throw new Error(`${page} ${segment}: priced in ${header[1]}`);
  const lines = [];
  for (const [, row] of grid.matchAll(/<tr>(\s*<td>[\s\S]*?)<\/tr>/g)) {
    const symbol = row.match(/Details\.aspx\?s=([^"&]+)"/)?.[1];
    const isin = row.match(/<p[^>]*>\s*([A-Z]{2}[A-Z0-9]{9}\d)\s*<\/p>/)?.[1] || "";
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => text(cell[1]));
    if (!symbol || cells.length < 6) throw new Error(`${page} ${segment}: unreadable row ${text(row).slice(0, 80)}`);
    lines.push({
      symbol: decodeURIComponent(symbol),
      isin,
      name: cells[1],
      price: cells[2],
      date: cells[4],
      category: cells[5],
      segment,
      page: page === FUNDS ? "fund units" : "shares",
    });
  }
  return lines;
}

// "Tip", "Segment", "Categorie" and "Stare" from a line's own page.
async function status(symbol) {
  const { html } = await load(DETAILS + encodeURIComponent(symbol));
  const body = text(html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, ""));
  const pick = (label, next) => body.match(new RegExp(`${label}: (.*?) ${next}:`))?.[1]?.trim() || "";
  const state = body.match(/Stare: (Tranzactionabila|Suspendata(?: \([^)]*\))?|\S+)/)?.[1] || "";
  return {
    kind: pick("Tip", "Segment"),
    market: pick("Segment", "Categorie"),
    state,
    pageIsin: body.match(/ISIN: ([A-Z]{2}[A-Z0-9]{9}\d)/)?.[1] || "",
  };
}

async function crawl() {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    if (Date.now() - cached.at < CACHE_HOURS * 3600_000 && cached.lines?.length) {
      console.error(`BVB book read from ${CACHE}`);
      return cached.lines;
    }
  } catch {}
  const lines = [];
  for (const spec of TABLES) {
    const found = parseTable(await table(spec), spec);
    console.error(`BVB ${spec.page === FUNDS ? "fund units" : "shares"}, ${spec.segment}: ${found.length} lines`);
    lines.push(...found);
    await sleep(1000);
  }
  // Two line pages at a time, with a pause after each.
  let next = 0;
  await Promise.all(
    [0, 1].map(async () => {
      while (next < lines.length) {
        const line = lines[next];
        next += 1;
        Object.assign(line, await status(line.symbol));
        await sleep(400);
      }
    })
  );
  fs.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), lines }));
  return lines;
}

// Every tradable BVB line, as catalogue rows sorted by type then ticker;
// plus the suspended lines, the never-traded lines and the other lines
// left out.
export async function bvbBook() {
  const lines = await crawl();
  const listed = [];
  const suspended = [];
  const neverTraded = [];
  const leftOut = [];
  const seen = new Set();

  for (const line of lines) {
    if (seen.has(line.symbol)) throw new Error(`${line.symbol} is listed twice`);
    seen.add(line.symbol);
    if (!line.state) throw new Error(`${line.symbol}: no state on its page`);
    if (line.state !== "Tranzactionabila") {
      suspended.push(`${line.symbol} ${line.state}`);
      continue;
    }
    if (!line.price || !line.date) {
      neverTraded.push(line.symbol);
      continue;
    }
    let type;
    if (line.page === "shares") {
      if (line.kind !== "Actiuni") throw new Error(`${line.symbol} on the shares page is ${line.kind}`);
      type = "STOCK";
    } else {
      if (line.kind !== "Unitati de fond") throw new Error(`${line.symbol} on the fund units page is ${line.kind}`);
      type = /^ETF/.test(line.category) ? "ETF" : "FUND";
    }
    if (line.isin && line.pageIsin && line.isin !== line.pageIsin) throw new Error(`${line.symbol}: ISIN ${line.isin} in the table, ${line.pageIsin} on its page`);
    const isin = line.isin || line.pageIsin || "";
    if (!isin) {
      leftOut.push(`${line.symbol} no ISIN`);
      continue;
    }
    listed.push({
      query: line.symbol,
      ticker: line.symbol,
      name: line.name,
      exchange: "Bucharest Stock Exchange",
      mic: "XBSE",
      currency: "RON",
      type,
      isin,
      segment: line.segment,
      raw: [line.symbol, isin, line.name, "BVB", line.segment, line.category, `last trade ${line.date}`].join(" | "),
    });
  }

  listed.sort((left, right) => left.type.localeCompare(right.type) || left.ticker.localeCompare(right.ticker));
  for (const ticker of ["TLV", "SNP", "H2O", "DIGI", "2P", "DBK", "TVBETETF"]) {
    if (!listed.some((row) => row.ticker === ticker)) throw new Error(`missing ${ticker}`);
  }
  const count = (type) => listed.filter((row) => row.type === type).length;
  if (count("STOCK") < 250) throw new Error(`only ${count("STOCK")} shares`);
  if (count("ETF") < 8) throw new Error(`only ${count("ETF")} ETFs`);
  if (leftOut.length) console.error(`BVB: ${leftOut.length} lines left out: ${leftOut.join(", ")}`);
  return { listed, suspended, neverTraded, leftOut };
}

// Writes <file> next to the calling scraper. `types` keeps only those row
// types (FUND: the closed-end fund units); `segments` keeps only lines of
// those segments ("Regulated market", "AeRO", "SMT Intl").
export async function writeBvbCatalogue(
  here,
  file,
  { types = ["STOCK", "ETF"], segments = ["Regulated market", "AeRO", "SMT Intl"] } = {}
) {
  const { listed, suspended, neverTraded } = await bvbBook();
  const rows = listed
    .filter((row) => types.includes(row.type) && segments.includes(row.segment))
    .map(({ segment, ...row }) => row);
  const kept = stampRows(withoutObligations(rows));
  fs.writeFileSync(new URL(file, here), JSON.stringify(kept, null, 2));
  const count = (type) => kept.filter((row) => row.type === type).length;
  console.error(
    `${kept.length} listings over ${new Set(kept.map((row) => row.isin)).size} instruments ` +
      `(${count("STOCK")} STOCK, ${count("ETF")} ETF, ${count("FUND")} FUND)`
  );
  console.error(`${suspended.length} suspended and ${neverTraded.length} never-traded lines left out`);
  const other = listed.length - rows.length;
  if (other) console.error(`${other} lines of another type or segment left out`);
  if (kept.length < rows.length) console.error(`${rows.length - kept.length} bonds left out`);
  return kept;
}

// node brokers/brmssif/bvbBook.mjs prints the counts.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { listed, suspended, neverTraded, leftOut } = await bvbBook();
  const tally = {};
  for (const row of listed) tally[`${row.segment} ${row.type}`] = (tally[`${row.segment} ${row.type}`] || 0) + 1;
  console.log(JSON.stringify({ rows: listed.length, tally, suspended, neverTraded, leftOut }, null, 2));
}
