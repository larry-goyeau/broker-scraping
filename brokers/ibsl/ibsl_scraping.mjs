// What Islami Bank Securities Limited (IBSL, Bangladesh) lets its clients
// trade, with no login. IBSL is a Shariah broker: its "Markets > Shariah
// Stock List" page links one public PDF, "Tradeable Stock List at IBSL"
// (the page dates it "As on 22.04.2026"). The PDF numbers each line inside
// its section (bank, insurance, financial institution, mutual fund,
// corporate bond, then the industry sectors, then a "DSE SME" section) and
// prints the Dhaka trading code, the name in brackets and the sector. All of
// it is on the Dhaka Stock Exchange; broker-list.json gives IBSL that one
// place. Every line is in taka.
//
//   https://www.islamibanksecurities.com/Markets/ShariahStockList.php
//   https://www.islamibanksecurities.com/Markets/PDF/Tradeable%20Stock%20List%20at%20IBSL.pdf
//   https://www.islamibanksecurities.com/Services/NRBBrokerageService.php  (fees: 0.40%)
//   https://www.dse.com.bd/companies                                (main board codes)
//   https://sme.dsebd.org/sme_latest_share_price_scroll_l.php       (SME board codes)
//
// Rules:
// - The PDF text is read with python3 and pypdf. A line is "serial CODE
//   ( name ) sector". The serial restarts at 1 for each section and goes on
//   across a page break; any other gap stops the run.
// - The 5 Mudaraba perpetual bonds and the sukuk (sector "Corporate Bond")
//   are debt and stay out. The 5 closed-end mutual funds (sector "Mutual
//   Fund") stay out as other products, as the IDLC and LankaBangla files do.
// - The rest is STOCK. No ETF is listed in Dhaka.
// - A main-board code must be on the exchange's company directory. Three
//   codes changed after the PDF was written, and the directory prints the
//   same company under its new code: LHBL is LHB (LafargeHolcim
//   Bangladesh), BSCCL is BSCPLC (Bangladesh Submarine Cables, ISIN
//   BD0002BSCCL0) and SALVOCHEM is SALVO (Salvo Chemical Industry, now Salvo
//   Organic Industries, same scrip code 13025). Those rows carry the new
//   code and the exchange's name. Any other code the directory does not
//   print is no longer listed (Beximco Synthetics went private in 2020) and
//   stays out; the run lists them.
// - An SME code must be on the DSE SME board's price page. SME shares trade
//   on the Dhaka Stock Exchange (XDHA), so they get the same exchange.
// - Five banks the PDF still prints (EXIM, First Security Islami, Global
//   Islami, Social Islami, Union) were declared non-operational on
//   5 November 2025 and merged into Sammilito Islami Bank. Dhaka halted
//   their shares on 6 November 2025 until further notice and the central
//   bank values them at zero, so they stay out, as in the BRAC EPL file.
//     https://en.prothomalo.com/business/local/jqzqvqbpxd
//     https://www.thedailystar.net/business/news/five-merged-banks-asked-declare-zero-shares-4063966
// - ISIN: the shared lists (assets/stocks.csv, assets/etfs.csv) file Dhaka
//   codes under DSEBD. A row takes the ISIN filed there for its code, after
//   stampRows. No ISIN is guessed; a code the lists do not file keeps none.
//
//   node brokers/ibsl/ibsl_scraping.mjs

import { stampRows } from "../../accepted.mjs";
import { withoutObligations } from "../../obligation.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const LIST_PAGE = "https://www.islamibanksecurities.com/Markets/ShariahStockList.php";
const PDF = "https://www.islamibanksecurities.com/Markets/PDF/Tradeable%20Stock%20List%20at%20IBSL.pdf";
const DSE = "https://www.dse.com.bd/companies";
const SME = "https://sme.dsebd.org/sme_latest_share_price_scroll_l.php";
const OUTPUT = new URL("ibsl-parsed.json", import.meta.url);

const HALTED = new Set(["EXIMBANK", "FIRSTSBANK", "GIB", "SIBL", "UNIONBANK"]);
// PDF code -> current Dhaka code, and what the directory must call it.
const RENAMED = {
  LHBL: { code: "LHB", name: /^LafargeHolcim Bangladesh\b/i },
  BSCCL: { code: "BSCPLC", name: /^Bangladesh Submarine Cables?\b/i },
  SALVOCHEM: { code: "SALVO", name: /^Salvo\b/i },
};

function clean(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function get(url, as = "text") {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: as === "text" ? "text/html" : "application/pdf" },
        redirect: "follow",
        signal: AbortSignal.timeout(120_000),
      });
      if (response.ok) {
        if (as === "text") return await response.text();
        return Buffer.from(await response.arrayBuffer());
      }
      last = `${response.status} ${url}`;
    } catch (error) {
      last = `${error.message || error} ${url}`;
    }
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(last);
}

// curl, not fetch: the SME server does not send its intermediate
// certificate, which Node rejects and curl completes from the system store.
function curl(url) {
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = spawnSync("curl", ["-fsSL", "--compressed", "-m", "90", "-A", UA, "-H", "Accept: text/html", url], {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
    if (result.status === 0 && result.stdout.includes("<")) return result.stdout;
    last = `${result.stderr || "empty page"} ${url}`;
    spawnSync("sleep", [String(attempt + 1)]);
  }
  throw new Error(last);
}

// pypdf, run from an empty folder so nothing beside the PDF is imported.
function pdfText(bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ibsl-"));
  const file = path.join(dir, "list.pdf");
  fs.writeFileSync(file, bytes);
  const script = [
    "from pypdf import PdfReader",
    "import sys",
    "reader = PdfReader(sys.argv[1])",
    "sys.stdout.write('\\n'.join((page.extract_text() or '') for page in reader.pages))",
  ].join("; ");
  const result = spawnSync("python3", ["-E", "-c", script, file], { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  fs.rmSync(dir, { recursive: true, force: true });
  if (result.status !== 0) throw new Error(result.stderr || "python3 could not read the IBSL list (pypdf).");
  return result.stdout;
}

// "21 KAY&QUE ( Kay & Que (Bangladesh) Ltd. ) Engineering"
function pdfLines(text) {
  const lines = [];
  let section = -1;
  let expected = 0;
  for (const line of text.split(/\r?\n/).map((value) => value.replace(/\s+/g, " ").trim())) {
    const match = line.match(/^(\d+) ([A-Z0-9&.\-]+(?:\([A-Z]+\))?) ?\((.*)\) ([A-Za-z&][A-Za-z& ]*)$/);
    if (!match) continue;
    const serial = Number(match[1]);
    if (serial === 1) {
      section += 1;
      expected = 1;
    }
    if (serial !== expected) throw new Error(`serial ${serial} where ${expected} was due: ${line}`);
    expected += 1;
    lines.push({ serial, section, code: match[2], name: clean(match[3]), sector: clean(match[4]), raw: line });
  }
  return lines;
}

// Dhaka directory card: code, name, sector.
function dhakaDirectory(html) {
  const card =
    /class="block flex-1 min-w-0" href="\/company\/([^"]+)"[\s\S]{0,1600}?font-semibold tracking-tight">([^<]+)<\/span>[\s\S]{0,900}?text-muted\)">([^<]*)<span class="hidden md:inline"> · <!-- -->([^<]+)<\/span>/g;
  const directory = new Map();
  for (const match of html.matchAll(card)) {
    directory.set(clean(match[2]).toUpperCase(), { name: clean(match[3]), sector: clean(match[4]) });
  }
  return directory;
}

function smeCodes(html) {
  return new Set([...html.matchAll(/sme_displayCompany\.php\?name=([^"&]+)/gi)].map((match) => clean(match[1]).toUpperCase()));
}

function dhakaIsins() {
  const byCode = new Map();
  for (const file of ["../../assets/stocks.csv", "../../assets/etfs.csv"]) {
    for (const line of fs.readFileSync(new URL(file, import.meta.url), "utf8").split(/\r?\n/)) {
      const [code, place, isin] = line.split(",");
      if (place === "DSEBD" && /^BD[0-9A-Z]{10}$/.test(isin || "")) byCode.set(code.slice("DSEBD:".length), isin);
    }
  }
  return byCode;
}

const listPage = await get(LIST_PAGE).catch(() => "");
const asOn = clean(listPage).match(/Shariah Stock List As on (\d{2}\.\d{2}\.\d{4})/i)?.[1] || "unknown";
const lines = pdfLines(pdfText(await get(PDF, "binary")));
await sleep(500);
const dhaka = dhakaDirectory(await get(DSE));
await sleep(500);
const sme = smeCodes(curl(SME));

if (lines.length < 250) throw new Error(`the PDF gave ${lines.length} lines`);
if (dhaka.size < 550) throw new Error(`Dhaka directory has ${dhaka.size} codes`);
if (sme.size < 10) throw new Error(`the SME board has ${sme.size} codes`);
const lastSection = Math.max(...lines.map((line) => line.section));
const smeLines = lines.filter((line) => line.section === lastSection);
if (smeLines.some((line) => !sme.has(line.code) && !dhaka.has(line.code))) {
  throw new Error("the last section is not the DSE SME section");
}

const rows = [];
const left = { debt: [], funds: [], halted: [], unlisted: [] };
const renamed = [];
const seen = new Set();
for (const line of lines) {
  const sector = line.sector.toLowerCase();
  if (sector === "corporate bond") {
    left.debt.push(line.code);
    continue;
  }
  if (sector === "mutual fund") {
    left.funds.push(line.code);
    continue;
  }
  if (HALTED.has(line.code)) {
    left.halted.push(line.code);
    continue;
  }
  let code = line.code;
  let name = line.name;
  let board = "Main";
  if (line.section === lastSection && sme.has(code)) {
    board = "SME";
  } else if (dhaka.has(code)) {
    // listed as printed
  } else if (RENAMED[code]) {
    const next = RENAMED[code];
    const listed = dhaka.get(next.code);
    if (!listed || !next.name.test(listed.name)) throw new Error(`${code} -> ${next.code} is not in the Dhaka directory as expected`);
    renamed.push(`${code}->${next.code}`);
    code = next.code;
    name = listed.name;
  } else {
    left.unlisted.push(line.code);
    continue;
  }
  if (seen.has(code)) continue;
  seen.add(code);
  rows.push({
    query: code,
    ticker: code,
    name,
    exchange: "Dhaka Stock Exchange",
    mic: "XDHA",
    currency: "BDT",
    type: "STOCK",
    isin: "",
    raw: board === "SME" ? `${line.raw} | DSE SME` : code === line.code ? line.raw : `${line.raw} | DSE code ${code}`,
  });
}

for (const ticker of ["ISLAMIBANK", "GP", "SQURPHARMA", "BEXIMCO", "KBSEED"]) {
  if (!rows.some((row) => row.ticker === ticker)) throw new Error(`${ticker} missing`);
}
if (rows.some((row) => /PBOND|SUKUK/.test(row.ticker) || /mutual fund/i.test(row.name))) {
  throw new Error("a bond or a fund stayed in the file");
}
if (left.unlisted.length > 10) throw new Error(`too many codes off the Dhaka directory: ${left.unlisted.join(" ")}`);

rows.sort((a, b) => a.ticker.localeCompare(b.ticker));
const stamped = stampRows(withoutObligations(rows));
const isins = dhakaIsins();
for (const row of stamped) if (!row.isin && isins.has(row.ticker)) row.isin = isins.get(row.ticker);
for (const row of stamped) if (row.isin) row.query = row.isin;
fs.writeFileSync(OUTPUT, JSON.stringify(stamped, null, 2));

const withIsin = stamped.filter((row) => row.isin).length;
const smeRows = stamped.filter((row) => row.raw.endsWith("| DSE SME")).length;
console.error(`list as on ${asOn}: ${lines.length} PDF lines, ${stamped.length} rows (${smeRows} SME), ${withIsin} with an ISIN`);
console.error({ renamed, ...left, noIsin: stamped.filter((row) => !row.isin).map((row) => row.ticker) });
