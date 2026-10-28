// What Freedom Broker Uzbekistan (IP OOO "Freedom Finance", Tashkent,
// ffin.uz) sells in shares, with no login. Its tariff for individuals
// prices one place: "Организованный биржевой рынок, а также организованный
// внебиржевой рынок АО РФБ «Тошкент»", shares "От 1 сум до 1млрд. UZS –
// 1,00 % от суммы сделки" (2,0 % at an IPO/SPO), bonds apart. Its
// brokerage page lists "Акции", "Облигации" and "IPO" as the instruments,
// all on the Republican Stock Exchange "Tashkent" (UZSE), and names no
// share, board or segment it does not take. broker-list.json gives one
// place, Tashkent Republican Stock Exchange, with no restriction.
//
// So the book is the whole share market of UZSE: the quotation-list
// shares (Premium, Standard, Transit, Privatizatsiya; ordinary and
// preferred) and, because the tariff names the organised off-exchange
// market of the same exchange, the shares of its off-exchange board (ВТП)
// that have traded. Uzbekistan lists no ETF, ETN or ETC. Left out, as the
// shared reader does: bonds, issuers in the quotation list for their bonds
// only, suspended lines (the exchange's suspension and resumption
// notices), lines in liquidation, never-traded lines, and codes that are
// not Uzbek share codes. Every line trades in sums (UZS). The reading is
// in ./uzseBook.mjs, shared with Jett.
//
//   https://ffin.uz/file/2026/09/16/tarify_fiz_lits__2__docx.docx   (tariff)
//   https://ffin.uz/brokerskoe-obsludgivanie
//   https://ffin.uz/documents
//   https://uzse.uz/isu_infos
//   https://uzse.uz/isu_infos/names?mkt_id=STK
//   https://uzse.uz/otcmarkets/isu_elsis
//   https://uzse.uz/boards/notice/list?page=<n>
//
//   node brokers/freedomuzbekista/freedomuzbekista_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import { uzseListings } from "./uzseBook.mjs";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const TARIFF = "https://ffin.uz/file/2026/09/16/tarify_fiz_lits__2__docx.docx";
const OUTPUT = new URL("freedomuzbekista-parsed.json", import.meta.url);

const EVIDENCE = [
  /Организованный биржевой рынок, а также\s*организованный внебиржевой рынок АО РФБ «Тошкент»/,
  /От 1 сум до 1\s*млрд\. UZS – 1,00 % от суммы сделки/,
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function download(url) {
  let last = "";
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt) await sleep(2000 * attempt);
    try {
      const response = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      last = `${url} answered ${response.status}`;
    } catch (error) {
      last = `${url}: ${error.message || error}`;
    }
  }
  throw new Error(last);
}

// The text of the tariff .docx, read with the system unzip.
async function tariffText() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ffin-"));
  const file = path.join(dir, "tariff.docx");
  fs.writeFileSync(file, await download(TARIFF));
  try {
    const xml = await new Promise((resolve, reject) =>
      execFile("unzip", ["-p", file, "word/document.xml"], { maxBuffer: 20_000_000, encoding: "utf8" }, (error, stdout) =>
        error ? reject(error) : resolve(stdout),
      ),
    );
    return xml
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/[ \t]+/g, " ");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const tariff = await tariffText();
for (const pattern of EVIDENCE) if (!pattern.test(tariff)) throw new Error(`${TARIFF} no longer says ${pattern}`);

const { rows, leftOut, listed, otc, orderDay, noticesRead } = await uzseListings({ otc: true });
rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
const stamped = stampRows(withoutObligations(rows));
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

for (const ticker of ["URTS", "SQBN", "AGMK", "AGMKP"]) {
  if (!stamped.some((row) => row.ticker === ticker)) throw new Error(`${ticker} is missing from the Freedom Broker Uzbekistan catalogue`);
}
console.error(`UZSE order list of ${orderDay}; ${noticesRead} suspension notices read`);
console.error(`quotation list: ${listed}; off-exchange board: ${otc}; dropped as bonds: ${rows.length - stamped.length}`);
console.error(`left out (${leftOut.length}): ${leftOut.slice(0, 40).join("; ")}${leftOut.length > 40 ? " ..." : ""}`);
console.error(`wrote ${OUTPUT.pathname} (${stamped.length} rows)`);
