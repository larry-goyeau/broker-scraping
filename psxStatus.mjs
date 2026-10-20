// Pakistan Stock Exchange listing status, for the PSX brokers' catalogues
// (akd, chase, ktrade). Their symbol lists keep companies the exchange has
// delisted or suspended — Apollo Textile (APOT), suspended and winding up,
// last traded on 15 February 2017. Those lines cannot be bought, so the
// scrapers drop them.
//
// The status is the one the PSX data portal prints on each company page
// (https://dps.psx.com.pk/company/<SYMBOL>), kept in assets/psx-status.json.
// Only symbols absent from the exchange's last closing file are looked up:
// a symbol that traded in the session is listed. A symbol never looked up
// is kept.
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

/** false when the PSX prints the symbol as delisted, suspended or unknown. */
export function psxTradable(symbol) {
  const hit = load().symbols[String(symbol || "").trim().toUpperCase()];
  return !hit || !GONE.has(hit.status);
}

/** The rows a PSX scraper keeps: every row whose symbol is still tradable. */
export function withoutDelisted(rows) {
  return rows.filter((row) => psxTradable(row.ticker || row.query));
}

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
  for (const folder of ["akd", "chase", "ktrade"]) {
    const file = fileURLToPath(new URL(`./brokers/${folder}/${folder}-parsed.json`, import.meta.url));
    if (!fs.existsSync(file)) continue;
    for (const row of JSON.parse(fs.readFileSync(file, "utf8"))) {
      const symbol = String(row.ticker || "").trim().toUpperCase();
      if (symbol && !traded.has(symbol)) wanted.add(symbol);
    }
  }
  const store = load();
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
  const gone = Object.values(store.symbols).filter((v) => GONE.has(v.status)).length;
  console.error(`${STORE} : ${Object.keys(store.symbols).length} symboles, ${gone} radiés, suspendus ou inconnus.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
