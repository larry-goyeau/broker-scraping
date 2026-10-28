// What Superhero (Superhero Markets Pty Ltd for Australian shares,
// Superhero Securities Limited for US shares, with Apex Clearing as US
// custodian) sells in shares and ETFs, with no login. It publishes no list
// of titles: its pages name the exchanges and price each market.
//
//   Pricing page, Aussie shares table: "Exchanges Available ASX, CBOE".
//   Terms and Conditions (v5.1, 15 October 2026), 10.6 a.: "Buy and sell
//   orders can be placed for all available Exchange listed Securities
//   (including on ASX, Cboe Australia, NASDAQ, NYSE, ARC, AMEX and BZX)
//   available on the Superhero Platform."
//   Home/invest: "Shares, ETFs, crypto and more."
//   Fee schedule (9 August 2026): "Trading Account Brokerage (ASX) A$2
//   brokerage for all trades up to A$20,000 or 0.01% for trades above
//   A$20,000"; "US Trading Account Brokerage US$2 brokerage for all trades
//   up to US$20,000 or 0.01% for trades above US$20,000".
//
//   https://www.superhero.com.au/invest/pricing/
//   https://docs.superhero.com.au/guides/Superhero+Terms+Conditions.pdf
//   https://docs.superhero.com.au/guides/Superhero+Fee+Schedule.pdf
//
// No page excludes a board, a kind of share or ETF, or states a number of
// titles (short selling is refused, which removes no title). So:
// - Australia: the whole ASX book (../sequoiadirect/asxBook.mjs: every
//   quoted share and exchange-traded product, AUD, less suspended and
//   delisted codes, options, warrants, hybrids, preference shares and
//   partly-paid lines), and Cboe Australia: a second row for each of those
//   ASX lines that Cboe quotes for on-market trading, and the funds listed
//   on Cboe itself (../netwealth/australia.mjs). Same ISIN on both.
// - United States: the whole US exchange book (../wellstrade/usBook.mjs),
//   one row per title on its primary listing. The T&Cs name NASDAQ, NYSE,
//   Arca, AMEX and BZX after "including", so the country's exchanges are
//   kept (the Texas lines too). No OTC lines.
// broker-list.json gives ASX, Cboe Australia and United States.
//
// The PDFs are read with PyMuPDF (pip install pymupdf), as
// ../morgancapital/ngxWhole.mjs does.
//
//   node brokers/superhero/superhero_scraping.mjs

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { australianRows, fetchWith, logCounts, pageText } from "../netwealth/australia.mjs";
import { asxBook } from "../sequoiadirect/asxBook.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const PRICING = "https://www.superhero.com.au/invest/pricing/";
const TERMS = "https://docs.superhero.com.au/guides/Superhero+Terms+Conditions.pdf";
const FEES = "https://docs.superhero.com.au/guides/Superhero+Fee+Schedule.pdf";

function pdfText(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "superhero-"));
  const file = path.join(dir, "doc.pdf");
  fs.writeFileSync(file, bytes);
  try {
    const python = spawnSync("python3", ["-c", "import fitz, sys\nsys.stdout.write(' '.join(page.get_text() for page in fitz.open(sys.argv[1])))", file], {
      encoding: "utf8",
      maxBuffer: 64 << 20,
      timeout: 120_000,
    });
    if (python.status !== 0) throw new Error(`could not read the PDF: ${(python.stderr || "").trim().slice(0, 300)}`);
    return python.stdout.replace(/[​ ]/g, " ").replace(/\s+/g, " ");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const pricing = pageText(await fetchWith(PRICING));
if (!/Exchanges Available ASX, CBOE/.test(pricing)) throw new Error(`${PRICING} no longer says "Exchanges Available ASX, CBOE"`);
const terms = pdfText(await fetchWith(TERMS, { kind: "bytes" }));
if (!/Buy and sell orders can be placed for all available Exchange listed Securities \(including on ASX, Cboe Australia, NASDAQ, NYSE, ARC, AMEX and BZX\)/.test(terms)) {
  throw new Error(`${TERMS} no longer names the exchanges in 10.6`);
}
const fees = pdfText(await fetchWith(FEES, { kind: "bytes" }));
if (!/A\$2 brokerage for all trades up to A\$20,000/.test(fees) || !/US\$2 brokerage for all trades up to US\$20,000/.test(fees)) {
  throw new Error(`${FEES} no longer shows the A$2 / US$2 brokerage`);
}
for (const [label, text] of [["pricing", pricing], ["terms", terms]]) {
  if (/\b(OTC|over-the-counter)\b/i.test(text) || /\b\d{1,3}(,\d{3})+\+?\s+(US\s+)?(stocks|shares|ETFs)\b/i.test(text)) {
    console.error(`Superhero's ${label} now speak of OTC lines or a number of titles: look again`);
  }
}

const { rows: asx, dropped } = await asxBook();
const asxKept = new Set(asx.map((row) => row.ticker));
const both = await australianRows({ places: ["ASX", "Cboe Australia"] });
const cboe = both.rows.filter(
  (row) => row.exchange === "Cboe Australia" && (row.raw.endsWith("Cboe listed list") || asxKept.has(row.ticker))
);
if (cboe.length < 2000) throw new Error(`only ${cboe.length} Cboe Australia rows`);
for (const [ticker, exchange] of [["BHP", "ASX"], ["BHP", "Cboe Australia"], ["VAS", "ASX"], ["NWSLV", "ASX"]]) {
  if (![...asx, ...cboe].some((row) => row.ticker === ticker && row.exchange === exchange)) throw new Error(`${ticker} is missing on ${exchange}`);
}

const us = await usBook();
const kept = stampRows(withoutObligations([...asx, ...cboe, ...us]));
if (kept.filter((row) => row.currency === "USD").length < 10_000) throw new Error("short US book");
fs.writeFileSync(new URL("superhero-parsed.json", import.meta.url), JSON.stringify(kept, null, 2));

logCounts(kept, dropped);
console.error(`US left out: ${Object.entries(us.report.leftOut).map(([what, list]) => `${list.length} ${what}`).join(", ")}`);
