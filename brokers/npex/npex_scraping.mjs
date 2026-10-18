// NPEX is a Dutch MTF for small and medium companies. Its public
// "Effectenbeurs" page holds one table (wpDataTables, id 1) with every
// instrument on the venue: company, status, kind and a link to its order
// book. The table is read through the same admin-ajax call the page makes,
// with length -1 so the server returns all rows, and the row count must
// match recordsTotal.
//
// Kept: rows with status "Verhandelbaar" and an "Orderboek" link whose kind
// is a share ("Aandeel"), share certificates ("Certificaten", depositary
// receipts) or a fund ("Beleggingsfonds", "Open-end fonds"). Left out:
// bonds and convertibles ("Obligatie ..."), and anything on the closed
// "Private markt" or without a status. There are no ETFs and no tickers;
// the ISIN comes from the order-book page and doubles as the ticker. Euro.
//
//   https://www.npex.nl/effectenbeurs/
//   https://www.npex.nl/wp-admin/admin-ajax.php?action=get_wdtable&table_id=1
//
//   node brokers/npex/npex_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SITE = "https://www.npex.nl";
const PAGE = `${SITE}/effectenbeurs/`;
const TABLE = `${SITE}/wp-admin/admin-ajax.php?action=get_wdtable&table_id=1`;
const WORKERS = 3;

const KINDS = new Map([
  ["aandeel", "STOCK"],
  ["aandelen", "STOCK"],
  ["certificaten", "STOCK"],
  ["beleggingsfonds", "FUND"],
  ["open-end fonds", "FUND"],
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function text(html) {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function request(url, init = {}) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "User-Agent": UA, "Accept-Language": "nl-NL,nl;q=0.9", ...(init.headers || {}) },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
      if (response.status === 404) return "";
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

function absolute(href) {
  return new URL(href, SITE).href;
}

const page = await request(PAGE);
const nonce = (page.match(/name="wdtNonceFrontendServerSide_1" value="([^"]+)"/) || [])[1];
if (!nonce) throw new Error("no table nonce on the page");

const body = JSON.parse(
  await request(TABLE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", Referer: PAGE },
    body: new URLSearchParams({ draw: "1", start: "0", length: "-1", wdtNonce: nonce }).toString(),
  })
);
const table = body.data;
const total = Number(body.recordsTotal);
if (!Array.isArray(table) || !total || table.length !== total) {
  throw new Error(`table announced ${body.recordsTotal} and returned ${table?.length}`);
}

const picked = [];
const skipped = new Map();
for (const cells of table) {
  const name = text(cells[1]);
  const status = text(cells[2]);
  const kind = text(cells[3]);
  const book = text(cells[7]);
  const type = KINDS.get(kind.toLowerCase());
  if (!type || status !== "Verhandelbaar" || book !== "Orderboek") {
    const reason = !type ? kind.replace(/\s+[IVX]+$/, "") || "blank" : status !== "Verhandelbaar" ? status || "no status" : book;
    skipped.set(reason, (skipped.get(reason) || 0) + 1);
    continue;
  }
  const bookHref = (String(cells[7]).match(/href="([^"]+)"/) || [])[1];
  const companyHref = (String(cells[1]).match(/href="([^"]+)"/) || [])[1];
  if (!name || !bookHref) throw new Error(`row ${cells[0]} has no name or order book`);
  picked.push({ id: cells[0], name, kind, type, book: absolute(bookHref.replace(/\\\//g, "/")), company: companyHref ? absolute(companyHref) : "" });
}

let cursor = 0;
async function worker() {
  for (;;) {
    const index = cursor;
    cursor += 1;
    if (index >= picked.length) return;
    const item = picked[index];
    const html = await request(item.book);
    item.isin = (text(html).match(/ISIN:?\s*([A-Z]{2}[A-Z0-9]{9}\d)\b/) || [])[1] || "";
    await sleep(250);
  }
}
await Promise.all(Array.from({ length: WORKERS }, worker));

const rows = [];
const seen = new Set();
for (const item of picked) {
  const key = item.isin || `${item.name}|${item.kind}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const ticker = item.isin || item.name;
  rows.push({
    query: item.name,
    ticker,
    name: item.name,
    exchange: "NPEX",
    currency: "EUR",
    type: item.type,
    isin: item.isin,
    raw: [item.name, item.kind, "NPEX", "EUR", item.isin].filter(Boolean).join(" "),
  });
}

if (rows.length < 5) throw new Error(`only ${rows.length} listings`);
if (!rows.some((row) => row.isin === "NL0000204352")) throw new Error("TABS Holland is missing");

rows.sort((left, right) => left.type.localeCompare(right.type) || left.name.localeCompare(right.name));
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("npex-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const counts = new Map();
for (const row of kept) counts.set(`${row.exchange} ${row.type}`, (counts.get(`${row.exchange} ${row.type}`) || 0) + 1);
console.error(
  `${kept.length} listings of ${total} table rows (${[...counts].map(([key, count]) => `${count} ${key}`).join(", ")}); ` +
    `${kept.filter((row) => row.isin).length} with an ISIN`
);
console.error(`left out ${[...skipped].map(([reason, count]) => `${count} ${reason}`).join(", ")}`);
