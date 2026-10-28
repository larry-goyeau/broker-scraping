// What Desert Financial Credit Union (Arizona) sells in shares and
// exchange-traded products, with no login. "Desert Financial Digital
// Investing" runs in its online banking and app; brokerage is TAPP Engine
// Securities, LLC ("TES"), which clears through RQD Clearing. The page
// says "Just $5 can get you in on partial shares of stocks, ETFs and more"
// and lists research, practice trading and real-time trading; it names no
// list and no board, segment or kind of listed share left out. TES's Form
// CRS says what its partners can offer: "only the ability to trade stocks
// (including Exchange-Traded Funds (ETF)s) and Options".
//
//   https://www.desertfinancial.com/en/invest-and-insure/digital-investing
//   https://www.tappengine.com/disclosure-library   (Form CRS)
//
// So the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds and ETFs on Nasdaq, NYSE, NYSE American,
// NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the lines with an
// open trade halt. Left out: ETNs, which are notes, neither stocks nor ETFs
// (the Form CRS says "only"); warrants and rights, units, when-issued lines
// and listed notes (usBook), and bonds (withoutObligations). OTC Markets
// lines are not named and are not added. The US is one NBBO market: one
// row per title on its primary listing, in dollars.
//
// Fees: "For just $3.50 per month, or free for Rewards+ members, you get
// all the perks of Desert Financial Digital Investing", which include
// "real-time trading" (the robo-advisor adds 0.35% a year); TES's Form
// CRS: "All transactions are commission free" and "There are no
// transaction fees such as commissions for brokerage services".
//   https://www.desertfinancial.com/en/invest-and-insure/digital-investing
//   https://www.tappengine.com/disclosure-library   (Form CRS)
//
//   node brokers/desertcreditunio/desertcreditunio_scraping.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PAGE = "https://www.desertfinancial.com/en/invest-and-insure/digital-investing";
const LIBRARY = "https://www.tappengine.com/disclosure-library";
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

async function get(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

const plain = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x2019;|&rsquo;|[‘’]/g, "'")
    .replace(/\s+/g, " ");

function pdfText(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desert-"));
  const file = path.join(dir, "crs.pdf");
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
  if (python.status !== 0) throw new Error(`could not read the Form CRS: ${(python.stderr || "").trim().slice(0, 400)}`);
  return python.stdout.replace(/\s+/g, " ");
}

// The pages still say what the header quotes, or the run stops.
function check(url, text, patterns) {
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${url} no longer says ${pattern}`);
}

check(PAGE, plain((await get(PAGE)).toString("utf8")), [
  /For just \$3\.50 per month, or free for Rewards\+ members/i,
  /partial shares of stocks, ETFs and more/i,
  /TAPP Engine Securities/i,
]);
await pause();
const library = (await get(LIBRARY)).toString("utf8");
const crs = [...library.matchAll(/href="([^"]+\.pdf)"[^>]*>([\s\S]{0,400}?)<\/a>/g)].find((m) => /Form CRS/i.test(plain(m[2])));
if (!crs) throw new Error(`${LIBRARY} no longer links a Form CRS`);
await pause();
check(crs[1], pdfText(await get(crs[1])), [
  /only the ability to trade stocks \(including Exchange-Traded Funds \(ETF\)s\) and Options/i,
  /All transactions are commission free/i,
  /no transaction fees such as commissions/i,
]);

const book = await usBook();
const etns = book.filter((row) => row.type === "ETN");
const rows = stampRows(withoutObligations(book.filter((row) => row.type !== "ETN")));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("desertcreditunio-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}; Form CRS ${crs[1]}`);
console.error(`left out ${etns.length} ETNs`);
