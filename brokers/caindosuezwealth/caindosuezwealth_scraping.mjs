// What CA Indosuez Wealth (Europe) (the Crédit Agricole private bank in
// Luxembourg) buys for its clients on the US place, with no login. Its
// best execution and broker selection policy (July 2025) lists, per type
// of asset, "US equities and equivalent securities (ETF)", executed on
// Bloomberg MTF or through brokers (Canaccord, Citigroup, Goldman Sachs,
// Intesa Sanpaolo, Instinet, JP Morgan, Stifel Europe, UBS, Kepler, RBC),
// and says the policy "applies to all financial instruments admitted or
// not admitted for trading on Regulated Markets or Multilateral Trading
// Systems on which we may act on your behalf". The bank publishes no list
// of titles and names no board, segment or kind of listed share left out,
// so the catalogue is the whole US exchange book of the day
// (../wellstrade/usBook.mjs): shares, ADRs, REITs, partnership units,
// preferreds, closed-end funds, ETFs and ETNs on Nasdaq, NYSE, NYSE
// American, NYSE Arca, Cboe BZX and the Texas Stock Exchange, less the
// lines with an open trade halt.
//
//   https://luxembourg.ca-indosuez.com/en/pdfPreview/40796   (best execution policy)
//
// KID (broker-list: "No US-domiciled ETFs (PRIIPs/KID)"). The general
// terms (art. 4.1.2) say that for PRIIPs "such as ... units in
// undertakings for collective investment" the bank "provides the retail
// Client, for each product it sells or distributes, with a key investor
// information document", and that "a KIID might not be accessible or
// available, therefore rendering its provision impossible". A US ETF or
// ETN has no PRIIPs KID, so an EEA retail client cannot buy it; a
// professional client or a client living outside the EEA can. It depends
// on the client, so the lines stay and carry `nonEuResident` (as
// boursedirect and targobankde do): every ETF and ETN whose ISIN is not
// from an EEA country (all of them on 25 October 2026: US, CA, KY or no
// ISIN). Shares, preferreds and closed-end funds are not touched.
//   https://luxembourg.ca-indosuez.com/en/pdfPreview/45073   (general terms)
//
// Left out, as in the other US catalogues: warrants and rights, units,
// when-issued lines and listed notes (usBook), and bonds
// (withoutObligations). OTC Markets lines are not added: the policy speaks
// of regulated markets and MTFs. The US is one NBBO market: one row per
// title, on its primary listing, in dollars. The European and Asian
// equities the same policy lists are other places, not in this file.
//
// Fees: "Transactions in financial instruments (per transaction)",
// "Equities 1.30%" below EUR 2M of assets deposited (1.15%, 1.00%, 0.75%
// above), "EUR Minimum 150", excluding broker fees; custody 0.40% a year
// (minimum EUR 500 a quarter); spot FX 2.10% up to EUR 50k for USD
// (Basket 1). Fee schedule applicable from 1 September 2025:
//   https://luxembourg.ca-indosuez.com/en/pdfPreview/66904
//
//   node brokers/caindosuezwealth/caindosuezwealth_scraping.mjs

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { EEA, stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { usBook } from "../wellstrade/usBook.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const PDF = (id) => `https://luxembourg.ca-indosuez.com/en/pdfPreview/${id}`;
const pause = () => new Promise((resolve) => setTimeout(resolve, 1000));

async function download(url) {
  const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function pdfText(bytes) {
  const file = path.join(os.tmpdir(), `caindosuezwealth-${process.pid}.pdf`);
  fs.writeFileSync(file, bytes);
  const script = "from pypdf import PdfReader\nimport sys\nsys.stdout.write('\\n'.join((p.extract_text() or '') for p in PdfReader(sys.argv[1]).pages))";
  const result = spawnSync("python3", ["-c", script, file], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  fs.rmSync(file, { force: true });
  if (result.status !== 0) throw new Error(result.stderr || "python3 could not read an Indosuez PDF (pypdf)");
  return result.stdout.replace(/\s+/g, " ");
}

// The documents still say what the header quotes, or the run stops.
async function evidence(id, patterns) {
  const text = pdfText(await download(PDF(id)));
  for (const pattern of patterns) if (!pattern.test(text)) throw new Error(`${PDF(id)} no longer says ${pattern}`);
}

await evidence(66904, [/Equities 1\.30% 1\.15% 1\.00% 0\.75%/, /EUR Minimum 150 150 150 150/]);
await pause();
await evidence(40796, [/US equities and equivalent securities \(ETF\) Bloomberg MTF/i]);
await pause();
await evidence(45073, [/retail Client, for each product it sells or distributes, with a key investor/i, /KIID might not be acces-? ?sible/i]);

const book = await usBook();
const rows = stampRows(withoutObligations(book).map((row) => {
  if (row.type === "STOCK") return row;
  const countries = [row.isin, ...(row.matches || [])].filter((id) => /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(id || "")).map((id) => id.slice(0, 2));
  return countries.some((code) => EEA.includes(code)) ? row : { ...row, nonEuResident: true };
}));
if (rows.length < 10000) throw new Error(`only ${rows.length} rows`);
fs.writeFileSync(new URL("caindosuezwealth-parsed.json", import.meta.url), JSON.stringify(rows, null, 2));

const counts = {};
for (const row of rows) counts[`${row.mic} ${row.type}`] = (counts[`${row.mic} ${row.type}`] || 0) + 1;
console.error(`${rows.length} rows (${Object.entries(counts).map(([label, n]) => `${n} ${label}`).join(", ")})`);
console.error(`${rows.filter((row) => row.nonEuResident).length} ETFs and ETNs marked nonEuResident (no PRIIPs KID)`);
console.error(`directories ${JSON.stringify(book.report.directories)}; halts: ${book.report.halts.join(", ")}`);
for (const [what, list] of Object.entries(book.report.leftOut)) if (list.length) console.error(`left out ${list.length} ${what}`);
if (rows.length < book.length) console.error(`${book.length - rows.length} bonds left out`);
