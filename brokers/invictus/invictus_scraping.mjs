// Invictus Capital & Finance shows, on its home page, a live BRVM ticker
// with every line of the regional exchange: the code, the last price and the
// day's change. The shares are the plain codes; the bonds are the codes with
// a dot (EOS.O30, TPCI.O101, ...) and are not written. The BRVM lists no
// ETF. The ticker still carries two codes that left the exchange, SVOC
// (Movis CI, delisted in June 2025 after its buyout) and TTRC (Trituraf,
// in liquidation); they quote at a frozen price and are left out. SEMC
// (Eviosys Packaging Siem CI) and SICC (Sicor CI) are suspended from
// trading (BRVM quotes, as Coris Bourse's feed marks them, 2026-10-19) and
// are left out too. It gives no name and no ISIN, so the name is the code.
//
// The host's TLS certificate is sent without its intermediate. This
// fetches that intermediate from the address the certificate itself names
// (DigiCert), checks it is that CA, and adds it to the trusted set; the
// chain is still verified.
//
//   https://invictuscapfin.com/
//   http://cacerts.digicert.com/ThawteEVRSACAG2.crt
//
//   node brokers/invictus/invictus_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import crypto from "node:crypto";
import fs from "node:fs";
import tls from "node:tls";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PAGE = "https://invictuscapfin.com/";
const INTERMEDIATE = "http://cacerts.digicert.com/ThawteEVRSACAG2.crt";
const DELISTED = {
  SVOC: "Movis CI, delisted June 2025",
  TTRC: "Trituraf, in liquidation",
  SEMC: "Eviosys Packaging Siem CI, suspended",
  SICC: "Sicor CI, suspended",
};
const FLOOR = 45;
const KNOWN = ["SNTS", "ORAC", "SGBC"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

async function trustIntermediate() {
  const response = await fetch(INTERMEDIATE, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`${response.status} ${INTERMEDIATE}`);
  const intermediate = new crypto.X509Certificate(Buffer.from(await response.arrayBuffer()));
  if (!/CN=Thawte EV RSA CA G2/.test(intermediate.subject)) {
    throw new Error(`${INTERMEDIATE} is ${intermediate.subject.replace(/\n/g, ", ")}`);
  }
  tls.setDefaultCACertificates([...tls.getCACertificates("default"), intermediate.toString()]);
}

await trustIntermediate();

// <marquee><span style="color:white">SNTS 43300</span> <span style="color:red"> -0.46<span> % </span> ...
const page = await get(PAGE);
const marquee = page.match(/<marquee>([\s\S]*?)<\/marquee>/)?.[1] || "";
const items = [...marquee.matchAll(/<span style="color:white">([A-Z0-9.]+) ([0-9.,]+)<\/span>\s*<span[^>]*>\s*([-0-9.,]+)/g)];
if (items.length < FLOOR) throw new Error(`ticker parsed ${items.length} lines`);

const rows = [];
const seen = new Set();
const bonds = [];
const leftOut = [];
for (const [, code, price, change] of items) {
  const ticker = code.trim().toUpperCase();
  if (ticker.includes(".")) {
    bonds.push(ticker);
    continue;
  }
  if (seen.has(ticker)) continue;
  seen.add(ticker);
  if (DELISTED[ticker]) {
    leftOut.push(ticker);
    continue;
  }
  rows.push({
    query: ticker,
    ticker,
    name: ticker,
    exchange: "BRVM",
    mic: "XBRV",
    currency: "XOF",
    type: "STOCK",
    isin: "",
    raw: [ticker, price, `${change}%`].join(" | "),
  });
}

if (rows.length < FLOOR) throw new Error(`only ${rows.length} BRVM shares in the ticker`);
for (const ticker of KNOWN) if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);

rows.sort((left, right) => left.ticker.localeCompare(right.ticker));
fs.writeFileSync(new URL("invictus-parsed.json", import.meta.url), JSON.stringify(stampRows(withoutObligations(rows)), null, 2));
console.error({ "BRVM STOCK": rows.length, bondsLeftOut: bonds.length, delistedLeftOut: leftOut });
