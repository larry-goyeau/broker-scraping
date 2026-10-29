// What Readings Investments sells online, with no login: every share and
// ETF on the Nigerian Exchange. Its home page says "Sign up for readTrader
// and become your own Stockbroker. Get access to real time market feeds to
// enable you make informed decisions and execute trades at your own best
// prices". No page excludes a board, a segment or ETFs, and none names a
// list of its own, so the book is the exchange's whole listing of the day,
// read by ../morgancapital/ngxWhole.mjs (shares, listed REITs and ETFs;
// closed-end funds, suspended and delisting lines left out, as written
// there).
//
// NASD OTC is left out. The broker-list row gives it with no restriction,
// and the home page says "We are active on all trading platforms: NGX,
// NASD, and Lagos Commodities & Futures Exchange", but no page offers NASD
// on readTrader: the account form has the client tick an "EXCHANGE
// PLATFORM NSE [ ] NASD [ ]" and orders "may be submitted by telephone,
// SMS ..., facsimile, e-mail or via an internet account", without saying
// which market the internet account reaches. Under the online-only rule
// NASD is not written; nor are commodities, bonds or sukuk. Everything
// trades in naira.
//
// Fees: the individual account opening form (its brokerage agreement),
// "FEES AND COMMISSION": "BUY SEC Fee: 0.3% of consideration, Broker
// Commission: 1.35% + 7.5% (VAT), Stamp Duty: 0.08%, SMS Alert: N4.30" and
// on a sale the NSE and CSCS fees of 0.3% + VAT each with the same
// commission. The PDF is read with PyMuPDF (pip install pymupdf), as
// ../morgancapital/ngxWhole.mjs does. The run checks these sentences.
//
//   https://readingsinvestmentsltd.com/
//   https://readingsinvestmentsltd.com/docs/CreateIndividualAccount.pdf
//
//   node brokers/readings/readings_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { ngxWhole, PLACE } from "../morgancapital/ngxWhole.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EVIDENCE = {
  "https://readingsinvestmentsltd.com/": [
    /Sign up for readTrader and become your own Stockbroker/,
    /execute trades at your own best prices/,
  ],
};
const FORM = "https://readingsinvestmentsltd.com/docs/CreateIndividualAccount.pdf";
const FORM_SAYS = [
  /FEES AND COMMISSION/,
  /BUY SEC Fee: 0\.3% of consideration, Broker Commission: 1\.35% \+ 7\.5% \(VAT\), Stamp Duty: 0\.08%/,
  /SELL NSE Fee: ?0\.3% \+7\.5%\(VAT\), CSCS Fee: 0\.3% ?\+ ?7\.5%\(VAT\), Broker Commission: 1\.35% \+ 7\.5% \(VAT\)/,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
      if (response.ok) return response.text();
      last = `${response.status} ${url}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
}

const plain = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#0?39;|&rsquo;|&#8217;/g, "'")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/\s+/g, " ");

for (const [url, patterns] of Object.entries(EVIDENCE)) {
  const text = plain(await fetchText(url));
  for (const pattern of patterns) {
    if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
  }
  await sleep(500);
}

// The account form: its text, read with PyMuPDF.
const formBytes = await (async () => {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(FORM, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${response.status} ${FORM}`;
    } catch (error) {
      last = String(error.message || error);
    }
    await sleep(800 * (attempt + 1));
  }
  throw new Error(last);
})();
if (formBytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`${FORM} is not a PDF`);
const python = spawnSync(
  "python3",
  ["-c", "import sys, fitz\nd = fitz.open(stream=sys.stdin.buffer.read(), filetype='pdf')\nsys.stdout.write(' '.join(p.get_text() for p in d))"],
  { input: formBytes, maxBuffer: 64 * 1024 * 1024 }
);
if (python.error || python.status !== 0) {
  const detail = python.stderr?.toString() || python.error?.message || "";
  throw new Error(detail.includes("No module named 'fitz'") ? "PyMuPDF is missing: pip install pymupdf" : detail.slice(0, 400));
}
const formText = python.stdout.toString().replace(/\s+/g, " ");
for (const pattern of FORM_SAYS) {
  if (!pattern.test(formText)) throw new Error(`${FORM} no longer says ${pattern}`);
}

const { rows, day, dolDay, dropped, leftOut } = await ngxWhole();
const kept = stampRows(withoutObligations(rows));
fs.writeFileSync(new URL("readings-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

const count = { STOCK: 0, ETF: 0 };
for (const row of kept) count[row.type] = (count[row.type] || 0) + 1;
console.error(
  `readings: ${kept.length} rows (${day}, Daily Official List ${dolDay}), ${PLACE} ${count.STOCK} STOCK, ${count.ETF} ETF; ` +
    `ISIN ${kept.filter((row) => row.isin).length}. Dropped ${dropped.length} suspended or delisting: ` +
    `${dropped.map((line) => line.ticker).join(", ") || "none"}. Left out: ` +
    `${[...leftOut].map(([label, value]) => `${value} ${label}`).join(", ") || "none"}.`
);
