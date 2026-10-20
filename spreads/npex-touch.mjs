// NPEX cash touch. Bid and ask are the best "Buy" and best "Sell" lines of
// each instrument's public order-book page (the `book` the NPEX scraper
// keeps on its rows); the last is the page's "Huidige koers". Prices are
// in euros with a decimal comma. A one-sided book keeps no touch; an
// open-end fund dealt at its NAV has no order book and is not read.
//
//   https://www.npex.nl/effectenbeurs/<company>/aanbod/orderboek/
//
// Trading runs 10:00–16:00 Amsterdam on business days. Orders rest in the
// book outside that window but cannot execute, so the book is read only
// inside it; outside, nothing is written. The reading is npex-touch.json.
// spread.mjs copies it into spread.json (`--only=npex-touch`); prices.mjs
// takes the last.
//
//   node spreads/npex-touch.mjs

import fs from "node:fs";
import { fileURLToPath } from "node:url";

const STORE = fileURLToPath(new URL("./npex-touch.json", import.meta.url));
const CATALOGUE = fileURLToPath(new URL("../brokers/npex/npex-parsed.json", import.meta.url));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const amsterdam = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit", day: "2-digit" });
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

const euro = (value) => {
  const n = Number(String(value || "").replace(/\./g, "").replace(",", "."));
  return n > 0 ? n : null;
};

const bpFrom = (bid, ask) => {
  if (!(bid > 0) || !(ask > 0) || ask < bid) return null;
  const bp = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  return bp > 0 ? Number(bp.toFixed(2)) : null;
};

// "Buy Aantal Volume Prijs 1 5 72,00 … Sell Aantal Volume Prijs 1 8 88,00 …"
// Each line is orders, volume, price. The book is sorted best first.
function readBook(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");
  const side = (label, until) => {
    const block = (text.match(new RegExp(`${label} Aantal Volume Prijs (.*?) ${until}`)) || [])[1] || "";
    return [...block.matchAll(/(\d+) (\d+) (\d{1,3}(?:\.\d{3})*,\d{2})/g)].map((m) => euro(m[3])).filter(Boolean);
  };
  const bids = side("Buy", "Sell");
  const asks = side("Sell", "Transacties");
  return {
    isin: (text.match(/ISIN:?\s*([A-Z]{2}[A-Z0-9]{9}\d)\b/) || [])[1] || null,
    last: euro((text.match(/Huidige koers € ([\d.,]+)/) || [])[1]),
    bid: bids.length ? Math.max(...bids) : null,
    ask: asks.length ? Math.min(...asks) : null,
  };
}

const now = new Date();
const local = Object.fromEntries(
  new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Amsterdam", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now)
    .map((p) => [p.type, p.value])
);
const minutes = Number(local.hour) * 60 + Number(local.minute);
if (!["Mon", "Tue", "Wed", "Thu", "Fri"].includes(local.weekday) || minutes < 10 * 60 || minutes >= 16 * 60) {
  console.error(`hors séance, Amsterdam ${local.weekday} ${local.hour}:${local.minute}. Rien n'est écrit.`);
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(CATALOGUE, "utf8")).filter((r) => r.book && r.isin);
const found = [];
let oneSided = 0;
for (const row of rows) {
  const response = await fetch(row.book, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(45_000) });
  if (!response.ok) throw new Error(`${row.book} : ${response.status}`);
  const book = readBook(await response.text());
  if (book.isin && book.isin !== row.isin) throw new Error(`${row.book} prints ${book.isin}, not ${row.isin}`);
  const bp = bpFrom(book.bid, book.ask);
  if (bp == null) oneSided += 1;
  found.push({
    isin: row.isin,
    mic: "NPEX",
    code: row.name,
    ...(book.bid ? { bid: book.bid } : {}),
    ...(book.ask ? { ask: book.ask } : {}),
    ...(book.last ? { last: book.last } : {}),
    ...(bp != null ? { bp } : {}),
    currencies: ["EUR"],
    stamp: `${amsterdam.format(now)} ${clock.format(now)}`,
    url: row.book,
  });
  await new Promise((r) => setTimeout(r, 500));
}

found.sort((a, b) => a.code.localeCompare(b.code));
if (!found.length) {
  console.error("aucun carnet NPEX lu.");
  process.exit(1);
}
fs.writeFileSync(STORE, JSON.stringify({ at: now.toISOString(), date: amsterdam.format(now), rows: found, oneSided }, null, 2));
console.error(`${STORE} : ${found.length} carnets, ${found.length - oneSided} touches à deux côtés, ${oneSided} à un seul côté.`);
