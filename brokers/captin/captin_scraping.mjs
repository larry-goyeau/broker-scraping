// What Captin sells in shares, with no login. Captin B.V. (Amsterdam) runs
// two books. Captin MTF (MIC CPTX) is its own venue for unlisted Dutch
// issuers; captin.com/listings shows every issuer on it, and each issuer
// page prints its instruments with the ISIN. Captin Broker only passes
// orders in Triodos Bank depositary receipts to another broker on Euronext
// Amsterdam: "Through Captin Broker you cannot trade on other trading
// venues" (support article 30559492981021), and its order agreement is the
// "Triodos Depository Receipts Order Processing Agreement" (download
// Captin-Broker-NL-ovk-vrw-ENG.pdf). So the restriction in broker-list.json
// ("Triodos Bank depositary receipts only") holds, and it is title-based.
//
// The listings page is read, then every issuer page. An issuer page that
// says its receipts are tradable on Euronext Amsterdam (Triodos, since 18
// June 2025) gets an Euronext row, checked against the Euronext Amsterdam
// share list for the symbol; trading on the MTF stopped for it ("The last
// trading round on the MTF platform is expected to take place on 11 June"),
// so it gets no CPTX row. Every other depositary receipt is a CPTX row in
// euro, with the ISIN as ticker (the MTF has no symbols).
//
// Left out: bonds (MKB Obligaties, WindShareFund ClimateBonds), MKB
// Aandelen (certificates of a fund, MKB Fonds N.V.), and FromFarmers
// "Voerequivalenten" (an allocation key of a cooperative, not a share,
// tradable by its members only). An instrument of another kind stops the
// run. There is no ETF.
//
// Two limits depend on the client, not the title, so the rows stay:
// Captin Broker takes no new Triodos clients ("New parties interested in
// trading in Triodos Bank DRs will be requested to contact another
// broker"), and HZPC receipts are open only to holders approved by
// Association HZPC (about 1,900 people, information document Oct 2023).
//
//   https://captin.com/listings/
//   https://captin.com/listings/<issuer>/   (triodos, hzpc, forfarmers, mkb-fonds-nv, mkb-mixfonds-vi-2022, windsharefund-i)
//   https://support.captin.com/api/v2/help_center/en-gb/articles/30559492981021.json
//   https://support.captin.com/api/v2/help_center/en-gb/articles/27886424729245.json
//   https://captin.com/downloads/gb/Captin-Broker-NL-ovk-vrw-ENG.pdf
//   https://captin.com/downloads/listings/hzpc/en/Information-Document-MTF-listing-Certificates-Association-HZPC-Oct-2023.pdf
//   https://live.euronext.com/en/pd_es/data/stocks/download?mics=XAMS
//   https://support.captin.com/api/v2/help_center/en-gb/articles/10470045920541.json   (cost overview: EUR 5.00 + 0.30% per order)
//
//   node brokers/captin/captin_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";

const exec = promisify(execFile);
const SITE = "https://captin.com";
const LISTINGS = `${SITE}/listings/`;
const EURONEXT = "https://live.euronext.com/en/pd_es/data/stocks/download?mics=XAMS";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/126 Safari/537.36";
const CPTX = "Captin Trading Exchange";
const XAMS = "Euronext Amsterdam";

async function getText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const { stdout } = await exec("curl", ["-fsSL", "--max-time", "60", "-A", UA, url], { maxBuffer: 64_000_000, encoding: "utf8" });
      return stdout;
    } catch (error) {
      last = String(error.stderr || error.message || error).trim();
    }
    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
  }
  throw new Error(last || url);
}

function clean(text) {
  return String(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// One card per issuer: its instruments (h4) and the link to its page.
function issuers(html) {
  const cards = [...html.matchAll(/<article class="[^"]*\bnoteringen\b[^"]*">([\s\S]*?)<\/article>\s*<a href="https:\/\/captin\.com\/listings\/([a-z0-9-]+)\/">/g)];
  if (cards.length < 4) throw new Error(`Captin listings page shows ${cards.length} issuers`);
  return cards.map(([, body, slug]) => {
    const issuer = clean(body.match(/<h3>([\s\S]*?)<\/h3>/)?.[1] || "");
    const names = [...body.matchAll(/<h4>([\s\S]*?)<\/h4>/g)].map((match) => clean(match[1]));
    if (!issuer || !names.length) throw new Error(`unreadable issuer card ${slug}`);
    if (/<span class="price-main">(?!€|-)/.test(body)) throw new Error(`${slug} quotes a price that is not in euro`);
    return { slug, issuer, names };
  });
}

// One tab per instrument: an <h3> name, then text, then the ISIN span. The
// name is the last <h3> before each span.
function instruments(html, slug) {
  const found = [];
  let floor = 0;
  for (const match of html.matchAll(/<span class="listings-isin">\s*Isin:\s*([A-Z0-9]+)\s*<\/span>/g)) {
    const start = html.lastIndexOf("<h3>", match.index);
    if (start < floor) throw new Error(`${slug}: ISIN ${match[1]} has no name of its own`);
    const name = clean(html.slice(start + 4, html.indexOf("</h3>", start)));
    found.push({ name, isin: match[1].trim() });
    floor = match.index;
  }
  if (!found.length) throw new Error(`${slug} page prints no instrument`);
  for (const { name, isin } of found) {
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin)) throw new Error(`${slug}: ${name} has ISIN ${isin}`);
  }
  return found;
}

function kind(name) {
  if (/obligatie|bond/i.test(name)) return "bond";
  if (/voerequivalent/i.test(name)) return "cooperative allocation units";
  if (/^MKB Aandelen$/i.test(name)) return "fund certificates";
  if (/depositary receipts?|depository receipts?|\bDR\b/i.test(name)) return "STOCK";
  throw new Error(`unknown Captin instrument "${name}"`);
}

function euronextShares(csv) {
  const lines = csv.split(/\r?\n/);
  if (!/^﻿?Name;ISIN;Symbol;Market;Currency/.test(lines[0] || "")) throw new Error("Euronext share list changed shape");
  const book = new Map();
  for (const line of lines.slice(1)) {
    const cells = line.split(";").map((cell) => cell.replace(/^"|"$/g, "").trim());
    if (/^[A-Z]{2}[A-Z0-9]{10}$/.test(cells[1] || "")) book.set(`${cells[1]} ${cells[4]}`, { name: cells[0], symbol: cells[2], market: cells[3], currency: cells[4] });
  }
  if (book.size < 80) throw new Error(`Euronext Amsterdam list has ${book.size} shares`);
  return book;
}

const cards = issuers(await getText(LISTINGS));
let euronext = null;
const rows = [];
const leftOut = [];
const seen = new Set();

for (const card of cards) {
  const page = await getText(`${LISTINGS}${card.slug}/`);
  const items = instruments(page, card.slug);
  for (const name of card.names) {
    if (!items.some((item) => item.name === name)) throw new Error(`${card.slug}: card lists "${name}", its page does not`);
  }
  const onEuronext = /tradable (?:in|on) Euronext Amsterdam/i.test(clean(page));
  for (const { name, isin } of items) {
    const what = kind(name);
    if (what !== "STOCK") {
      leftOut.push(`${name} (${what})`);
      continue;
    }
    if (seen.has(isin)) throw new Error(`repeated ${isin}`);
    seen.add(isin);
    if (onEuronext) {
      euronext ??= euronextShares(await getText(EURONEXT));
      const line = euronext.get(`${isin} EUR`);
      if (!line || line.market !== XAMS) throw new Error(`${name} ${isin} is not on the Euronext Amsterdam list`);
      rows.push({
        query: line.symbol,
        ticker: line.symbol,
        name,
        exchange: XAMS,
        currency: "EUR",
        type: "STOCK",
        isin,
        mic: "XAMS",
        raw: [line.symbol, name, card.issuer, XAMS, "EUR", isin, "STOCK"].join(" "),
      });
    } else {
      rows.push({
        query: isin,
        ticker: isin,
        name,
        exchange: CPTX,
        currency: "EUR",
        type: "STOCK",
        isin,
        mic: "CPTX",
        raw: [name, card.issuer, CPTX, "EUR", isin, "STOCK"].join(" "),
      });
    }
  }
}

if (!rows.some((row) => row.mic === "XAMS")) throw new Error("no Triodos line on Euronext Amsterdam");
if (!rows.some((row) => row.mic === "CPTX")) throw new Error("no share left on Captin MTF");

rows.sort((left, right) => left.exchange.localeCompare(right.exchange) || left.name.localeCompare(right.name));
fs.writeFileSync(new URL("captin-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
const byPlace = {};
for (const row of rows) byPlace[row.exchange] = (byPlace[row.exchange] || 0) + 1;
console.error(`${rows.length} listings (${rows.length} STOCK; ${Object.entries(byPlace).map(([place, count]) => `${place} ${count}`).join(", ")}) from ${cards.length} issuers; left out ${leftOut.length}: ${leftOut.join(", ")}`);
