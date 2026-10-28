// What Mashreq (Mashreqbank PSC, through Mashreq NEO; orders go to the
// executing broker DriveWealth LLC) sells in its "US Stocks & ETFs"
// platform, with no login. The product page offers a "Wide selection of
// 3000+ US Stocks & ETFs" ("Access over 3,000 US stocks and ETFs"); the
// Key Facts Statement says Mashreq lets clients "invest in stocks and
// Exchange-Traded Funds (ETFs) through a third-party executing broker,
// DriveWealth LLC", fractional included. The 3,000 lines are listed in the
// app only, and no page names a board, a segment or a kind of listed share
// or fund left out. The book they are taken from is the whole US exchange
// book of the day (../wellstrade/usBook.mjs): shares, ADRs, REITs,
// partnership units, preferreds, closed-end funds, ETFs and ETNs on
// Nasdaq, NYSE, NYSE American, NYSE Arca, Cboe BZX and the Texas Stock
// Exchange, less the lines with an open trade halt (about 12,000 lines).
//
//   https://www.mashreq.com/en/uae/neo/investments/investments-us-stocks-etf/
//
// Owner rule 2026-10-25: the N most popular. The product page gives the
// size of the offer on this place, "Wide selection of 3000+ US Stocks &
// ETFs" (one figure for both kinds), so N = 3,000 and the catalogue keeps
// the 3,000 most popular lines of the book, shares, ETFs and ETNs ranked
// together by 30-day average traded value in dollars
// (../wellstrade/usPopular.mjs).
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: no page names
// them. The US is one NBBO market: one row per title, on its primary
// listing, in dollars.
//
// Remarks, not removals (they depend on the client): the platform is in
// the Mashreq Mobile App for Mashreq NEO customers; the PDT rule applies
// below USD 25,000.
//
// Fees ("Your first 10 executed or pending orders each month are
// completely free. After that, a 0.2% fee applies to each trade ... with a
// minimum fee of USD 1", plus 5% VAT on the fee when applicable):
//   https://mashreq.com/-/jssmedia/campaigns-media/pb-campaigns/investments-us-stocks-etf/investments-us-stocks-etf-kfs-en-ar.ashx
//
//   node brokers/mashrequsetfs/mashrequsetfs_scraping.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";
import { topN } from "../wellstrade/usPopular.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAGE = "https://www.mashreq.com/en/uae/neo/investments/investments-us-stocks-etf/";
const KFS = "https://mashreq.com/-/jssmedia/campaigns-media/pb-campaigns/investments-us-stocks-etf/investments-us-stocks-etf-kfs-en-ar.ashx";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

async function download(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function pdfText(bytes) {
  const file = path.join(os.tmpdir(), `mashrequsetfs-${process.pid}.pdf`);
  fs.writeFileSync(file, bytes);
  const script = "from pypdf import PdfReader\nimport sys\nsys.stdout.write('\\n'.join((p.extract_text() or '') for p in PdfReader(sys.argv[1]).pages))";
  const result = spawnSync("python3", ["-c", script, file], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  fs.rmSync(file, { force: true });
  if (result.status !== 0) throw new Error(result.stderr || "python3 could not read the Mashreq KFS (pypdf)");
  return result.stdout;
}

const flat = (text) => text.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&").replace(/&#39;|&rsquo;|’/g, "'").replace(/&nbsp;|\s+/g, " ").replace(/\s+/g, " ");

// The pages still say what the header quotes, or the run stops.
function check(url, text, patterns) {
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

check(PAGE, flat((await download(PAGE)).toString("utf8")), [
  /Wide selection of 3000\+ US Stocks & ETFs/i,
  /0\.20% fee applies to each trade/i,
]);
await pause();
check(KFS, pdfText(await download(KFS)).replace(/\s+/g, " "), [
  /invest in stocks and Exchange- ?T ?raded Funds \(ETFs\) through a third-party executing broker, DriveWealth LLC/i,
  /0\.2% fee applies to each trade, based on the investment amount, with a minimum fee of USD 1/i,
]);

const N = 3000;
const book = await usBook();
const all = stampRows(withoutObligations(book));
if (all.length < 10000) throw new Error(`only ${all.length} rows in the book`);
const rows = await topN(all, N);
if (rows.length !== N) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("mashrequsetfs-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));
const { report } = rows;
console.error(`kept the ${N} most popular of ${report.among} lines; #${N}: ${report.cutoff.text}; first left out: ${report.firstLeftOut}`);

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (all.length < book.length) console.error(`${book.length - all.length} bonds left out`);
