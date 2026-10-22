// Pakistan Stock Exchange listing status, for the PSX brokers' catalogues
// (akd, chase, ktrade, abbasi, standardcapital). Their symbol lists keep companies the exchange has
// delisted or suspended — Apollo Textile (APOT), suspended and winding up,
// last traded on 15 February 2017. Those lines cannot be bought, so the
// scrapers drop them.
//
// The status is the one the PSX data portal prints on each company page
// (https://dps.psx.com.pk/company/<SYMBOL>), kept in assets/psx-status.json.
// Only symbols absent from the exchange's last closing file are looked up:
// a symbol that traded in the session is listed (and its old entry, if
// any, is dropped from the file, so a company that resumed trading comes
// back).
//
// Not tradable:
//   - a status DELISTED, SUSPENDED or NOT FOUND;
//   - a status LISTED whose last trade is more than six months (183 days)
//     older than the file's reading date: the portal prints some dead
//     lines as listed with no flag, Azgard Nine's preference share (ANLPS)
//     last traded on 15 February 2017, Dawood Hercules (DAWH) on 3
//     January 2025;
//   - a symbol with no entry in the file that is on the fallback list
//     below (SUSPENDED_FALLBACK). A symbol with no entry and not on that
//     list is kept.
//
// The fallback list exists because the portal closes the connection on
// every path but its home page since 19 October 2026 (still on 22
// October), so the run of 19 October stopped at HAJT and the companies
// after it were never read. It holds the lines the PSX's own suspension
// list names, "List of Companies / Securities in which Trading is
// suspended under clauses 5.11. & 5B.14 of PSX Regulations", updated
// 02-09-2021 (https://www.psx.com.pk/psx/themes/psx/uploads/Suspension-Updated-_02-9-2021.pdf),
// that have no close today: Trust Investment Bank (TRIBL; PSX extended
// its suspension on 24 July 2026, https://profit.pakistantoday.com.pk/2026/07/24/psx-extends-trading-suspension-in-trust-investment-bank-safa-textiles-shares),
// Pak Industrial & Commercial Leasing, Hamid Textile, Taj Textile,
// Sadoon, Hakkim, Suraj Ghee, Usman Textile, Nina, Zeal Pak, Progressive
// Insurance, Prudential Investment Bank, Regal Ceramics, Kaiser Arts,
// Schon, National Fibres, Mohib, Security Leasing (Pref.); and the lines
// with no price at all and active_symbol false on TradingView's PSX
// scanner (scanner.tradingview.com/pakistan/scan, 22 October 2026):
// SGABL, SPCL, SWL. Companies on the 2021 list that resumed (SFAT, MUBT,
// SANE, HMIM, MFTM, SHCI, SSIC, SLCL, CJPL) have a close today and are not
// on it. A portal entry, once read, takes precedence over the list.
//
//   node psxStatus.mjs           looks up the catalogue symbols not yet in the file
//   node psxStatus.mjs --all     looks them all up again
//
// The portal answers a burst with a firewall page; the script then stops
// and says how many are left, and a later run carries on.

import fs from "node:fs";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const STORE = fileURLToPath(new URL("./assets/psx-status.json", import.meta.url));
const COMPANY = "https://dps.psx.com.pk/company/";
const CLOSING = "https://dps.psx.com.pk/download/mkt_summary/";
const GONE = new Set(["DELISTED", "SUSPENDED", "NOT FOUND"]);
const STALE_DAYS = 183;
// Suspended lines the portal has not been read for (header).
export const SUSPENDED_FALLBACK = new Set([
  "HATM", "HKKT", "KAKL", "MOHE", "NAFL", "NINA", "PICL", "PRIB", "PRIC", "REGAL", "SCHT",
  "SDOT", "SGABL", "SLCPA", "SPCL", "SURAJ", "SWL", "TAJT", "TRIBL", "USMT", "ZELP",
]);

let book = null;
function load() {
  if (book) return book;
  try {
    book = JSON.parse(fs.readFileSync(STORE, "utf8"));
  } catch {
    book = { symbols: {} };
  }
  book.symbols ||= {};
  return book;
}

/** Why the symbol cannot be bought, or "" when it can (header). */
export function psxClosed(symbol) {
  const key = String(symbol || "").trim().toUpperCase();
  const { symbols, readOn } = load();
  const hit = symbols[key];
  if (!hit) return SUSPENDED_FALLBACK.has(key) ? "SUSPENDED (fallback list)" : "";
  if (GONE.has(hit.status)) return hit.status;
  const asOf = Date.parse(readOn || "");
  const last = Date.parse(hit.lastTrade || "");
  if (asOf && last && asOf - last > STALE_DAYS * 86_400_000) return `no trade since ${hit.lastTrade}`;
  return "";
}

/** false when the PSX prints the symbol as delisted, suspended or unknown, or it has not traded for six months. */
export function psxTradable(symbol) {
  return !psxClosed(symbol);
}

/** The PSX status flags of a symbol ("WINDING-UP", "NON-COMPLIANT", ...), or "". */
export function psxFlags(symbol) {
  return load().symbols[String(symbol || "").trim().toUpperCase()]?.flags || "";
}

/** The rows a PSX scraper keeps: every row whose symbol is still tradable. */
export function withoutDelisted(rows) {
  return rows.filter((row) => psxTradable(row.ticker || row.query));
}

// GEM Board lines (symbol GEM...): only accredited investors may trade
// them, which depends on the client, so the row stays with this remark.
// "Only Accredited Investors can participate in the trading of a GEM board
// listed company", and accredited means "Individual investors registered
// with NCCPL having net assets of at least PKR 5 million"; "Investor need
// to inform the broker to be classified as Accredited Investor"
// (https://www.blue-ex.com/corporate/faqs-gemboard, a GEM-listed company's
// FAQ; the PSX's GEM page speaks of "a large base of accredited investors",
// https://www.psx.com.pk/psx/want-to-list/gem).
export const GEM_REMARK = "GEM Board: accredited investors only (net assets of at least PKR 5 million, declared to the broker).";
export const psxGemBoard = (symbol) => /^GEM[A-Z]/.test(String(symbol || "").trim().toUpperCase());

const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

function readCompany(html) {
  const body = text(html);
  const head = (body.match(/REPORTS QUOTE PROFILE EQUITY ANNOUNCEMENTS FINANCIALS RATIOS PAYOUTS REPORTS (.*?) Rs\.[\d,.]+/) || [])[1] || "";
  const asOf = (body.match(/As of \w+, (\w+ \d+, \d{4})/) || [])[1];
  const ldcp = Number(((body.match(/LDCP ([\d,.]+)/) || [])[1] || "").replace(/,/g, ""));
  const status = !head && !asOf ? "NOT FOUND" : /DELISTED/.test(head) ? "DELISTED" : /SUSPENDED/.test(head) ? "SUSPENDED" : "LISTED";
  const flags = ["SUSPENDED", "WINDING-UP", "DELISTED", "NON-COMPLIANT", "DEFAULTER"].filter((w) => head.includes(w)).join(" ") || null;
  const lastTrade = asOf ? new Date(`${asOf} UTC`).toISOString().slice(0, 10) : null;
  return { status, lastTrade, ldcp: ldcp > 0 ? ldcp : null, flags };
}

async function tradedSymbols() {
  for (let back = 0; back < 8; back++) {
    const day = new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
    const response = await fetch(`${CLOSING}${day}.Z`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) continue;
    const zip = Buffer.from(await response.arrayBuffer());
    if (zip.readUInt32LE(0) !== 0x04034b50) continue;
    const lines = zlib.inflateRawSync(zip.subarray(30 + zip.readUInt16LE(26) + zip.readUInt16LE(28))).toString("latin1");
    return { day, symbols: new Set(lines.split(/\r?\n/).map((l) => l.split("|")[1]).filter(Boolean)) };
  }
  throw new Error("aucun fichier de clôture PSX sur les huit derniers jours");
}

async function main() {
  const all = process.argv.includes("--all");
  const { day, symbols: traded } = await tradedSymbols();
  const wanted = new Set();
  for (const folder of ["akd", "chase", "ktrade", "abbasi", "standardcapital"]) {
    const file = fileURLToPath(new URL(`./brokers/${folder}/${folder}-parsed.json`, import.meta.url));
    if (!fs.existsSync(file)) continue;
    for (const row of JSON.parse(fs.readFileSync(file, "utf8"))) {
      const symbol = String(row.ticker || "").trim().toUpperCase();
      if (symbol && !traded.has(symbol)) wanted.add(symbol);
    }
  }
  // The fallback lines are read too, so a portal entry replaces the list.
  for (const symbol of SUSPENDED_FALLBACK) {
    if (traded.has(symbol)) console.error(`${symbol} a été échangé le ${day} : le retirer de SUSPENDED_FALLBACK.`);
    else wanted.add(symbol);
  }
  const store = load();
  // A symbol in the closing file traded: an old entry (suspended, stale)
  // no longer holds.
  for (const symbol of Object.keys(store.symbols)) if (traded.has(symbol)) delete store.symbols[symbol];
  const todo = [...wanted].filter((s) => all || !store.symbols[s]).sort();
  console.error(`${wanted.size} symboles absents de la clôture du ${day}, ${todo.length} à lire.`);
  let read = 0;
  for (const symbol of todo) {
    const response = await fetch(`${COMPANY}${encodeURIComponent(symbol)}`, { headers: { "User-Agent": "Mozilla/5.0" } }).catch(() => null);
    const html = response ? await response.text() : "";
    // The firewall's page is a short XHTML document; a real answer, even a
    // 404, is the portal's own page.
    if (!response || html.length < 20_000) {
      console.error(`le portail refuse après ${read} lectures ; ${todo.length - read} restent.`);
      break;
    }
    store.symbols[symbol] = readCompany(html);
    read += 1;
    await new Promise((r) => setTimeout(r, 1500));
  }
  store.readOn = new Date().toISOString().slice(0, 10);
  store.source = `${COMPANY}<SYMBOL>`;
  store.note = "Status of the PSX catalogue symbols absent from the exchange's closing file.";
  fs.writeFileSync(STORE, JSON.stringify(store, null, 1));
  const gone = Object.keys(store.symbols).filter((symbol) => psxClosed(symbol)).length;
  console.error(`${STORE} : ${Object.keys(store.symbols).length} symboles, ${gone} radiés, suspendus, inconnus ou sans échange depuis ${STALE_DAYS} jours.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
