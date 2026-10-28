// What Self-Directed Investing by First Citizens (First Citizens Investor
// Services, Inc., First Citizens Bank's broker-dealer) sells in shares and
// exchange-traded products, with no login. Its page says "Trade listed
// stocks and ETFs commission-free with Self-Directed Investing" and
// "Trades of US-based stocks and ETFs listed on the major US stock
// exchanges (e.g. NASDAQ, NYSE) are commission-free. Trading foreign
// stocks or ETFs, among other assets, will result in a fee." The
// Commission and Fee Schedule (effective 1 December 2023) prices "Stocks &
// ETFs" at $0 self-directed online, "Over-the Counter (OTC) equities" at
// $6.95 and call-center trades at $40 (+ $0.03 a share over 1,000). No
// page names a list of securities, a board, a segment or a kind of listed
// share it does not take, so the book is the whole US exchange book of the
// day, read by ../wellstrade/usBook.mjs (shares, ADRs, REITs, preferreds,
// closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE American, NYSE
// Arca, Cboe BZX and the Texas Stock Exchange; warrants, rights, units,
// when-issued lines, listed notes and halted lines are left out there).
// The US is one NBBO market: one row per title on its primary listing, in
// dollars.
//
// Not removals, remarks: the $0 commission "excludes shares priced less
// than $3.00 or not trading on an exchange" (those pay a fee, they are
// still sold), and foreign stocks pay a $75 "Foreign Securities
// Surcharge".
//
// Not added: OTC Markets lines. The schedule prices "Over-the Counter
// (OTC) equities" at $6.95 and says "Opening buy transactions of equities
// traded on the Pink Sheets or Bulletin Board [are] not eligible to be
// purchased online". The OTC Markets tier lists are only read through a
// headless browser (../moomoous/moomoous_otc.mjs, whose caches live in that
// broker's folder), so this catalogue holds the exchange-listed book only;
// the OTC lines are a known gap. Bonds are out (withoutObligations), and
// mutual funds are not exchange-listed.
//
//   https://www.firstcitizens.com/content/dam/firstcitizens/pdfs/hosted/wealth/self-directed-investing-fee-schedule.pdf   (fees)
//   https://www.firstcitizens.com/personal/investments/self-directed-investing
// The schedule is read with PyMuPDF (python3 -c "import fitz").
//
//   node brokers/firstcitizens/firstcitizens_scraping.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const FEES = "https://www.firstcitizens.com/content/dam/firstcitizens/pdfs/hosted/wealth/self-directed-investing-fee-schedule.pdf";
const PAGE = "https://www.firstcitizens.com/personal/investments/self-directed-investing";

async function get(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function pdfText(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "firstcitizens-"));
  const file = path.join(dir, "fees.pdf");
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
  if (python.status !== 0) throw new Error(`could not read the fee schedule: ${(python.stderr || "").trim().slice(0, 400)}`);
  return python.stdout;
}

function check(url, text, patterns) {
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

// The pages still say what the header quotes, or the run stops.
check(FEES, pdfText(await get(FEES)).replace(/\s+/g, " "), [
  /Stocks & ETFs\* Self-directed Online Trading \$0/,
  /Over-the Counter \(OTC\) equities\*\* \$6\.95/,
  /Excludes shares priced less than \$3\.00 or not trading on an exchange/,
]);
await new Promise((resolve) => setTimeout(resolve, 1000));
const page = (await get(PAGE)).toString("utf8").replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|\s+/g, " ");
check(PAGE, page, [/Trades of US ?-based stocks and ETF ?s listed on the major US stock exchanges/, /Trading foreign stocks or ETF ?s, among other assets, will result in a fee/]);

const book = await usBook();
const rows = stampRows(withoutObligations(book));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("firstcitizens-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows`, counts);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
