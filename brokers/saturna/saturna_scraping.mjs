// What Saturna Brokerage Services (Saturna Brokerage Services, Inc.,
// accounts carried by Pershing on a fully disclosed basis) sells in shares
// and exchange-traded products, with no login. Its "Guide to Saturna
// Brokerage Services" (brochure SBS-20240524-A) says online clients can
// "Buy or sell stocks, ETFs, ETNs, and non-Saturna mutual funds", lists
// "Stocks, ETFs, ETNs, Bonds, Non-Saturna Mutual Funds, Money Market
// Funds, Cash" in the Pershing account, and prices "Stocks" at $14.95
// online and $24.95 broker-assisted, adding "1¢ per share for each share
// over 1,000 (if share price < $1, add ¼¢ per share)". No page names a
// list of securities, a board, a segment or a kind of listed share it does
// not take, so the book is the whole US exchange book of the day, read by
// ../wellstrade/usBook.mjs (shares, ADRs, REITs, preferreds, closed-end
// funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe
// BZX and the Texas Stock Exchange; warrants, rights, units, when-issued
// lines, listed notes and halted lines are left out there). The US is one
// NBBO market: one row per title on its primary listing, in dollars.
//
// Left out: OTC Markets lines, which no Saturna page names; bonds
// (withoutObligations); mutual funds, which are not exchange-listed.
// Foreign markets ("Purchasing securities in a foreign market may incur
// additional fees", a foreign custody fee of $2 a month) are another
// place, not this one.
//
// Fees: the commission schedule page answers scripts with a Cloudflare
// challenge (403), so the run checks the same schedule in the brochure,
// page 3 ("Commission Schedule"):
//   https://www.saturna.com/services/commission-schedule
//   https://www.saturna.com/sites/saturna.com/files/files/sbs-brochure.pdf
// The brochure is read with PyMuPDF (python3 -c "import fitz").
//
//   node brokers/saturna/saturna_scraping.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BROCHURE = "https://www.saturna.com/sites/saturna.com/files/files/sbs-brochure.pdf";

function pdfText(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "saturna-"));
  const file = path.join(dir, "brochure.pdf");
  fs.writeFileSync(file, bytes);
  let python;
  try {
    python = spawnSync("python3", ["-c", "import fitz, sys\nsys.stdout.write('\\n'.join(page.get_text() for page in fitz.open(sys.argv[1])))", file], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (python.status !== 0) throw new Error(`could not read the brochure: ${(python.stderr || "").trim().slice(0, 400)}`);
  return python.stdout;
}

// The brochure still says what the header quotes, or the run stops.
const response = await fetch(BROCHURE, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`${response.status} ${BROCHURE}`);
const text = pdfText(Buffer.from(await response.arrayBuffer())).replace(/\s+/g, " ");
for (const pattern of [
  /Commission Schedule/,
  /Stocks ?1 \$14\.95 \$24\.95 Add 1¢ per share for each share over 1,000/,
  /Buy or sell stocks, ETFs, ETNs, and non-Saturna mutual funds/,
  /Stocks, ETFs, ETNs, Bonds, Non-Saturna Mutual Funds/,
]) {
  if (!pattern.test(text)) throw new Error(`${BROCHURE} no longer says ${pattern}`);
}

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("saturna-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
